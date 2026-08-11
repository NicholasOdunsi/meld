export type RoomAttachmentView = {
  id: string;
  messageId: string | null;
  originalName: string;
  mimeType: string;
  caption: string | null;
  extractionStatus: string;
  viewUrl: string | null;
};
