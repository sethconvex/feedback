import SwiftUI
import UIKit

/// Where a request came from, sent as `context: { screen, ref }` with every request.
public struct ChefContext: Sendable, Hashable {
    /// A short id for the screen ("book", "settings", "checkout").
    public var screen: String?
    /// The thing on screen (a document id, an order id…).
    public var ref: String?
    /// How to say the screen in words in the composer ("your book"). Not sent.
    public var label: String?

    public init(screen: String? = nil, ref: String? = nil, label: String? = nil) {
        self.screen = screen
        self.ref = ref
        self.label = label
    }
}

/// The drop-in Chef feedback UI.
///
/// ```swift
/// import ChefKit
/// ChefKit.install(client: convexClient)            // adds the floating Chef button
/// ChefKit.context = { ChefContext(screen: "book", ref: bookId) }   // optional
/// ```
///
/// Tap the button for your requests, Chef's questions and (for admins) the approval queue.
/// Long-press it to screenshot the screen and start telling Chef by voice.
@MainActor
public enum ChefKit {
    /// Installs ChefKit: remembers the client, adds the floating button in its own window above
    /// the app (and above the app's sheets), and starts sending anything left in the outbox.
    ///
    /// Call once, e.g. in `App.init` or the root view's `onAppear`. Calling again swaps the
    /// client/prefix (e.g. after the host rebuilds its client on sign-in).
    ///
    /// - Parameters:
    ///   - client: The host's authenticated Convex client (`ConvexClient`,
    ///     `ConvexClientWithAuth`, or any wrapper conforming to ``ChefBackend``).
    ///   - prefix: The module the host exported the Chef functions from (`convex/chef.ts` → "chef").
    public static func install(client: any ChefBackend, prefix: String = "chef") {
        let m = ChefModel.shared
        m.backend = UnsafeBox(client)
        m.prefix = prefix
        ChefRequirements.check()
        ChefOverlay.installWhenReady()
        m.outbox.kick()
    }

    /// Removes the floating button and its window. The outbox is kept on disk.
    public static func uninstall() {
        ChefOverlay.uninstall()
        ChefModel.shared.backend = nil
    }

    /// Where requests come from. Called when a request is started.
    public static var context: @MainActor () -> ChefContext = { ChefContext() }

    /// Hide the floating button (e.g. while the app is recording). See also `.chefHidden()`.
    public static var isHidden: Bool {
        get { ChefModel.shared.manualHidden }
        set { ChefModel.shared.manualHidden = newValue }
    }

    /// Where the floating button sits in the window (default: bottom leading, above a tab bar).
    public static var buttonAlignment: Alignment {
        get { ChefModel.shared.buttonAlignment }
        set { ChefModel.shared.buttonAlignment = newValue }
    }

    /// Insets of the floating button from the safe area edges.
    public static var buttonInsets: EdgeInsets {
        get { ChefModel.shared.buttonInsets }
        set { ChefModel.shared.buttonInsets = newValue }
    }

    /// Opens the Chef sheet (requests, Chef's questions, approvals).
    public static func present() {
        ChefModel.shared.showSheet = true
    }

    /// Screenshot the screen now and open the composer, recording (same as long-pressing the button).
    public static func report() {
        ChefModel.shared.longPress()
    }

    /// Requests saved on the device that haven't reached the server yet.
    public static var pendingCount: Int { ChefModel.shared.outbox.items.count }

    /// Try to send saved requests now (e.g. right after the user signs in). ChefKit also retries
    /// on its own: with backoff, and whenever the app becomes active.
    public static func retryPending() {
        ChefModel.shared.outbox.kick(force: true)
    }
}

public extension View {
    /// Hides the floating Chef button while this view is on screen (and `hidden` is true).
    func chefHidden(_ hidden: Bool = true) -> some View {
        modifier(ChefHiddenModifier(hidden: hidden))
    }
}

private struct ChefHiddenModifier: ViewModifier {
    let hidden: Bool
    @State private var token = UUID()

    func body(content: Content) -> some View {
        content
            .onAppear { update(hidden) }
            .onChange(of: hidden) { _, h in update(h) }
            .onDisappear { ChefModel.shared.hiders.remove(token) }
    }

    private func update(_ h: Bool) {
        if h { ChefModel.shared.hiders.insert(token) } else { ChefModel.shared.hiders.remove(token) }
    }
}

/// Info.plist keys ChefKit needs for the voice note.
@MainActor
enum ChefRequirements {
    static let microphoneKey = "NSMicrophoneUsageDescription"
    static let speechKey = "NSSpeechRecognitionUsageDescription"

    static var hasMicrophoneKey: Bool { Bundle.main.object(forInfoDictionaryKey: microphoneKey) != nil }
    static var hasSpeechKey: Bool { Bundle.main.object(forInfoDictionaryKey: speechKey) != nil }

    private static var warned = false

    static func check() {
        guard !warned else { return }
        warned = true
        if !hasMicrophoneKey {
            print("⚠️ ChefKit: Info.plist is missing \(microphoneKey). Voice notes are disabled "
                + "(iOS would crash asking for the microphone). Add it, e.g. \"Record a voice note for your feedback.\"")
        }
        if !hasSpeechKey {
            print("⚠️ ChefKit: Info.plist is missing \(speechKey). Voice notes still record, but without a live "
                + "transcript. Add it, e.g. \"Transcribe your voice note as you speak.\"")
        }
    }
}
