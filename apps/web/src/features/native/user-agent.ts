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

// Orion Mac 1.2+ also draws the project's chat natively (OrionFrame/2). The
// room page then feeds that chat over the bridge instead of drawing it.
const ORION_FRAME_V2 = /(?:^|\s)OrionFrame\/([2-9]|\d{2,})(?:\s|$)/;

export function isOrionFrameV2UserAgent(userAgent: string): boolean {
  return ORION_FRAME_V2.test(userAgent);
}
