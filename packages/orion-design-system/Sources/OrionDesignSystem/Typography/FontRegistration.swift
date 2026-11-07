import CoreText
import Foundation

@MainActor
enum FontRegistration {
    static let names: [String: String] = {
        var names: [String: String] = [:]
        for resource in ["SpaceGrotesk-Bold", "Manrope-Regular", "Manrope-Bold"] {
            guard let url = Bundle.module.url(forResource: resource, withExtension: "ttf"),
                  let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor],
                  let descriptor = descriptors.first,
                  let name = CTFontDescriptorCopyAttribute(descriptor, kCTFontNameAttribute) as? String
            else { continue }
            // Registration may already have happened in another package consumer.
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            let font = CTFontCreateWithName(name as CFString, 16, nil)
            if CTFontCopyPostScriptName(font) as String == name { names[resource] = name }
        }
        return names
    }()
}
