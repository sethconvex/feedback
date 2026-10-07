import Foundation
import Observation
import UIKit

/// A request on its way to Chef. Persisted (JSON + JPEGs + m4a) so nothing is lost offline.
struct ChefRequest: Codable, Sendable, Identifiable, Equatable {
    let id: String
    var title: String
    var description: String
    var transcript: String
    var screenshotFiles: [String]   // file names in ChefOutbox.dir
    var audioFile: String?
    var screen: String?
    var ref: String?
    var createdAt: Double
    var attempts = 0
    var lastError: String?
}

/// Builds `<prefix>:submitRequestWithMedia` args exactly per the contract (optional keys are
/// omitted, never sent as null).
enum ChefSubmission {
    static let maxScreenshots = 4

    static func args(for r: ChefRequest, screenshotIds: [String], audioId: String?) -> [String: ChefValue] {
        var args: [String: ChefValue] = [
            "title": .string(r.title),
            "screenshotStorageIds": .array(screenshotIds.prefix(maxScreenshots).map { .string($0) }),
        ]
        if !r.description.isEmpty { args["description"] = .string(r.description) }
        if !r.transcript.isEmpty { args["transcript"] = .string(r.transcript) }
        if let audioId { args["audioStorageId"] = .string(audioId) }
        var ctx: [String: ChefValue] = [:]
        if let s = r.screen, !s.isEmpty { ctx["screen"] = .string(s) }
        if let ref = r.ref, !ref.isEmpty { ctx["ref"] = .string(ref) }
        if !ctx.isEmpty { args["context"] = .object(ctx) }
        return args
    }
}

/// The durable outbox: requests are saved to disk first, then uploaded (screenshots + voice
/// note to Convex storage) and submitted. Failures stay queued and retry with backoff, when the
/// app becomes active, and when ChefKit is (re)installed.
@MainActor
@Observable
final class ChefOutbox {
    nonisolated static let dir: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let d = base.appendingPathComponent("ChefKit", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()

    private(set) var items: [ChefRequest] = []
    private(set) var sending = false
    @ObservationIgnored private var retryTask: Task<Void, Never>?
    @ObservationIgnored private var observer: NSObjectProtocol?

    init() {
        load()
        observer = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { _ in
            MainActor.assumeIsolated { ChefModel.shared.outbox.kick() }
        }
    }

    func enqueue(_ r: ChefRequest) {
        items.append(r)
        save(r)
        kick(force: true, announce: true)
    }

    /// Sends what's queued. `force` skips the backoff wait.
    func kick(force: Bool = false, announce: Bool = false) {
        guard !sending, !items.isEmpty, ChefModel.shared.backend != nil else { return }
        if force { retryTask?.cancel(); retryTask = nil }
        guard retryTask == nil else { return }
        sending = true
        Task {
            defer { sending = false }
            for r in items {
                do {
                    try await send(r)
                    remove(r)
                    if announce { ChefModel.shared.showToast("Sent to Chef", symbol: "checkmark.seal.fill") }
                } catch {
                    var r2 = r
                    r2.attempts += 1
                    r2.lastError = ChefErrors.friendly(error)
                    if let i = items.firstIndex(where: { $0.id == r.id }) { items[i] = r2 }
                    save(r2)
                    if ChefErrors.isMissingFunction(error) {
                        print("⚠️ ChefKit: \(ChefModel.shared.fn("submitRequestWithMedia")) isn't deployed. "
                            + "Export the Chef API from convex/\(ChefModel.shared.prefix).ts (see the README).")
                    }
                    if announce {
                        let msg = ChefErrors.isUnauthenticated(error) ? "Saved — sends when you're signed in"
                            : ChefErrors.isMissingFunction(error) ? "Saved — sends to Chef as soon as it's ready"
                            : "Saved — will send when online"
                        ChefModel.shared.showToast(msg, symbol: "tray.and.arrow.up")
                    }
                    scheduleRetry(attempts: r2.attempts)
                    break
                }
            }
        }
    }

    private func scheduleRetry(attempts: Int) {
        let delay = min(300, 5 * pow(2, Double(max(0, attempts - 1))))
        retryTask = Task {
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            retryTask = nil
            kick()
        }
    }

    private func send(_ r: ChefRequest) async throws {
        let m = ChefModel.shared
        var shots: [String] = []
        for f in r.screenshotFiles.prefix(ChefSubmission.maxScreenshots) {
            let url: String = try await m.mutation("generateUploadUrl")
            shots.append(try await Self.upload(file: Self.dir.appendingPathComponent(f), to: url, contentType: "image/jpeg"))
        }
        var audioId: String?
        if let a = r.audioFile, FileManager.default.fileExists(atPath: Self.dir.appendingPathComponent(a).path) {
            let url: String = try await m.mutation("generateUploadUrl")
            audioId = try await Self.upload(file: Self.dir.appendingPathComponent(a), to: url, contentType: "audio/mp4")
        }
        try await m.run("submitRequestWithMedia", ChefSubmission.args(for: r, screenshotIds: shots, audioId: audioId))
    }

    /// POSTs a file to a Convex storage upload URL; returns the storage id.
    nonisolated static func upload(file: URL, to uploadURL: String, contentType: String) async throws -> String {
        guard let url = URL(string: uploadURL) else { throw ChefError.message("Bad upload URL") }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 120
        req.setValue(contentType, forHTTPHeaderField: "Content-Type")
        let (data, resp) = try await URLSession.shared.upload(for: req, fromFile: file)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw ChefError.message("Upload failed: HTTP \(code) \(String(data: data.prefix(200), encoding: .utf8) ?? "")")
        }
        struct StorageResult: Decodable { let storageId: String }
        return try JSONDecoder().decode(StorageResult.self, from: data).storageId
    }

    // MARK: Disk

    private func save(_ r: ChefRequest) {
        if let d = try? JSONEncoder().encode(r) {
            try? d.write(to: Self.dir.appendingPathComponent("\(r.id).json"), options: .atomic)
        }
    }

    private func remove(_ r: ChefRequest) {
        items.removeAll { $0.id == r.id }
        let fm = FileManager.default
        for f in r.screenshotFiles + [r.audioFile].compactMap({ $0 }) + ["\(r.id).json"] {
            try? fm.removeItem(at: Self.dir.appendingPathComponent(f))
        }
    }

    private func load() {
        let files = (try? FileManager.default.contentsOfDirectory(at: Self.dir, includingPropertiesForKeys: nil)) ?? []
        items = files.filter { $0.pathExtension == "json" }
            .compactMap { try? JSONDecoder().decode(ChefRequest.self, from: Data(contentsOf: $0)) }
            .sorted { $0.createdAt < $1.createdAt }
    }

    /// Saves an image as JPEG in the outbox folder; returns the file name.
    nonisolated static func store(_ image: UIImage) -> String? {
        let name = "shot-\(UUID().uuidString).jpg"
        guard let data = image.jpegData(compressionQuality: 0.85) else { return nil }
        do { try data.write(to: dir.appendingPathComponent(name)); return name } catch { return nil }
    }
}

/// Renders the app's window (never ChefKit's own window) to an image.
@MainActor
enum ChefSnapshot {
    static func capture() -> UIImage? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first,
              let window = scene.windows.first(where: { $0.isKeyWindow && !ChefOverlay.isOverlay($0) })
                ?? scene.windows.first(where: { !ChefOverlay.isOverlay($0) && !$0.isHidden }) else { return nil }
        let r = UIGraphicsImageRenderer(bounds: window.bounds)
        return r.image { _ in _ = window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
    }
}
