export const FRAME_LINK_PREFIX = "orion-screen://";
const SCREEN_ID = /^[a-z][a-z0-9_-]{0,63}$/;

export function frameLink(id: string): string {
  if (!SCREEN_ID.test(id)) throw new Error(`Invalid screen id: ${id}`);
  return `${FRAME_LINK_PREFIX}${id}`;
}

export function screenIdFromLink(link: string | null | undefined): string | null {
  if (typeof link !== "string" || !link.startsWith(FRAME_LINK_PREFIX)) return null;
  const id = link.slice(FRAME_LINK_PREFIX.length);
  return SCREEN_ID.test(id) ? id : null;
}

export function isFrameLink(link: string | null | undefined): boolean {
  return screenIdFromLink(link) !== null;
}
