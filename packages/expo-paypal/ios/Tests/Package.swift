// swift-tools-version:5.9
// The module's Foundation-only logic (`ios/Core`), tested on the Mac with `swift test`: the module itself needs an app
// to run in. `Sources/ExpoPayPalCore` is a link to `../Core`, the files the pod compiles.
import PackageDescription

let package = Package(
  name: "ExpoPayPalCoreTests",
  platforms: [.macOS(.v13)],
  targets: [
    .target(name: "ExpoPayPalCore", path: "Sources/ExpoPayPalCore"),
    .testTarget(name: "ExpoPayPalCoreTests", dependencies: ["ExpoPayPalCore"], path: "Tests/ExpoPayPalCoreTests"),
  ]
)
