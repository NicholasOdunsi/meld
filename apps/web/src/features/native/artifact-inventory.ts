import type { InspirationItemView } from "@meld/contracts";
import type { RoomDesignScreen } from "@/features/design/design-screen-generation";
import type { RoomPrd } from "@/features/prd/schemas";
import type { RoomMessage } from "@/features/rooms/repository";
import type { StreamArtifact, StreamMessageRow, StreamStar } from "./bridge";

export function linkArtifactsToStars(artifacts: StreamArtifact[], stars: StreamStar[], messages: StreamMessageRow[]): StreamArtifact[] {
  const starByMessage = new Map<string, string>();
  for (const star of stars) {
    starByMessage.set(star.sourceMessageId, star.id);
    for (const followup of star.followupMessageIds) starByMessage.set(followup, star.id);
  }
  const starIDs = new Set(stars.map((star) => star.id));
  for (const message of messages) {
    if (message.taskId && starIDs.has(message.taskId)) starByMessage.set(message.id, message.taskId);
  }
  return artifacts.map((item) => ({
    ...item, starId: item.sourceMessageId ? starByMessage.get(item.sourceMessageId) ?? null : item.starId,
  }));
}

export function buildArtifactInventory(input: {
  basePath: string;
  prd: RoomPrd | null;
  screens: RoomDesignScreen[];
  inspiration: InspirationItemView[];
  messages: RoomMessage[];
}): StreamArtifact[] {
  const artifacts: StreamArtifact[] = [];
  if (input.prd) {
    artifacts.push({ id: `prd:${input.prd.id}`, kind: "prd", title: `PRD · version ${input.prd.version}`,
      href: `${input.basePath}?tab=prd`, starId: null, createdAt: input.prd.createdAt });
  }
  const builtScreens = input.screens.filter((item) => item.state === "built");
  if (builtScreens.length > 0) {
    artifacts.push({ id: "prototype", kind: "prototype", title: "Prototype",
      href: `${input.basePath}?tab=prototype`, starId: null, createdAt: null });
  }
  for (const screen of builtScreens) {
    artifacts.push({ id: `screen:${screen.id}`, kind: "screen", title: screen.name,
      href: `${input.basePath}?tab=prototype&screen=${screen.id}`, starId: null, createdAt: null });
  }
  for (const item of input.inspiration) {
    artifacts.push({ id: `inspiration:${item.id}`, kind: "inspiration", title: item.note || "Inspiration image",
      href: `${input.basePath}?tab=inspiration`, previewUrl: item.imageUrl, mimeType: item.mimeType,
      starId: null, createdAt: item.createdAt });
  }
  for (const message of input.messages) {
    for (const file of message.attachments) {
      artifacts.push({ id: `file:${file.id}`, kind: "file", title: file.originalName,
        href: file.viewUrl, mimeType: file.mimeType,
        starId: null, sourceMessageId: message.id, createdAt: message.createdAt });
    }
  }
  return artifacts;
}
