// swift-tools-version: 6.2
import PackageDescription

var products: [Product] = [.library(name: "OrionDesignSystem", targets: ["OrionDesignSystem"])]
var targets: [Target] = [
    .target(name: "OrionDesignSystem", resources: [.process("Resources")]),
    .testTarget(name: "OrionDesignSystemTests", dependencies: ["OrionDesignSystem"])
]
#if os(macOS)
products.append(.executable(name: "OrionDesignSystemCatalog", targets: ["OrionDesignSystemCatalog"]))
targets.append(.executableTarget(name: "OrionDesignSystemCatalog", dependencies: ["OrionDesignSystem"]))
#endif

let package = Package(
    name: "OrionDesignSystem",
    platforms: [.macOS(.v26), .iOS(.v18)],
    products: products,
    targets: targets
)

