@preconcurrency import Combine
import Foundation
import Observation
import SwiftUI
import UIKit

// MARK: - Toast

struct ChefToast: Identifiable, Equatable {
    let id = UUID()
    let text: String
    let symbol: String
}

// MARK: - Model

/// ChefKit's shared state: the client, which sheet is open, the draft being composed, the outbox.
@MainActor
@Observable
final class ChefModel {
    static let shared = ChefModel()

    @ObservationIgnored var backend: UnsafeBox<any ChefBackend>?
    var prefix = "chef"

    var showSheet = false
    /// The composer's draft (its sheet is up while non-nil).
    var draft: ChefDraft?
    /// The draft tucked away while they go find something to screenshot (Capture pill is up).
    var capturing: ChefDraft?

    var manualHidden = false
    var hiders: Set<UUID> = []
    var isHidden: Bool { manualHidden || !hiders.isEmpty }

    var buttonAlignment: Alignment = .bottomLeading
    var buttonInsets = EdgeInsets(top: 20, leading: 20, bottom: 76, trailing: 20)

    /// Admins see Chef (build status, questions, approvals); everyone else sees a neutral
    /// "Suggest a feature" UI. Non-admin until `<prefix>:amAdmin` says otherwise.
    @ObservationIgnored let adminLive = ChefLive<Bool>()
    var isAdmin: Bool { adminLive.value == true }
    var memberButton = ChefMemberButton()

    /// Subscribes to `<prefix>:amAdmin` (again) for the current client.
    func bindAdmin() {
        adminLive.reset()
        adminLive.bind("amAdmin")
    }

    private(set) var toast: ChefToast?
    let outbox = ChefOutbox()

    /// The "What's new" sheet (up while non-nil). See ChefWhatsNew.swift.
    var whatsNew: ChefWhatsNewState?
    var showsWhatsNew = true
    @ObservationIgnored var whatsNewChecked = false
    @ObservationIgnored var whatsNewSub: AnyCancellable?

    private init() {}

    /// The full function name for this host ("chef:mine").
    func fn(_ name: String) -> String { "\(prefix):\(name)" }

    // MARK: Calls

    func mutation<T: Decodable & Sendable>(_ name: String, _ args: [String: ChefValue] = [:]) async throws -> T {
        guard let backend else { throw ChefError.message("ChefKit isn't installed. Call ChefKit.install(client:) first.") }
        return try await Self.call(backend, fn(name), args)
    }

    func run(_ name: String, _ args: [String: ChefValue] = [:]) async throws {
        let _: ChefIgnored = try await mutation(name, args)
    }

    /// Runs off the main actor (the Convex client isn't Sendable; ChefKit only ever uses it this way).
    nonisolated private static func call<T: Decodable & Sendable>(
        _ b: UnsafeBox<any ChefBackend>, _ name: String, _ args: [String: ChefValue]
    ) async throws -> T {
        try await b.value.chefMutation(name, args: args)
    }

    /// Runs a call; shows a friendly toast if it fails (and `done` if it worked).
    func perform(_ done: String? = nil, _ body: @escaping @MainActor () async throws -> Void) {
        Task {
            do {
                try await body()
                if let done { showToast(done, symbol: "checkmark.circle.fill") }
                ChefHaptics.tap()
            } catch {
                showToast(ChefErrors.friendly(error), symbol: "exclamationmark.triangle.fill")
            }
        }
    }

    func showToast(_ text: String, symbol: String) {
        let t = ChefToast(text: text, symbol: symbol)
        toast = t
        UIAccessibility.post(notification: .announcement, argument: text)
        Task {
            try? await Task.sleep(for: .seconds(2.6))
            if toast == t { toast = nil }
        }
    }

    // MARK: Flows

    /// Long-press: snapshot the screen first (the Chef window is never in it), then open the
    /// composer already recording.
    func longPress() {
        guard draft == nil, capturing == nil else { return }
        showSheet = false
        whatsNew = nil
        let img = ChefSnapshot.capture()
        ChefHaptics.thunk()
        let d = ChefDraft(shots: img.map { [$0] } ?? [], context: ChefKit.context())
        draft = d
        d.startRecording()
    }

    func newRequest() {
        draft = ChefDraft(shots: [], context: ChefKit.context())
    }

    /// Tuck the composer away and show a Capture pill: they go wherever they want to show,
    /// then tap Capture.
    func addScreenshot() {
        guard let d = draft else { return }
        if d.recorder.isRecording { d.stopRecording() }
        draft = nil
        capturing = d
    }

    func captureNow() {
        guard let d = capturing else { return }
        if let img = ChefSnapshot.capture(), d.shots.count < ChefDraft.maxShots { d.shots.append(img) }
        ChefHaptics.tap()
        capturing = nil
        draft = d
    }

    func captureCancel() {
        guard let d = capturing else { return }
        capturing = nil
        draft = d
    }

    func send(_ d: ChefDraft) {
        if d.recorder.isRecording { d.stopRecording() }
        let files = d.shots.compactMap { ChefOutbox.store($0) }
        let title = d.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let r = ChefRequest(
            id: UUID().uuidString,
            title: title.isEmpty ? "Feedback from iOS" : title,
            description: d.description.trimmingCharacters(in: .whitespacesAndNewlines),
            transcript: d.transcript.trimmingCharacters(in: .whitespacesAndNewlines),
            screenshotFiles: files, audioFile: d.audioFile,
            screen: d.context.screen, ref: d.context.ref,
            createdAt: Date().timeIntervalSince1970 * 1000)
        draft = nil
        outbox.enqueue(r)
    }

    func discard(_ d: ChefDraft) {
        d.recorder.cancel()
        if let a = d.audioFile { try? FileManager.default.removeItem(at: ChefOutbox.dir.appendingPathComponent(a)) }
        draft = nil
    }
}

// MARK: - Draft

/// The composer's state. Survives the composer being dismissed for "Add a screenshot".
@MainActor
@Observable
final class ChefDraft: Identifiable {
    static let maxShots = 4

    let id = UUID()
    var shots: [UIImage]
    let recorder = ChefRecorder(directory: ChefOutbox.dir)
    var title = ""
    var description = ""
    var transcript = ""
    var audioFile: String?
    let context: ChefContext

    init(shots: [UIImage], context: ChefContext) {
        self.shots = shots
        self.context = context
    }

    func startRecording() {
        Task {
            if await recorder.start() { ChefHaptics.thunk() }
        }
    }

    func stopRecording() {
        guard let rec = recorder.stop() else { return }
        ChefHaptics.success()
        if let old = audioFile { try? FileManager.default.removeItem(at: ChefOutbox.dir.appendingPathComponent(old)) }
        audioFile = rec.fileURL.lastPathComponent
        let t = rec.liveTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty {
            transcript = [transcript, t].filter { !$0.isEmpty }.joined(separator: " ")
            description = [description, t].filter { !$0.isEmpty }.joined(separator: "\n")
        }
        if title.isEmpty { title = Self.firstSentence(transcript) }
    }

    /// The first sentence of what they said, as a title (≤ 80 characters).
    nonisolated static func firstSentence(_ s: String) -> String {
        let end = s.firstIndex(where: { ".?!\n".contains($0) }) ?? s.endIndex
        let first = String(s[..<end]).trimmingCharacters(in: .whitespaces)
        return first.count > 80 ? String(first.prefix(77)) + "…" : first
    }
}

// MARK: - Live query

/// A live Convex subscription exposed as observable state.
@MainActor
@Observable
final class ChefLive<T: Decodable & Sendable> {
    private(set) var value: T?
    private(set) var error: String?
    @ObservationIgnored private var sub: AnyCancellable?
    @ObservationIgnored private var key = ""

    init() {}

    /// Subscribes to `<prefix>:<name>` (no-op if already bound to the same function).
    func bind(_ name: String, _ args: [String: ChefValue] = [:]) {
        let m = ChefModel.shared
        guard let backend = m.backend else { return }
        let full = m.fn(name)
        let k = full + String(describing: args.sorted { $0.key < $1.key })
        guard k != key else { return }
        key = k
        error = nil
        sub = backend.value.chefSubscribe(full, args: args, as: T.self)
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { [weak self] c in
                MainActor.assumeIsolated {
                    if case .failure(let e) = c {
                        self?.error = ChefErrors.friendly(e)
                        self?.key = "" // a later bind retries
                    }
                }
            }, receiveValue: { [weak self] v in
                MainActor.assumeIsolated {
                    self?.value = v
                    self?.error = nil
                }
            })
    }

    func reset() { sub = nil; key = ""; value = nil }
}

// MARK: - Haptics

@MainActor
enum ChefHaptics {
    static func tap() { UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.8) }
    static func thunk() { UIImpactFeedbackGenerator(style: .medium).impactOccurred(intensity: 0.9) }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}
