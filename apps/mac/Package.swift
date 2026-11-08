// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "OrionMac",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "ShelfCore", targets: ["ShelfCore"]),
        .library(name: "OrionAppCore", targets: ["OrionAppCore"]),
        .executable(name: "Orion", targets: ["Orion"]),
    ],
    dependencies: [
        .package(path: "../../packages/orion-design-system"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.10.1"),
    ],
    targets: [
        .target(name: "ShelfCore", swiftSettings: [.swiftLanguageMode(.v6)]),
        .target(name: "OrionAppCore", swiftSettings: [.swiftLanguageMode(.v6)]),
        .executableTarget(
            name: "Orion",
            dependencies: [
                "ShelfCore",
                "OrionAppCore",
                .product(name: "OrionDesignSystem", package: "orion-design-system"),
                .product(name: "Sparkle", package: "Sparkle"),
            ],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .target(
            name: "ShelfTestSupport",
            dependencies: ["ShelfCore"],
            path: "Tests/ShelfTestSupport",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(name: "ShelfCoreTests", dependencies: ["ShelfCore", "ShelfTestSupport"], swiftSettings: [.swiftLanguageMode(.v6)]),
        .testTarget(name: "OrionAppCoreTests", dependencies: ["OrionAppCore"], swiftSettings: [.swiftLanguageMode(.v6)]),
        .testTarget(name: "OrionTests", dependencies: ["Orion", "ShelfCore", "OrionAppCore", "ShelfTestSupport"], swiftSettings: [.swiftLanguageMode(.v6)]),
    ]
)
