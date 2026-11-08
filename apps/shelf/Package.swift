// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "OrionShelf",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "ShelfCore", targets: ["ShelfCore"]),
        .executable(name: "OrionShelf", targets: ["OrionShelf"]),
    ],
    dependencies: [
        .package(path: "../../packages/orion-design-system"),
    ],
    targets: [
        .target(
            name: "ShelfCore",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .executableTarget(
            name: "OrionShelf",
            dependencies: [
                "ShelfCore",
                .product(name: "OrionDesignSystem", package: "orion-design-system"),
            ],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .target(
            name: "ShelfTestSupport",
            dependencies: ["ShelfCore"],
            path: "Tests/ShelfTestSupport",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "ShelfCoreTests",
            dependencies: ["ShelfCore", "ShelfTestSupport"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "OrionShelfTests",
            dependencies: ["OrionShelf", "ShelfCore", "ShelfTestSupport"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
