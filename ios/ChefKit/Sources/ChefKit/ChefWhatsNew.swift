@preconcurrency import Combine
import Foundation
import SwiftUI

// "What's new": on launch, ChefKit asks `<prefix>:whatsNew({ since })` for the changelogs that
// shipped since this device last looked and, if there are any, shows a sheet from the overlay
// window (so it floats above the host app). The first launch only records "now", so new users
// don't get the whole backlog.

/// `<prefix>:whatsNew` row: one shipped change, written by the app's admin.
struct ChefWhatsNewEntry: Decodable, Sendable, Identifiable, Hashable {
    let id: String
    let text: String
    /// When it shipped (ms since 1970).
    let at: Double
}

/// The "What's new" sheet's content (the sheet is up while ChefModel.whatsNew is non-nil).
struct ChefWhatsNewState: Identifiable, Equatable {
    let id = UUID()
    let entries: [ChefWhatsNewEntry]
    /// Dismissing marks everything up to here as seen (the time it was fetched).
    let seenUpTo: Double
    let prefix: String
}

/// Where the "last seen" time lives: UserDefaults "ChefKit.whatsNewSeen.<prefix>" (Double, ms).
enum ChefWhatsNewStore {
    static func key(_ prefix: String) -> String { "ChefKit.whatsNewSeen.\(prefix)" }

    static func seen(prefix: String, defaults: UserDefaults = .standard) -> Double? {
        guard defaults.object(forKey: key(prefix)) != nil else { return nil }
        let v = defaults.double(forKey: key(prefix))
        return v.isFinite ? v : nil
    }

    /// Records `at` as seen (never moves backwards).
    static func markSeen(prefix: String, at: Double, defaults: UserDefaults = .standard) {
        let next = max(at, seen(prefix: prefix, defaults: defaults) ?? 0)
        defaults.set(next, forKey: key(prefix))
    }

    /// What to ask the server for on this launch: nil on the very first launch (which just records
    /// `now`, so a new user isn't shown the whole history), else the last time they looked.
    static func sinceForLaunch(prefix: String, now: Double, defaults: UserDefaults = .standard) -> Double? {
        if let s = seen(prefix: prefix, defaults: defaults) { return s }
        markSeen(prefix: prefix, at: now, defaults: defaults)
        return nil
    }

    static func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }
}

extension ChefModel {
    /// Once per launch (from `install`): fetch what shipped since the last look and offer it.
    func checkWhatsNewOnce() {
        guard showsWhatsNew, !whatsNewChecked, backend != nil else { return }
        whatsNewChecked = true
        guard let since = ChefWhatsNewStore.sinceForLaunch(prefix: prefix, now: ChefWhatsNewStore.nowMs()) else { return }
        loadWhatsNew(since: since, forced: false)
    }

    /// `ChefKit.presentWhatsNew()`: the last 30 days, shown even when empty ("all caught up").
    func presentWhatsNew() {
        guard backend != nil else {
            showToast("ChefKit isn't installed yet.", symbol: "exclamationmark.triangle.fill")
            return
        }
        loadWhatsNew(since: ChefWhatsNewStore.nowMs() - 30 * 24 * 3600 * 1000, forced: true)
    }

    /// One-shot read of `<prefix>:whatsNew` (first value of the subscription). Failures (e.g. an
    /// older backend without `whatsNew`) are silent unless the host asked for the sheet.
    private func loadWhatsNew(since: Double, forced: Bool) {
        guard let backend else { return }
        let fetchedAt = ChefWhatsNewStore.nowMs()
        let prefix = self.prefix
        whatsNewSub = backend.value
            .chefSubscribe(fn("whatsNew"), args: ["since": .number(since)], as: [ChefWhatsNewEntry].self)
            .first()
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { [weak self] c in
                MainActor.assumeIsolated {
                    if case .failure = c, forced {
                        self?.showToast("Couldn't load what's new. Try again later.", symbol: "exclamationmark.triangle.fill")
                    }
                    self?.whatsNewSub = nil
                }
            }, receiveValue: { [weak self] rows in
                MainActor.assumeIsolated {
                    self?.offerWhatsNew(ChefWhatsNewState(entries: rows, seenUpTo: fetchedAt, prefix: prefix), forced: forced)
                }
            })
    }

    private func offerWhatsNew(_ state: ChefWhatsNewState, forced: Bool) {
        // Never interrupt someone composing a request; an automatic offer waits for next launch.
        if draft != nil || capturing != nil { return }
        if !forced {
            guard showsWhatsNew, !state.entries.isEmpty, !showSheet, whatsNew == nil else { return }
            whatsNew = state
            return
        }
        if showSheet || whatsNew != nil {
            // One sheet at a time: let the open one go, then present.
            showSheet = false
            whatsNew = nil
            Task {
                try? await Task.sleep(for: .milliseconds(450))
                if self.draft == nil, self.capturing == nil, !self.showSheet { self.whatsNew = state }
            }
        } else {
            whatsNew = state
        }
    }

    /// The sheet went away (Got it, swipe, or something else took over): mark it seen.
    func whatsNewDismissed(_ state: ChefWhatsNewState) {
        ChefWhatsNewStore.markSeen(prefix: state.prefix, at: state.seenUpTo)
        if whatsNew?.id == state.id { whatsNew = nil }
    }
}

// MARK: - Sheet

/// "What's new": what shipped since they last looked, with relative dates, and Got it.
/// Neutral for members; admins also see the Chef logo in the title.
struct ChefWhatsNewSheet: View {
    @Environment(ChefModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let state: ChefWhatsNewState

    var body: some View {
        NavigationStack {
            Group {
                if state.entries.isEmpty {
                    ContentUnavailableView(
                        "You're all caught up", systemImage: "sparkles",
                        description: Text("New features will show up here when they ship."))
                } else {
                    List {
                        ForEach(state.entries) { e in
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Image(systemName: "sparkle")
                                    .foregroundStyle(.tint)
                                    .accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(e.text).font(.body)
                                    Text(Date(timeIntervalSince1970: e.at / 1000), format: .relative(presentation: .named))
                                        .font(.footnote).foregroundStyle(.secondary)
                                }
                            }
                            .padding(.vertical, 4)
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                Button { dismiss() } label: {
                    Text("Got it").font(.headline).frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal).padding(.vertical, 10)
                .background(.bar)
                .accessibilityHint("Closes what's new")
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 8) {
                        if model.isAdmin { ChefMark(height: 22) }
                        Text("What's new").font(.headline).lineLimit(1)
                    }
                    .fixedSize()
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isHeader)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    // The Chef button sits under this sheet, so feedback about it starts here.
                    Button { model.requestFromSheet() } label: {
                        Image(systemName: "bubble.left.and.text.bubble.right")
                    }
                    .accessibilityLabel("Send feedback about this")
                    .accessibilityHint("Takes a screenshot of this sheet and opens a request")
                }
            }
        }
        .presentationDetents(state.entries.count > 3 ? [.large] : [.medium, .large])
        .presentationDragIndicator(.visible)
        .onDisappear { model.whatsNewDismissed(state) }
    }
}
