export type RoomStarMetadata = {
  taskId: string;
  title: string;
  constellation: string | null;
  followupMessageIds: string[];
};

export type RoomConstellation = { id: string; name: string };
