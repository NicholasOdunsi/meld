import Foundation
import Security

/// Stores the capture token as a generic password. `account` is the Orion base
/// URL, so a token minted by one Orion is never sent to another.
public struct KeychainTokenStore: TokenStore {
    private let service: String
    private let account: String

    public init(service: String = "com.orion.app", account: String) {
        self.service = service
        self.account = account
    }

    private var query: [CFString: Any] {
        [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account]
    }

    public func token() throws -> String? {
        var lookup = query
        lookup[kSecReturnData] = true
        lookup[kSecMatchLimit] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw TokenStoreError.keychain(status) }
        return String(data: data, encoding: .utf8)
    }

    public func save(_ token: String) throws {
        let data = Data(token.utf8)
        let updateStatus = SecItemUpdate(query as CFDictionary, [kSecValueData: data] as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else { throw TokenStoreError.keychain(updateStatus) }
        var item = query
        item[kSecValueData] = data
        item[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(item as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw TokenStoreError.keychain(addStatus) }
    }

    public func delete() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw TokenStoreError.keychain(status) }
    }
}
