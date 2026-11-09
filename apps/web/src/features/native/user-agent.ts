const ORION_MAC = /(?:^|\s)OrionMac\/\S+/;

export function isOrionMacUserAgent(userAgent: string): boolean {
  return ORION_MAC.test(userAgent);
}

// Orion Mac 1.1+ draws the frame (sidebar + project tabs) natively in SwiftUI
// and adds this token. Pages then render content only. Older app builds lack
// it and keep getting the web sidebar.
const ORION_FRAME = /(?:^|\s)OrionFrame\/\d+/;

export function isOrionFrameUserAgent(userAgent: string): boolean {
  return ORION_FRAME.test(userAgent);
}
