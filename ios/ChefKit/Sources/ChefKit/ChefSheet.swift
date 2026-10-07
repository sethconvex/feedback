import AVFoundation
import SwiftUI

// MARK: - Models (lenient: unknown fields ignored, missing ones nil)

/// `<prefix>:mine` row.
struct ChefMyRequest: Decodable, Sendable, Identifiable, Hashable {
    let _id: String
    let title: String?
    let state: String?
    let _creationTime: Double?
    let hasAudio: Bool?
    let screenshotCount: Double?
    var id: String { _id }
}

struct ChefTodo: Decodable, Sendable, Identifiable, Hashable {
    let _id: String
    let text: String?
    let status: String?
    var id: String { _id }
}

struct ChefProgress: Decodable, Sendable, Identifiable, Hashable {
    let _id: String
    let message: String?
    var id: String { _id }
}

struct ChefRefinement: Decodable, Sendable, Identifiable, Hashable {
    let _id: String
    let text: String?
    let answer: String?
    let state: String?
    var id: String { _id }
}

/// `<prefix>:agentState`.
struct ChefAgentState: Decodable, Sendable {
    let todos: [ChefTodo]?
    let progress: [ChefProgress]?
    let refinements: [ChefRefinement]?
}

/// `<prefix>:awaitingApproval` row.
struct ChefPendingApproval: Decodable, Sendable, Identifiable {
    struct Attachment: Decodable, Sendable { let kind: String; let url: String? }
    let id: String
    let title: String
    let description: String?
    let from: String?
    let at: Double
    let attachments: [Attachment]?
}

// MARK: - Sheet

/// Tap on the floating button. Admins: new request, approvals, Chef's questions, build status,
/// their requests. Everyone else ("Feature requests"): request a feature + their own requests.
struct ChefSheet: View {
    @Environment(ChefModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var agent = ChefLive<ChefAgentState>()
    @State private var mine = ChefLive<[ChefMyRequest]>()
    @State private var answers: [String: String] = [:]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        dismiss()
                        Task { try? await Task.sleep(for: .milliseconds(400)); model.newRequest() }
                    } label: {
                        Label(admin ? "New request" : "Request a feature", systemImage: admin ? "plus.bubble.fill" : "plus.circle.fill")
                            .font(.headline).frame(minHeight: 44)
                    }
                    Text(admin ? "Tip: long-press the Chef button on any screen to send a screenshot and say what you want."
                         : "Tip: long-press the \(model.memberButton.title.lowercased()) button on any screen to send a screenshot and say what you want.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if admin { ChefApprovalsSection() }
                outboxSection
                if admin {
                    questionsSection
                    buildingSection
                }
                Section("Your requests") {
                    let all = mine.value ?? []
                    if all.isEmpty {
                        Text(mine.error ?? (mine.value == nil ? "Loading…" : "No requests yet."))
                            .foregroundStyle(.secondary).font(.footnote)
                    }
                    ForEach(all) { r in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(r.title ?? "").font(.subheadline).textSelection(.enabled)
                                HStack(spacing: 6) {
                                    if let c = r._creationTime {
                                        Text(Date(timeIntervalSince1970: c / 1000), format: .relative(presentation: .named))
                                    }
                                    if let m = r.screenshotCount, m > 0 {
                                        Label("\(Int(m))", systemImage: "photo")
                                            .accessibilityLabel("\(Int(m)) screenshot\(Int(m) == 1 ? "" : "s")")
                                    }
                                    if r.hasAudio == true {
                                        Image(systemName: "waveform").accessibilityLabel("voice note")
                                    }
                                }
                                .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            ChefStateBadge(state: r.state)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                let shipped = admin ? (agent.value?.progress ?? []).prefix(8) : []
                if !shipped.isEmpty {
                    Section("Lately") {
                        ForEach(Array(shipped)) { p in
                            Text(p.message ?? "").font(.footnote).textSelection(.enabled)
                        }
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Group {
                        if admin { ChefMark() } else { Text("Feature requests").font(.headline) }
                    }
                    .accessibilityAddTraits(.isHeader)
                }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .task(id: admin) {
                if admin { agent.bind("agentState") } else { agent.reset() }
                mine.bind("mine")
                model.outbox.kick(force: true)
            }
        }
    }

    private var admin: Bool { model.isAdmin }

    @ViewBuilder private var outboxSection: some View {
        let items = model.outbox.items
        if !items.isEmpty {
            Section("Waiting to send") {
                ForEach(items) { r in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(r.title).font(.subheadline.weight(.semibold))
                        Text("\(r.screenshotFiles.count) screenshot(s)\(r.audioFile != nil ? " + voice" : "")"
                            + (r.lastError != nil ? " · not sent yet, will retry" : ""))
                            .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                        if let e = r.lastError {
                            Text(e).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
                Button("Retry now") { model.outbox.kick(force: true) }
                    .disabled(model.outbox.sending)
            }
        }
    }

    @ViewBuilder private var questionsSection: some View {
        let refs = (agent.value?.refinements ?? []).filter { $0.state == "open" }
        if !refs.isEmpty {
            Section("Chef has questions") {
                ForEach(refs) { q in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(q.text ?? "").font(.body.weight(.medium)).textSelection(.enabled)
                        HStack {
                            TextField("Your answer", text: Binding(get: { answers[q.id] ?? "" }, set: { answers[q.id] = $0 }),
                                      axis: .vertical)
                                .textFieldStyle(.roundedBorder)
                                .accessibilityLabel("Your answer to: \(q.text ?? "")")
                            Button("Send") {
                                let a = answers[q.id] ?? ""
                                answers[q.id] = nil
                                model.perform("Answered") {
                                    try await model.run("answerRefinement", ["id": .string(q.id), "answer": .string(a)])
                                }
                            }
                            .frame(minHeight: 44)
                            .disabled((answers[q.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                        Button("Skip") {
                            model.perform { try await model.run("skipRefinement", ["id": .string(q.id)]) }
                        }
                        .font(.caption).tint(.secondary)
                        .frame(minHeight: 44)
                        .accessibilityLabel("Skip this question")
                    }
                    .buttonStyle(.borderless)
                    .padding(.vertical, 4)
                }
            }
        }
    }

    @ViewBuilder private var buildingSection: some View {
        let todos = agent.value?.todos ?? []
        if !todos.isEmpty {
            Section("Building now") {
                ForEach(todos) { t in
                    Label(t.text ?? "", systemImage: t.status == "done" ? "checkmark.circle.fill"
                        : t.status == "active" ? "circle.dotted.circle" : "circle")
                        .foregroundStyle(t.status == "done" ? Color.green : Color.primary)
                        .font(.subheadline)
                        .accessibilityValue(t.status == "done" ? "done" : t.status == "active" ? "in progress" : "to do")
                }
            }
        }
    }
}

struct ChefStateBadge: View {
    let state: String?
    var body: some View {
        let (label, color): (String, Color) = switch state {
        case "submitted": ("Waiting for approval", .purple)
        case "inProgress": ("In progress", .blue)
        case "completed": ("Done", .green)
        case "rejected": ("Declined", .secondary)
        default: ("Planned", .orange) // requested / planned
        }
        Text(label).font(.caption2.weight(.bold)).foregroundStyle(color)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(color.opacity(0.14), in: Capsule())
            .accessibilityLabel("Status: \(label)")
    }
}

// MARK: - Approvals (admins)

/// "Waiting for your approval": requests from people who aren't admins. Shown to admins only
/// (`<prefix>:amAdmin`); `awaitingApproval` returns [] for everyone else anyway.
struct ChefApprovalsSection: View {
    @Environment(ChefModel.self) private var model
    @State private var pending = ChefLive<[ChefPendingApproval]>()
    @State private var busy: Set<String> = []

    var body: some View {
        Group {
            if model.isAdmin, let list = pending.value, !list.isEmpty {
                Section {
                    ForEach(list) { r in row(r) }
                } header: {
                    Text("Waiting for your approval")
                } footer: {
                    Text("From people who aren't admins. Approve sends it to the build queue; Reject closes it.")
                }
            }
        }
        .task {
            pending.bind("awaitingApproval")
        }
    }

    private func row(_ r: ChefPendingApproval) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(r.title).font(.subheadline.weight(.semibold))
            Text("\(r.from ?? "Someone") · \(Date(timeIntervalSince1970: r.at / 1000).formatted(.relative(presentation: .named)))")
                .font(.caption).foregroundStyle(.secondary)
            let desc = r.description ?? ""
            let body = desc.components(separatedBy: "\n\n_source").first ?? desc
            if !body.isEmpty, body != r.title {
                Text(body).font(.footnote).lineLimit(6)
            }
            let attachments = r.attachments ?? []
            let shots = attachments.filter { $0.kind == "screenshot" }.compactMap { $0.url.flatMap(URL.init(string:)) }
            if !shots.isEmpty {
                ScrollView(.horizontal) {
                    HStack {
                        ForEach(Array(shots.enumerated()), id: \.offset) { i, u in
                            AsyncImage(url: u) { img in img.resizable().scaledToFill() } placeholder: {
                                Color(uiColor: .tertiarySystemFill)
                            }
                            .frame(width: 70, height: 140).clipShape(RoundedRectangle(cornerRadius: 8))
                            .accessibilityLabel("Screenshot \(i + 1)")
                        }
                    }
                }
            }
            if let a = attachments.first(where: { $0.kind == "audio" })?.url.flatMap(URL.init(string:)) {
                Button { ChefAudioPeek.shared.play(a) } label: {
                    Label("Play voice note", systemImage: "play.circle").frame(minHeight: 44)
                }
                .font(.footnote)
            }
            HStack {
                Button { review(r.id, approve: true) } label: {
                    Label("Approve", systemImage: "checkmark").frame(minHeight: 32)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityLabel("Approve \(r.title)")
                Button(role: .destructive) { review(r.id, approve: false) } label: {
                    Text("Reject").frame(minHeight: 32)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Reject \(r.title)")
            }
            .disabled(busy.contains(r.id))
            .font(.footnote.weight(.semibold))
        }
        .buttonStyle(.borderless)
        .padding(.vertical, 4)
    }

    private func review(_ id: String, approve: Bool) {
        busy.insert(id)
        model.perform(approve ? "Approved" : "Rejected") {
            defer { busy.remove(id) }
            try await model.run("review", ["id": .string(id), "approve": .bool(approve)])
        }
    }
}

/// Plays a voice note from a URL (one at a time).
@MainActor
final class ChefAudioPeek {
    static let shared = ChefAudioPeek()
    private var player: AVPlayer?
    func play(_ url: URL) {
        player?.pause()
        player = AVPlayer(url: url)
        player?.play()
    }
}
