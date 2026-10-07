@preconcurrency import AVFoundation
import Foundation
import Observation
@preconcurrency import Speech

/// A finished voice note.
struct ChefRecording: Sendable {
    let fileURL: URL
    let durationMs: Int
    let liveTranscript: String
}

/// Everything touched on the realtime audio thread lives here, never on the main actor.
private final class AudioSink: @unchecked Sendable {
    let file: AVAudioFile
    private let lock = NSLock()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    let onLevel: @Sendable (Float) -> Void

    init(file: AVAudioFile, onLevel: @escaping @Sendable (Float) -> Void) {
        self.file = file
        self.onLevel = onLevel
    }

    func setRequest(_ r: SFSpeechAudioBufferRecognitionRequest?) {
        lock.lock(); request = r; lock.unlock()
    }

    func handle(_ buffer: AVAudioPCMBuffer) {
        try? file.write(from: buffer)
        lock.lock(); let r = request; lock.unlock()
        r?.append(buffer)
        guard let ch = buffer.floatChannelData?[0] else { return }
        let n = Int(buffer.frameLength)
        guard n > 0 else { return }
        var sum: Float = 0
        for i in 0..<n { sum += ch[i] * ch[i] }
        let rms = sqrt(sum / Float(n))
        let db = 20 * log10(max(rms, 0.000_01))
        onLevel(max(0, min(1, (db + 55) / 55)))
    }

    /// Built outside any actor so the tap closure is not main-actor isolated.
    nonisolated func makeTap() -> AVAudioNodeTapBlock {
        { [self] buffer, _ in self.handle(buffer) }
    }
}

/// Records a voice note (.m4a) with AVAudioEngine while SFSpeechRecognizer writes a live
/// transcript (on-device when available). Recognition tasks that end (silence, time limits)
/// roll over so long notes keep transcribing.
@MainActor
@Observable
final class ChefRecorder {
    enum State: Equatable { case idle, starting, recording }

    private let directory: URL
    init(directory: URL) { self.directory = directory }

    private(set) var state: State = .idle
    private(set) var level: Float = 0
    private(set) var transcript = ""
    var errorMessage: String?

    @ObservationIgnored private var engine: AVAudioEngine?
    @ObservationIgnored private var sink: AudioSink?
    @ObservationIgnored private var fileURL: URL?
    @ObservationIgnored private var startedAt: Date?

    @ObservationIgnored private let recognizer = SFSpeechRecognizer(locale: Locale.current)
        ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    @ObservationIgnored private var committed = ""
    @ObservationIgnored private var partial = ""
    @ObservationIgnored private var speechAllowed = false
    @ObservationIgnored private var taskGeneration = 0

    var isRecording: Bool { state == .recording }

    private static var appName: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
            ?? (Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String) ?? "this app"
    }

    func start() async -> Bool {
        guard state == .idle else { return state == .recording }
        guard ChefRequirements.hasMicrophoneKey else {
            // Asking for the mic without the usage string would crash the app.
            errorMessage = "Voice notes are off in this build (the app's Info.plist is missing "
                + "\(ChefRequirements.microphoneKey)). You can still type your request."
            print("⚠️ ChefKit: add \(ChefRequirements.microphoneKey) to Info.plist to enable voice notes.")
            return false
        }
        state = .starting
        errorMessage = nil

        guard await AVAudioApplication.requestRecordPermission() else {
            errorMessage = "Microphone access is off. Turn it on in Settings › \(Self.appName), or type your request."
            state = .idle
            return false
        }
        speechAllowed = ChefRequirements.hasSpeechKey ? await Self.requestSpeechAuth() : false

        do {
            let session = AVAudioSession.sharedInstance()
            if #available(iOS 26.0, *) {
                try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
            } else {
                try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            }
            try session.setActive(true)

            let engine = AVAudioEngine()
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                throw ChefError.message("No microphone input available")
            }

            try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let url = directory.appendingPathComponent("voice-\(UUID().uuidString).m4a")
            self.fileURL = url
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: format.sampleRate,
                AVNumberOfChannelsKey: format.channelCount,
                AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
            ]
            let file = try AVAudioFile(forWriting: url, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
            let sink = AudioSink(file: file, onLevel: { lvl in
                Task { @MainActor [weak self] in self?.level = lvl }
            })
            input.installTap(onBus: 0, bufferSize: 2048, format: format, block: sink.makeTap())
            engine.prepare()
            try engine.start()

            self.engine = engine
            self.sink = sink
            committed = ""
            partial = ""
            transcript = ""
            startedAt = Date()
            state = .recording
            startRecognition()
            return true
        } catch {
            errorMessage = "Couldn't start recording. Check that \(Self.appName) can use the microphone (Settings › \(Self.appName)), then try again."
            teardown()
            if let fileURL { try? FileManager.default.removeItem(at: fileURL) }
            fileURL = nil
            state = .idle
            return false
        }
    }

    /// Stops and returns the finished note (nil if nothing usable was captured).
    func stop() -> ChefRecording? {
        guard state == .recording, let fileURL, let startedAt else { return nil }
        let durationMs = Int(Date().timeIntervalSince(startedAt) * 1000)
        let text = [committed, partial].filter { !$0.isEmpty }.joined(separator: " ")
        teardown()
        state = .idle
        self.startedAt = nil
        self.fileURL = nil
        return ChefRecording(fileURL: fileURL, durationMs: durationMs, liveTranscript: text)
    }

    func cancel() {
        guard state == .recording else { return }
        let url = fileURL
        teardown()
        state = .idle
        startedAt = nil
        fileURL = nil
        transcript = ""
        if let url { try? FileManager.default.removeItem(at: url) }
    }

    private func teardown() {
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil
        sink?.setRequest(nil)
        sink = nil // releases AVAudioFile, which finalizes the m4a
        taskGeneration += 1
        task?.cancel()
        task = nil
        level = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // MARK: Speech

    private func startRecognition() {
        guard speechAllowed, let recognizer, recognizer.isAvailable, let sink else { return }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.addsPunctuation = true
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
        taskGeneration += 1
        let gen = taskGeneration
        sink.setRequest(request)
        task = recognizer.recognitionTask(with: request, resultHandler: Self.makeHandler(model: self, generation: gen))
    }

    nonisolated private static func makeHandler(model: ChefRecorder, generation: Int)
        -> @Sendable (SFSpeechRecognitionResult?, Error?) -> Void {
        { [weak model] result, error in
            let text = result?.bestTranscription.formattedString
            let isFinal = result?.isFinal ?? false
            let failed = error != nil
            Task { @MainActor in
                model?.onSpeech(text: text, isFinal: isFinal, failed: failed, generation: generation)
            }
        }
    }

    private func onSpeech(text: String?, isFinal: Bool, failed: Bool, generation: Int) {
        guard generation == taskGeneration, state == .recording else { return }
        if let text {
            if Self.speechRestarted(old: partial, new: text) {
                committed = [committed, partial].filter { !$0.isEmpty }.joined(separator: " ")
            }
            partial = text
        }
        if isFinal || failed {
            // Recognition tasks end (silence, time limits); roll the text over and keep listening.
            if !partial.isEmpty { committed = [committed, partial].filter { !$0.isEmpty }.joined(separator: " ") }
            partial = ""
            let gen = taskGeneration
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .milliseconds(failed ? 800 : 50))
                guard let self, self.state == .recording, self.taskGeneration == gen else { return }
                self.startRecognition()
            }
        }
        transcript = [committed, partial].filter { !$0.isEmpty }.joined(separator: " ")
    }

    /// The recognizer sometimes starts over mid-task (after a pause): the new partial is shorter
    /// and starts with different words, so the old text must be kept, not replaced.
    nonisolated static func speechRestarted(old: String, new: String) -> Bool {
        let o = old.lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber })
        let n = new.lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber })
        guard o.count >= 3, !n.isEmpty, n.count < o.count else { return false }
        let k = min(2, n.count)
        return Array(o.prefix(k)) != Array(n.prefix(k))
    }

    nonisolated private static func requestSpeechAuth() async -> Bool {
        await withCheckedContinuation { cont in
            SFSpeechRecognizer.requestAuthorization { status in cont.resume(returning: status == .authorized) }
        }
    }
}
