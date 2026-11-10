import { notFound } from "next/navigation";
import { CanvasPrototype } from "@/features/canvas-next/canvas-prototype";

export default function CanvasPrototypePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <CanvasPrototype />;
}
