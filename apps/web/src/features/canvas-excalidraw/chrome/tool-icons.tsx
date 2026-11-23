import { ArrowUpRight, Circle, CodeXml, Diamond, Eraser, Frame, Hand, ImageIcon, MousePointer2, Pencil, Shapes, Slash, Square, Triangle, Type } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { DockTool } from "./tools";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// Lucide's rounded outline set, one weight throughout.
export const TOOL_ICONS: Record<DockTool | "shapes" | "triangle" | "code", Icon> = {
  select: MousePointer2,
  hand: Hand,
  frame: Frame,
  pen: Pencil,
  shapes: Shapes,
  rectangle: Square,
  ellipse: Circle,
  triangle: Triangle,
  diamond: Diamond,
  line: Slash,
  arrow: ArrowUpRight,
  text: Type,
  image: ImageIcon,
  eraser: Eraser,
  code: CodeXml,
};
