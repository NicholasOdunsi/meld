import { notFound } from "next/navigation";
import { BoardLoader } from "@/features/canvas-excalidraw/board-loader";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function CanvasExcalidrawPage({ searchParams }: { searchParams: Promise<Params> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const board = first(params.board);
  const room = first(params.room);
  return (
    <BoardLoader
      boardId={board && UUID.test(board) ? board : undefined}
      roomId={room && UUID.test(room) ? room : undefined}
      access={first(params.access) === "view" ? "view" : "edit"}
    />
  );
}
