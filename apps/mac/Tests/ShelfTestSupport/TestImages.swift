import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Builds real encoded images in memory so tests never depend on binary fixtures.
public enum TestImages {
    public static func png(width: Int, height: Int) -> Data {
        encoded(width: width, height: height, as: .png)
    }

    public static func encoded(width: Int, height: Int, as type: UTType, isNoisy: Bool = false) -> Data {
        let image = makeImage(width: width, height: height, isNoisy: isNoisy)
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, type.identifier as CFString, 1, nil) else {
            fatalError("ImageIO cannot encode \(type.identifier) on this Mac")
        }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else {
            fatalError("Encoding \(type.identifier) failed")
        }
        return output as Data
    }

    private static func makeImage(width: Int, height: Int, isNoisy: Bool) -> CGImage {
        let bytesPerRow = width * 4
        var pixels = [UInt8](repeating: 200, count: bytesPerRow * height)
        if isNoisy {
            var generator = SystemRandomNumberGenerator()
            for index in pixels.indices {
                pixels[index] = UInt8.random(in: 0...255, using: &generator)
            }
        }
        guard
            let context = CGContext(
                data: &pixels,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: bytesPerRow,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
            ),
            let image = context.makeImage()
        else {
            fatalError("Could not build a \(width)x\(height) test image")
        }
        return image
    }
}
