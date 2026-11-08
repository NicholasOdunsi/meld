import Foundation
import Observation
import ShelfCore

@MainActor
@Observable
final class ConnectModel {
    var baseURLText = ""
    var code = ""
    private(set) var errorMessage: String?
    private(set) var isConnecting = false

    func prefill(from baseURL: URL) {
        if baseURLText.isEmpty { baseURLText = baseURL.absoluteString }
    }

    func connect(using appModel: AppModel) async {
        isConnecting = true
        errorMessage = nil
        defer { isConnecting = false }
        do {
            try await appModel.connect(baseURLString: baseURLText, code: code)
            code = ""
        } catch {
            errorMessage = error.message
        }
    }
}
