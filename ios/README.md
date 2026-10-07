# ChefKit (iOS)

Drop-in SwiftUI client for the Chef feedback component. Two lines give any iOS 17+ app:

**Only admins see "Chef".** ChefKit subscribes to `<prefix>:amAdmin` at install and treats everyone as a member
until it hears back:

| | Admins | Members / signed out |
| --- | --- | --- |
| Floating button | Chef hat + "Chef" | Neutral lightbulb, labelled "Suggest a feature" (`ChefKit.memberButton`) |
| Long-press | Screenshot + voice composer ("Tell Chef") | Same composer, neutral copy ("Request a feature") |
| Tap | Approvals, Chef's questions, *Building now*, *Lately*, your requests | "Feature requests": *Request a feature* + your own requests |
| Sent toast | "Sent to Chef" | "Your request was sent" |

Request states read: Waiting for approval (submitted), Planned (requested), In progress, Done, Declined.

Everything ChefKit adds:

- a floating **Chef button** in its own window (floats over your sheets; taps elsewhere pass through)
- **long-press** → screenshot of the current screen + composer already recording a voice note with a live transcript
- **tap** → sheet with *New request*, Chef's clarifying questions, what's being built, your requests and their status, and — for admins — the **approval queue**
- composer: up to 4 screenshots with freehand **markup** (PencilKit), *Add a screenshot* via **Capture mode** (the composer tucks away, a floating *Capture* pill grabs whatever screen you navigate to), title + details, voice note
- a durable **offline outbox**: requests are saved to disk first, then screenshots + audio are uploaded and the request submitted; failures retry with backoff, on app foreground, and on demand

## Backend

Your Convex app installs `@convex-dev/feedback` and exports the Chef API from one file, `convex/chef.ts`
(see the root README, "exposeChefApi"). ChefKit calls `<prefix>:<name>` — `chef:mine`, `chef:submitRequestWithMedia`, … —
so the prefix is just the file name you exported from.

Functions used: `generateUploadUrl`, `submitRequestWithMedia`, `mine`, `agentState`, `answerRefinement`,
`skipRefinement`, `amAdmin`, `awaitingApproval`, `review`.

## Install

Xcode → File → Add Package Dependencies → `https://github.com/sethconvex/feedback` → add the **ChefKit** library
to your app target. Or in `Package.swift`:

```swift
.package(url: "https://github.com/sethconvex/feedback", branch: "main"),
// target dependency:
.product(name: "ChefKit", package: "feedback"),
```

ChefKit depends on [ConvexMobile](https://github.com/get-convex/convex-swift) (≥ 0.8.1), which you already use.

## Use

```swift
import ChefKit

// Once, with your authenticated client (ConvexClient or ConvexClientWithAuth):
ChefKit.install(client: convex, prefix: "chef")

// Optional: say where requests come from (sent as context: { screen, ref }).
ChefKit.context = { ChefContext(screen: "book", ref: currentBookId, label: "your book") }
```

`install` can run in `App.init` (the window is added as soon as a scene activates) or in your root view's
`onAppear`. Call it again to swap the client (e.g. after rebuilding it on sign-in). ChefKit never signs anyone in:
calls go out as whoever your client is authenticated as. Signed-out users can browse the sheet (empty lists);
their requests stay in the outbox until they sign in — call `ChefKit.retryPending()` right after sign-in to send
them immediately.

Optional knobs:

```swift
ChefKit.isHidden = true                       // hide the button (e.g. during your own recording UI)
SomeView().chefHidden()                       // …or hide it while a view is on screen
ChefKit.memberButton = .init(title: "Send feedback", systemImage: "bubble.left", showsTitle: true) // non-admins
ChefKit.buttonAlignment = .bottomTrailing     // default .bottomLeading
ChefKit.buttonInsets = EdgeInsets(top: 0, leading: 20, bottom: 90, trailing: 20)
ChefKit.present()                             // open the Chef sheet from your own UI
ChefKit.report()                              // same as long-pressing the button
ChefKit.pendingCount                          // requests saved but not yet sent
ChefKit.uninstall()
```

### Custom client wrappers

If your app wraps its Convex client, conform the wrapper to `ChefBackend` instead:

```swift
extension MySession: ChefBackend {
    func chefMutation<T: Decodable & Sendable>(_ name: String, args: [String: ChefValue]) async throws -> T {
        try await client.mutation(name, with: args.mapValues(\.convexValue))
    }
    func chefSubscribe<T: Decodable & Sendable>(_ name: String, args: [String: ChefValue], as type: T.Type)
        -> AnyPublisher<T, Error> {
        client.subscribe(to: name, with: args.mapValues(\.convexValue), yielding: type)
            .mapError { $0 as Error }.eraseToAnyPublisher()
    }
}
```

## Info.plist

Add both keys to your app's Info.plist (target → Info):

| Key | Example value | Without it |
| --- | --- | --- |
| `NSMicrophoneUsageDescription` | "Record a voice note for your feedback." | Voice notes are disabled (asking for the mic without it would crash iOS); the composer says so and typing still works. |
| `NSSpeechRecognitionUsageDescription` | "Transcribe your voice note as you speak." | Voice notes record, but with no live transcript. |

ChefKit prints a `⚠️ ChefKit:` line to the console at install if either is missing.

## Admins

Requests from non-admins land in state `submitted` and wait for approval (admin requests skip straight to the
queue). When `chef:amAdmin` is true, the button becomes the Chef hat and the Chef sheet shows **Waiting for your approval** at the top: title, who sent
it and when, details, screenshots, a *Play voice note* button, and **Approve** (→ build queue) / **Reject**.
Admins also see *Building now* and *Lately* (the build agent's todos and progress). Make someone an admin with the
component's users/roles API (see the root README).

## Accessibility

44 pt touch targets; the button has a label, hint, and a *Report this screen* custom action (VoiceOver users don't
need the long-press); toasts are announced; Reduce Motion swaps springs/slides for fades.

## Migrating an app that has its own Chef UI

Delete the app's copies of the Chef UI, outbox, overlay window, and approvals (in Makeabook:
`Features/Chef/ChefUI.swift`, `ChefOutbox.swift`, `ChefOverlay.swift`, `ChefApprovals.swift`), the Chef state on
the app model (`chefDraft`, `showChefSheet`, `chefCapturing`, `chefHidden`, `chef` outbox + its `session`/`onSent`/
`onQueued` wiring and `kick()` calls) and the `ChefLogo` asset. Replace the `ChefOverlay.install(model:)` call with
`ChefKit.install(client: session.client, prefix: "chef")`, map `chefHidden` to `ChefKit.isHidden` / `.chefHidden()`,
and set `ChefKit.context` from the app's navigation. On the backend, export the Chef API from `convex/chef.ts`.
Requests still sitting in the old app outbox folder (`Application Support/chef`) aren't picked up by ChefKit
(`Application Support/ChefKit`); send or drop them before switching.

## Develop

```sh
xcodebuild -scheme ChefKit -destination 'generic/platform=iOS Simulator' build
xcodebuild test -scheme ChefKit -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```
