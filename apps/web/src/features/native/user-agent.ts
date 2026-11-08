const ORION_MAC = /(?:^|\s)OrionMac\/\S+/;

export function isOrionMacUserAgent(userAgent: string): boolean {
  return ORION_MAC.test(userAgent);
}
