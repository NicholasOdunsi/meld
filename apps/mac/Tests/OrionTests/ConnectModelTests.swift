import Foundation
import ShelfCore
import ShelfTestSupport
import Testing
@testable import Orion

@MainActor
struct ConnectModelTests {
    @Test func showsTheServerMessageInline() async {
        let failure = ShelfAPIError(code: .invalidCode, message: "That code didn't work. Make a new one in Orion Settings → Shelf.")
        let model = TestDependencies(client: FakeOrionClient(connectResult: .failure(failure)), token: nil, connectedTo: nil).makeModel()
        let connect = ConnectModel()
        connect.prefill(from: model.baseURL)
        connect.code = "nope"

        await connect.connect(using: model)

        #expect(connect.errorMessage == failure.message)
        #expect(!connect.isConnecting)
    }

    @Test func clearsTheCodeAfterConnecting() async {
        let model = TestDependencies(token: nil, connectedTo: nil).makeModel()
        let connect = ConnectModel()
        connect.prefill(from: model.baseURL)
        connect.code = "ABCD1234"

        await connect.connect(using: model)

        #expect(connect.code.isEmpty)
        #expect(connect.errorMessage == nil)
    }
}
