import PencilKit
import SwiftUI

/// "Tell Chef": screenshots (with markup), a title, details, and a voice note with live transcript.
struct ChefComposer: View {
    @Environment(ChefModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Bindable var draft: ChefDraft
    @State private var annotating: Int?
    @State private var samples: [Float] = Array(repeating: 0, count: 36)

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    shotsRow
                    if draft.recorder.state != .idle {
                        recordingPanel
                    } else {
                        VStack(alignment: .leading, spacing: 10) {
                            TextField("What should change?", text: $draft.title, axis: .vertical)
                                .font(.title3.weight(.semibold))
                                .padding(12)
                                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                            TextEditor(text: $draft.description)
                                .frame(minHeight: 110)
                                .scrollContentBackground(.hidden)
                                .padding(8)
                                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                                .overlay(alignment: .topLeading) {
                                    if draft.description.isEmpty {
                                        Text("Details (optional)").foregroundStyle(.secondary).padding(16).allowsHitTesting(false)
                                    }
                                }
                                .accessibilityLabel("Details (optional)")
                            if let err = draft.recorder.errorMessage {
                                Label(err, systemImage: "mic.slash").font(.footnote).foregroundStyle(.secondary)
                            }
                            if ChefRequirements.hasMicrophoneKey {
                                Button { draft.startRecording() } label: {
                                    Label(draft.audioFile == nil ? "Tell Chef by voice" : "Record more for Chef", systemImage: "waveform")
                                        .font(.subheadline.weight(.semibold))
                                        .frame(minHeight: 44)
                                }
                                .tint(.orange)
                            }
                        }
                    }
                    Text(footnote)
                        .font(.caption).foregroundStyle(.secondary)
                }
                .padding()
            }
            .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 6) {
                        Text("Tell").font(.headline)
                        ChefMark()
                    }
                    .accessibilityElement(children: .ignore).accessibilityLabel("Tell Chef")
                    .accessibilityAddTraits(.isHeader)
                }
                ToolbarItem(placement: .cancellationAction) { Button("Discard") { model.discard(draft) } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") { model.send(draft) }
                        .bold()
                        .disabled(draft.recorder.state == .starting
                            || (draft.title.isEmpty && draft.recorder.state == .idle && draft.shots.isEmpty && draft.audioFile == nil))
                }
            }
            .fullScreenCover(item: Binding(get: { annotating.map { AnnotIndex(i: $0) } }, set: { annotating = $0?.i })) { a in
                if a.i < draft.shots.count {
                    ChefAnnotator(image: draft.shots[a.i]) { edited in
                        if let edited, a.i < draft.shots.count { draft.shots[a.i] = edited }
                        annotating = nil
                    }
                }
            }
        }
        .presentationDetents([.large])
        .interactiveDismissDisabled(draft.recorder.state != .idle)
    }

    private struct AnnotIndex: Identifiable { let i: Int; var id: Int { i } }

    private var footnote: String {
        let n = draft.shots.count
        let place = draft.context.label ?? "this screen"
        return "Goes to Chef with \(n) screenshot\(n == 1 ? "" : "s") from \(place)."
    }

    private var shotsRow: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 10) {
                ForEach(Array(draft.shots.enumerated()), id: \.offset) { i, img in
                    Image(uiImage: img).resizable().scaledToFill()
                        .frame(width: 92, height: 170)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color(uiColor: .separator)))
                        .overlay(alignment: .bottomLeading) {
                            Image(systemName: "pencil.tip.crop.circle").font(.title3).foregroundStyle(.white)
                                .shadow(radius: 3).padding(6)
                                .accessibilityHidden(true)
                        }
                        .contentShape(Rectangle())
                        .onTapGesture { annotating = i }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("Screenshot \(i + 1)")
                        .accessibilityHint("Opens it to mark up")
                        .accessibilityAddTraits(.isButton)
                        .accessibilityAction { annotating = i }
                        .accessibilityAction(named: "Remove screenshot") { draft.shots.remove(at: i) }
                        .overlay(alignment: .topTrailing) {
                            Button { draft.shots.remove(at: i) } label: {
                                Image(systemName: "xmark.circle.fill").symbolRenderingMode(.palette)
                                    .foregroundStyle(.white, .black.opacity(0.55)).font(.title3)
                                    .frame(width: 44, height: 44)
                                    .contentShape(Rectangle())
                            }
                            .accessibilityHidden(true) // offered as an action on the screenshot
                        }
                }
                if draft.shots.count < ChefDraft.maxShots {
                    Button { model.addScreenshot() } label: {
                        VStack(spacing: 6) {
                            Image(systemName: "camera.viewfinder").font(.title2)
                            Text(draft.shots.isEmpty ? "Add a\nscreenshot" : "Add\nanother").font(.caption2).multilineTextAlignment(.center)
                        }
                        .frame(width: 92, height: 170)
                        .foregroundStyle(Color.accentColor)
                        .background(RoundedRectangle(cornerRadius: 14)
                            .strokeBorder(Color.accentColor.opacity(0.5), style: StrokeStyle(lineWidth: 1.2, dash: [5, 4])))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(draft.shots.isEmpty ? "Add a screenshot" : "Add another screenshot")
                    .accessibilityHint("Hides this request so you can go to the screen you want, then tap Capture")
                }
            }
        }
        .scrollIndicators(.hidden)
    }

    private var recordingPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Circle().fill(Color.orange).frame(width: 9, height: 9).accessibilityHidden(true)
                Text("Recording for Chef — what should change?").font(.subheadline.weight(.semibold))
            }
            ChefWaveform(samples: samples)
                .frame(height: 40)
                .accessibilityHidden(true)
                .task {
                    while !Task.isCancelled {
                        samples.removeFirst(); samples.append(draft.recorder.level)
                        try? await Task.sleep(for: .milliseconds(reduceMotion ? 250 : 60))
                    }
                }
            Text(draft.recorder.transcript.isEmpty ? "…" : draft.recorder.transcript)
                .font(.title3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel(draft.recorder.transcript.isEmpty ? "Listening" : draft.recorder.transcript)
            Button { draft.stopRecording() } label: {
                Label("Done telling Chef", systemImage: "stop.fill").frame(maxWidth: .infinity).frame(minHeight: 36)
            }
            .buttonStyle(.borderedProminent).tint(.orange)
        }
        .padding(16)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// Live input level bars.
struct ChefWaveform: View {
    let samples: [Float]
    var body: some View {
        GeometryReader { geo in
            let n = max(1, samples.count)
            let w = geo.size.width / CGFloat(n)
            HStack(alignment: .center, spacing: 0) {
                ForEach(Array(samples.enumerated()), id: \.offset) { _, s in
                    Capsule()
                        .fill(Color.orange.opacity(0.8))
                        .frame(width: max(2, w * 0.55), height: max(3, geo.size.height * CGFloat(s)))
                        .frame(width: w, height: geo.size.height)
                }
            }
        }
    }
}

/// Freehand markup on a screenshot (PencilKit, red marker).
struct ChefAnnotator: View {
    let image: UIImage
    var done: (UIImage?) -> Void
    @State private var canvas = PKCanvasView()

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                let size = fit(image.size, in: geo.size)
                ZStack {
                    Image(uiImage: image).resizable().frame(width: size.width, height: size.height)
                        .accessibilityLabel("Screenshot")
                    ChefCanvas(canvas: canvas).frame(width: size.width, height: size.height)
                        .accessibilityLabel("Drawing canvas")
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(Color.black)
            .navigationTitle("Mark it up").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { done(nil) } }
                ToolbarItem(placement: .bottomBar) {
                    Button { canvas.undoManager?.undo() } label: { Image(systemName: "arrow.uturn.backward") }
                        .accessibilityLabel("Undo")
                }
                ToolbarItem(placement: .bottomBar) {
                    Button("Clear") { canvas.drawing = PKDrawing() }
                }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { done(composite()) }.bold() }
            }
            .toolbarBackground(.visible, for: .navigationBar, .bottomBar)
        }
    }

    private func fit(_ s: CGSize, in box: CGSize) -> CGSize {
        let k = min(box.width / max(1, s.width), box.height / max(1, s.height))
        return CGSize(width: s.width * k, height: s.height * k)
    }

    private func composite() -> UIImage {
        let bounds = canvas.bounds
        guard bounds.width > 0 else { return image }
        let ink = canvas.drawing.image(from: bounds, scale: image.size.width / bounds.width * image.scale)
        return UIGraphicsImageRenderer(size: image.size).image { _ in
            image.draw(in: CGRect(origin: .zero, size: image.size))
            ink.draw(in: CGRect(origin: .zero, size: image.size))
        }
    }
}

private struct ChefCanvas: UIViewRepresentable {
    let canvas: PKCanvasView
    func makeUIView(context: Context) -> PKCanvasView {
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.drawingPolicy = .anyInput
        canvas.tool = PKInkingTool(.marker, color: .systemRed, width: 8)
        return canvas
    }
    func updateUIView(_ uiView: PKCanvasView, context: Context) {}
}
