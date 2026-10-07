// swift-tools-version: 6.0
// ChefKit: the iOS drop-in for the Chef feedback component (floating button, composer with
// screenshots + markup + voice note, offline outbox, requests list, admin approvals).
// The Swift sources live under ios/ChefKit; SPM needs this manifest at the repo root so the
// package can be added by git URL.

import PackageDescription

let package = Package(
    name: "ChefKit",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "ChefKit", targets: ["ChefKit"]),
    ],
    dependencies: [
        .package(url: "https://github.com/get-convex/convex-swift", from: "0.8.1"),
    ],
    targets: [
        .target(
            name: "ChefKit",
            dependencies: [.product(name: "ConvexMobile", package: "convex-swift")],
            path: "ios/ChefKit/Sources/ChefKit",
            resources: [.process("Resources")]
        ),
        .testTarget(
            name: "ChefKitTests",
            dependencies: ["ChefKit"],
            path: "ios/ChefKit/Tests/ChefKitTests"
        ),
    ],
    swiftLanguageModes: [.v6]
)
