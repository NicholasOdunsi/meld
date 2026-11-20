import type { ComponentType, ReactNode, SVGProps } from "react";
import type { DockTool } from "./tools";

function lineIcon(displayName: string, paths: ReactNode) {
  const Icon = (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {paths}
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
}

export const TOOL_ICONS: Record<DockTool | "code", ComponentType<SVGProps<SVGSVGElement>>> = {
  select: lineIcon("SelectIcon", <path d="M5 3l14 8-6 2-3 6z" />),
  hand: lineIcon("HandIcon", <path d="M8 13V5a2 2 0 0 1 4 0v6m0-1V4a2 2 0 0 1 4 0v7m0-3a2 2 0 0 1 4 0v6a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3l-3-5a2 2 0 0 1 3-2l2 2" />),
  frame: lineIcon("FrameIcon", <path d="M7 3v18M17 3v18M3 7h18M3 17h18" />),
  pen: lineIcon("PenIcon", <path d="M4 20c4-1 5-6 8-9s6-5 8-7M14 6l4 4" />),
  rectangle: lineIcon("RectangleIcon", <rect x="4" y="5" width="16" height="14" rx="2" />),
  ellipse: lineIcon("EllipseIcon", <ellipse cx="12" cy="12" rx="8" ry="7" />),
  arrow: lineIcon("ArrowIcon", <path d="M5 19L19 5M10 5h9v9" />),
  text: lineIcon("TextIcon", <path d="M5 5h14M12 5v14M9 19h6" />),
  image: lineIcon("ImageIcon", <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>),
  eraser: lineIcon("EraserIcon", <path d="M7 20h11M4 15l9-9 6 6-7 7H8z" />),
  code: lineIcon("CodeIcon", <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />),
};
