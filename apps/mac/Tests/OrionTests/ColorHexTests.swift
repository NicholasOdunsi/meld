import AppKit
import SwiftUI
import Testing
@testable import Orion

struct ColorHexTests {
    @Test func parsesAccentHex() {
        let color = Color(hexString: "#ff5a36")
        let ns = NSColor(color).usingColorSpace(.sRGB)!
        #expect(abs(ns.redComponent - 1.0) < 0.01)
        #expect(abs(ns.greenComponent - 90.0 / 255.0) < 0.01)
        #expect(abs(ns.blueComponent - 54.0 / 255.0) < 0.01)
    }

    @Test func badHexFallsBackToGray() {
        let color = Color(hexString: "not-a-color")
        let parsed = NSColor(color).usingColorSpace(.sRGB)!
        let gray = NSColor(Color.gray).usingColorSpace(.sRGB)!
        #expect(abs(parsed.redComponent - gray.redComponent) < 0.01)
        #expect(abs(parsed.greenComponent - gray.greenComponent) < 0.01)
        #expect(abs(parsed.blueComponent - gray.blueComponent) < 0.01)
    }

    @Test func hexStringRoundTripsAccent() {
        #expect(Color(hexString: "#ff5a36").hexString == "#ff5a36")
    }
}
