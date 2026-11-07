import Foundation
import ShelfTestSupport
import Testing
import UniformTypeIdentifiers
@testable import ShelfCore

struct ImageNormalizerTests {
    let normalizer = ImageNormalizer()

    @Test func passesThroughSmallPNGUnchanged() throws {
        let data = TestImages.encoded(width: 40, height: 30, as: .png)
        let result = try normalizer.normalize(CapturedImage(data: data, sourceURL: nil))
        #expect(result == NormalizedImage(data: data, mimeType: .png, width: 40, height: 30))
    }

    @Test func passesThroughSmallJPEGUnchanged() throws {
        let data = TestImages.encoded(width: 40, height: 30, as: .jpeg)
        let result = try normalizer.normalize(CapturedImage(data: data, sourceURL: nil))
        #expect(result.data == data)
        #expect(result.mimeType == .jpeg)
    }

    @Test func convertsHEICToJPEG() throws {
        let data = TestImages.encoded(width: 64, height: 48, as: .heic)
        let result = try normalizer.normalize(CapturedImage(data: data, sourceURL: nil))
        #expect(result.mimeType == .jpeg)
        #expect(result.width == 64)
        #expect(result.height == 48)
    }

    @Test(arguments: [UTType.gif, UTType.tiff, UTType.bmp])
    func convertsOtherFormatsToPNG(type: UTType) throws {
        let data = TestImages.encoded(width: 20, height: 10, as: type)
        let result = try normalizer.normalize(CapturedImage(data: data, sourceURL: nil))
        #expect(result.mimeType == .png)
        #expect(result.width == 20)
        #expect(result.height == 10)
    }

    @Test func shrinksAnOverlongImageToTheMaxEdge() throws {
        let data = TestImages.encoded(width: 5000, height: 100, as: .png)
        let result = try normalizer.normalize(CapturedImage(data: data, sourceURL: nil))
        #expect(result.mimeType == .jpeg)
        #expect(result.width == Limits.maxEdge)
    }

    @Test func shrinksAHeavyImageUnderTheByteLimit() throws {
        let data = TestImages.encoded(width: 4000, height: 4000, as: .png, isNoisy: true)
        #expect(data.count > Limits.maxBytes)
        let result = try normalizer.normalize(CapturedImage(data: data, sourceURL: nil))
        #expect(result.data.count <= Limits.maxBytes)
        #expect(max(result.width, result.height) <= Limits.maxEdge)
    }

    @Test func rejectsNonImageBytes() {
        let data = Data("definitely not an image".utf8)
        #expect(throws: NormalizationError.notAnImage) {
            try normalizer.normalize(CapturedImage(data: data, sourceURL: nil))
        }
    }
}
