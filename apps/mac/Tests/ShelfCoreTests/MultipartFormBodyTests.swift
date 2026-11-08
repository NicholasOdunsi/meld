import Foundation
import Testing
@testable import ShelfCore

struct MultipartFormBodyTests {
    @Test func encodesFieldsAndAFileBetweenBoundaries() throws {
        var body = MultipartFormBody(boundary: "B")
        body.addField(name: "note", value: "love this")
        body.addFile(name: "file", fileName: "image.png", mimeType: "image/png", data: Data([0x89, 0x50]))
        let text = try #require(String(data: body.finalized(), encoding: .isoLatin1))

        #expect(body.contentType == "multipart/form-data; boundary=B")
        #expect(text.contains("--B\r\nContent-Disposition: form-data; name=\"note\"\r\n\r\nlove this\r\n"))
        #expect(text.contains("--B\r\nContent-Disposition: form-data; name=\"file\"; filename=\"image.png\"\r\nContent-Type: image/png\r\n\r\n"))
        #expect(text.hasSuffix("\r\n--B--\r\n"))
    }
}
