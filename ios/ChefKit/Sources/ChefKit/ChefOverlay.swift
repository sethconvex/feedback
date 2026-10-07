import SwiftUI
import UIKit

// The Chef button lives in its own transparent window above the app, so it floats over the
// app's sheets and you can report from anywhere. Chef's own sheets are presented from this
// window too. Touches outside the button pass through to the app.

/// Passes every touch through except ones on the floating controls (SwiftUI draws them inside
/// the hosting view, so their frames are reported explicitly) or on Chef's own sheets.
final class ChefPassthroughWindow: UIWindow {
    /// Where the floating controls are, in window coordinates.
    var hotRects: [String: CGRect] = [:]

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let hit = super.hitTest(point, with: event) else { return nil }
        if hit !== rootViewController?.view { return hit } // a presented sheet
        return hotRects.values.contains { $0.insetBy(dx: -6, dy: -6).contains(point) } ? hit : nil
    }
}

@MainActor
enum ChefOverlay {
    private static var window: ChefPassthroughWindow?
    private static var sceneObserver: NSObjectProtocol?

    /// Adds the window now if a scene is up; otherwise as soon as one activates (so `install`
    /// can be called from `App.init`).
    static func installWhenReady() {
        if tryInstall() { return }
        guard sceneObserver == nil else { return }
        sceneObserver = NotificationCenter.default.addObserver(
            forName: UIScene.didActivateNotification, object: nil, queue: .main
        ) { _ in
            MainActor.assumeIsolated {
                if tryInstall(), let o = sceneObserver {
                    NotificationCenter.default.removeObserver(o)
                    sceneObserver = nil
                }
            }
        }
    }

    @discardableResult
    private static func tryInstall() -> Bool {
        if window != nil { return true }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let scene = scenes.first(where: { $0.activationState == .foregroundActive })
            ?? scenes.first(where: { $0.activationState == .foregroundInactive }) else { return false }
        let w = ChefPassthroughWindow(windowScene: scene)
        let host = UIHostingController(rootView: ChefOverlayRoot().environment(ChefModel.shared))
        host.view.backgroundColor = .clear
        w.rootViewController = host
        w.windowLevel = .alert + 1
        w.backgroundColor = .clear
        w.isHidden = false // shown, but never made key: the app keeps the keyboard and focus
        window = w
        return true
    }

    static func uninstall() {
        window?.isHidden = true
        window = nil
    }

    /// While a Chef sheet is open the overlay takes keyboard focus (typing a request); after,
    /// the app's window gets it back.
    static func setActive(_ active: Bool) {
        guard let window else { return }
        if active {
            window.makeKey()
        } else if window.isKeyWindow {
            window.windowScene?.windows.first(where: { $0 !== window && !$0.isHidden })?.makeKey()
        }
    }

    static func setHotRect(_ key: String, _ r: CGRect?) { window?.hotRects[key] = r }

    /// The overlay itself, so a screenshot can leave it out.
    static func isOverlay(_ w: UIWindow) -> Bool { w === window }
}

struct ChefOverlayRoot: View {
    @Environment(ChefModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack(alignment: model.buttonAlignment) {
            Color.clear
            if let d = model.capturing {
                ChefCapturePill(draft: d)
                    .reportsHotRect("capture")
                    .padding(model.buttonInsets)
                    .transition(reduceMotion ? .opacity : .scale(scale: 0.8, anchor: .bottomLeading).combined(with: .opacity))
            } else if !model.isHidden {
                ChefButton()
                    .reportsHotRect("chef")
                    .padding(model.buttonInsets)
                    .transition(.opacity)
            }
        }
        .overlay(alignment: .top) {
            if let t = model.toast {
                Label(t.text, systemImage: t.symbol)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(.regularMaterial, in: Capsule())
                    .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
                    .padding(.top, 8)
                    .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                    .allowsHitTesting(false)
                    .accessibilityHidden(true) // announced when shown
            }
        }
        .animation(reduceMotion ? nil : .spring(duration: 0.3), value: model.capturing != nil)
        .animation(reduceMotion ? nil : .spring(duration: 0.3), value: model.toast)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: model.isHidden)
        .onChange(of: model.showSheet || model.draft != nil) { _, open in ChefOverlay.setActive(open) }
        .sheet(isPresented: Binding(get: { model.showSheet }, set: { model.showSheet = $0 })) {
            ChefSheet()
        }
        .sheet(item: Binding(get: { model.draft }, set: { model.draft = $0 })) { d in
            ChefComposer(draft: d)
        }
    }
}

// MARK: - Button

/// A chef's hat, drawn (no asset catalog needed).
struct ChefHat: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        let w = r.width, h = r.height
        // Puffy top: three overlapping circles.
        p.addEllipse(in: CGRect(x: r.minX + w * 0.02, y: r.minY + h * 0.22, width: w * 0.42, height: h * 0.42))
        p.addEllipse(in: CGRect(x: r.minX + w * 0.25, y: r.minY + h * 0.02, width: w * 0.5, height: h * 0.48))
        p.addEllipse(in: CGRect(x: r.minX + w * 0.56, y: r.minY + h * 0.22, width: w * 0.42, height: h * 0.42))
        // Body + band.
        p.addRoundedRect(in: CGRect(x: r.minX + w * 0.2, y: r.minY + h * 0.42, width: w * 0.6, height: h * 0.38),
                         cornerSize: CGSize(width: 3, height: 3))
        p.addRoundedRect(in: CGRect(x: r.minX + w * 0.16, y: r.minY + h * 0.8, width: w * 0.68, height: h * 0.18),
                         cornerSize: CGSize(width: 3, height: 3))
        return p
    }
}

/// The hat + "Chef" wordmark used on the button and in sheet titles.
struct ChefMark: View {
    var size: CGFloat = 20
    var body: some View {
        HStack(spacing: 5) {
            ChefHat().frame(width: size, height: size)
            Text("Chef").font(.headline)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Chef")
    }
}

struct ChefButton: View {
    @Environment(ChefModel.self) private var model

    var body: some View {
        let pending = model.outbox.items.count
        ZStack(alignment: .topTrailing) {
            ChefMark()
                .foregroundStyle(.primary)
                .padding(.horizontal, 14)
                .frame(minWidth: 44, minHeight: 44)
                .background(Capsule().fill(.regularMaterial))
                .overlay(Capsule().strokeBorder(Color(uiColor: .separator), lineWidth: 0.5))
                .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
            if pending > 0 {
                Text("\(pending)").font(.caption2.bold()).foregroundStyle(.white)
                    .padding(5).background(Color.orange, in: Circle()).offset(x: 6, y: -6)
                    .accessibilityHidden(true)
            }
        }
        .contentShape(Capsule())
        .onTapGesture { model.showSheet = true; ChefHaptics.tap() }
        .onLongPressGesture(minimumDuration: 0.45) { model.longPress() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(pending > 0 ? "Chef: feature requests, \(pending) waiting to send" : "Chef: feature requests")
        .accessibilityHint("Tap to see requests. Long-press to report something on this screen with a screenshot.")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { model.showSheet = true }
        .accessibilityAction(named: "Report this screen") { model.longPress() }
    }
}

// MARK: - Capture pill

/// "Go to the spot, then tap Capture."
struct ChefCapturePill: View {
    @Environment(ChefModel.self) private var model
    let draft: ChefDraft

    var body: some View {
        HStack(spacing: 0) {
            Button { model.captureNow() } label: {
                Label("Capture", systemImage: "camera.viewfinder")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 14)
                    .frame(minHeight: 44)
            }
            .foregroundStyle(.white)
            .background(Color.accentColor, in: Capsule())
            .accessibilityHint("Takes a screenshot of what's on screen now and returns to your request")
            Button { model.captureCancel() } label: {
                Image(systemName: "xmark").font(.caption.weight(.bold))
                    .frame(width: 44, height: 44)
            }
            .foregroundStyle(.secondary)
            .accessibilityLabel("Cancel screenshot")
        }
        .padding(3)
        .background(Capsule().fill(.regularMaterial))
        .overlay(Capsule().strokeBorder(Color(uiColor: .separator), lineWidth: 0.5))
        .shadow(color: .black.opacity(0.15), radius: 12, y: 4)
    }
}

private extension View {
    /// Tells the passthrough window where this control is, so taps on it aren't passed through.
    func reportsHotRect(_ key: String) -> some View {
        onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { ChefOverlay.setHotRect(key, $0) }
            .onDisappear { ChefOverlay.setHotRect(key, nil) }
    }
}
