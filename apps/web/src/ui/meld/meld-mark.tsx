import type { SVGProps } from "react";

// The 16x16 pixel squircle, drawn as ONE path with `fill-rule="evenodd"` so
// the four inner stair-steps are genuine holes.
//
// The previous `/meld-mark.svg` painted those steps `#fff` and relied on the
// page being white. On the sign-in wash that produced a visible white square
// behind the mark. It also carried an internal `prefers-color-scheme: dark`
// rule that blanked the surface -- and because an SVG loaded through <img>
// evaluates media queries against the OS rather than the document, that rule
// survived the switch to light mode and erased the logo entirely for anyone on
// a dark-mode machine. Inlining it fixes both: the holes are transparent, and
// the colour follows `currentColor`.
const MARK_PATH =
  "M3 0H13V1H15V3H16V13H15V15H13V16H3V15H1V13H0V3H1V1H3V0ZM1 1H8V8H6V6H4V4H1V1ZM8 1H15V4H12V6H10V8H8V1ZM15 15H8V8H10V10H12V12H15V15ZM1 15V12H4V10H6V8H8V15H1Z";

export type MeldMarkProps = Omit<SVGProps<SVGSVGElement>, "viewBox"> & {
  /** Rendered size in px. Multiples of 16 stay pixel-crisp. */
  size?: number;
  /** Accessible name. Omit entirely when the mark is decorative. */
  title?: string;
};

/**
 * The Meld logo mark.
 *
 * Inherits `currentColor`, so it sits on any surface and can take a brand
 * colour directly. Sizes that are multiples of 16 land exactly on the pixel
 * grid; anything else will soften the edges.
 */
export function MeldMark({ size = 48, title, ...rest }: MeldMarkProps) {
  return (
    <svg
      {...rest}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <path fill="currentColor" fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}
