// Builds AppBundle/Orion.icns from the Orion mark (the "O") in assets/brand/Orion.svg.
// Run from apps/mac:  swift scripts/make-app-icon.swift
// Re-run only when the logo or brand colours change; the .icns is committed.
import AppKit

let repoRoot = URL(filePath: #filePath).deletingLastPathComponent().appending(path: "../../..").standardizedFileURL
let svgURL = repoRoot.appending(path: "assets/brand/Orion.svg")
let outputURL = repoRoot.appending(path: "apps/mac/AppBundle/Orion.icns")

// Brand values (packages/orion-design-system OrionColor): Black 0x090909, Day Break Blue 0x00E1F3.
let background = NSColor(srgbRed: 0x09 / 255, green: 0x09 / 255, blue: 0x09 / 255, alpha: 1)

// The mark sits at x 0…93, y 35…132.111 in the logo (OrionLogoForm.mark.bounds).
// Crop to a square around it so only the "O" is drawn.
let markSide = 97.111
let markMinX = (93 - markSide) / 2
guard var svg = try? String(contentsOf: svgURL, encoding: .utf8),
      let header = svg.range(of: #"<svg[^>]*>"#, options: .regularExpression) else {
    fatalError("Couldn't read \(svgURL.path())")
}
svg.replaceSubrange(header, with: #"<svg width="512" height="512" viewBox="\#(markMinX) 35 \#(markSide) \#(markSide)" fill="none" xmlns="http://www.w3.org/2000/svg">"#)
guard let mark = NSImage(data: Data(svg.utf8)) else { fatalError("Couldn't render the Orion mark") }

/// macOS icon grid: on a 1024 canvas the body is an 824-pt rounded square inset by 100.
func renderIcon(pixels: Int) -> Data {
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8,
        samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
    ), let context = NSGraphicsContext(bitmapImageRep: bitmap) else { fatalError("Couldn't create bitmap") }
    let scale = CGFloat(pixels) / 1024
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    let body = NSRect(x: 100, y: 100, width: 824, height: 824).applying(.init(scaleX: scale, y: scale))
    background.setFill()
    NSBezierPath(roundedRect: body, xRadius: 185 * scale, yRadius: 185 * scale).fill()
    let markSize = 824 * 0.56 * scale
    mark.draw(in: NSRect(x: body.midX - markSize / 2, y: body.midY - markSize / 2, width: markSize, height: markSize))
    NSGraphicsContext.restoreGraphicsState()
    guard let png = bitmap.representation(using: .png, properties: [:]) else { fatalError("Couldn't encode PNG") }
    return png
}

let iconset = FileManager.default.temporaryDirectory.appending(path: "Orion-\(UUID().uuidString).iconset")
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
for points in [16, 32, 128, 256, 512] {
    try renderIcon(pixels: points).write(to: iconset.appending(path: "icon_\(points)x\(points).png"))
    try renderIcon(pixels: points * 2).write(to: iconset.appending(path: "icon_\(points)x\(points)@2x.png"))
}
let iconutil = Process()
iconutil.executableURL = URL(filePath: "/usr/bin/iconutil")
iconutil.arguments = ["-c", "icns", iconset.path(), "-o", outputURL.path()]
try iconutil.run()
iconutil.waitUntilExit()
try? FileManager.default.removeItem(at: iconset)
guard iconutil.terminationStatus == 0 else { fatalError("iconutil failed") }
try renderIcon(pixels: 1024).write(to: repoRoot.appending(path: ".context/orion-app-icon-preview.png"))
print("Wrote \(outputURL.path())")
