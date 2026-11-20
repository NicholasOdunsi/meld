import { ArrowUpRight, Circle, CodeXml, Eraser, Frame, Hand, ImageIcon, MousePointer2, Pencil, Shapes, Square, Type } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { DockTool } from "./tools";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// Lucide's rounded outline set, one weight throughout.
export const TOOL_ICONS: Record<DockTool | "shapes" | "code", Icon> = {
  select: MousePointer2,
  hand: Hand,
  frame: Frame,
  pen: Pencil,
  shapes: Shapes,
  rectangle: Square,
  ellipse: Circle,
  arrow: ArrowUpRight,
  text: Type,
  image: ImageIcon,
  eraser: Eraser,
  code: CodeXml,
};
