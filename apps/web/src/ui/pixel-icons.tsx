import { forwardRef } from "react";
import type { ReactNode, SVGProps } from "react";

// Hand-inlined glyphs from the HackerNoon Pixel Icon Library
// (https://github.com/hackernoon/pixel-icon-library, MIT project / CC BY 4.0
// icons) -- trialled as an alternate icon style for Room stages and Project
// icons, standing in for boxicons at those call sites. The library ships as
// raw SVG/PNG/font assets rather than React components, so each icon is
// inlined here (same hand-authored-SVG pattern as `stage-progress-ring.tsx`)
// instead of adding a font/webpack loader for a couple dozen glyphs.
//
// Coverage gap: this 248-icon set has no literal rocket, target, shield,
// compass, puzzle, or gift glyph. Those Project icon options (plus heart,
// which does have a literal glyph but didn't read as business-appropriate)
// render a business-flavoured substitute instead -- see that section below.
//
// Every glyph carries both the library's "regular" (line/outline) and
// "solid" (filled) variants -- `pack="basic"` (the boxicons default) picks
// the outline, `pack="filled"` picks the solid shape, same switch boxicons
// itself exposes.
//
// Shaped as a drop-in for BOTH call-site conventions this app's icons use:
//  - Room stage icons go through the DS `Icon` wrapper (`IconType` =
//    `ComponentType<SVGProps<SVGSVGElement>>`), which resolves its own
//    `size`/`color` into `className`/`style` and spreads only that through
//    -- no `pack`/`size` prop ever reaches the component directly there, so
//    those stay on the outline variant unless a caller passes one explicitly.
//  - Project icons (sidebar row + create-dialog picker) render
//    `PROJECT_ICON_COMPONENTS[icon]` directly as a boxicons-shaped component
//    (`pack`/`size`/`fill` passed straight through, no DS wrapper), the same
//    contract `RowGlyph`/`OptionIcon` already use for the chevron glyphs
//    they're interchangeable with.
// Handling boxicons' own `size` preset (only when explicitly passed -- the
// DS-wrapped path never passes one, so it falls through to CSS sizing) is
// what makes one factory satisfy both without a second, parallel icon set.
const BOXICON_SIZE_PX: Record<string, number> = {
  xs: 16,
  sm: 20,
  base: 24,
  md: 36,
  lg: 48,
  xl: 64,
  "2xl": 96,
  "3xl": 128,
  "4xl": 256,
  "5xl": 512,
};

type PixelIconProps = SVGProps<SVGSVGElement> & {
  pack?: string;
  size?: keyof typeof BOXICON_SIZE_PX;
};

function pixelIcon(displayName: string, basicPaths: ReactNode, filledPaths: ReactNode) {
  const PixelIcon = forwardRef<SVGSVGElement, PixelIconProps>(
    ({ pack, size, fill = "currentColor", width, height, ...rest }, ref) => (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill={fill}
        width={width ?? (size ? BOXICON_SIZE_PX[size] : undefined)}
        height={height ?? (size ? BOXICON_SIZE_PX[size] : undefined)}
        {...rest}
      >
        {pack === "filled" ? filledPaths : basicPaths}
      </svg>
    ),
  );
  PixelIcon.displayName = displayName;
  return PixelIcon;
}

// -- Room stage glyphs --------------------------------------------------

export const PixelLightBulb = pixelIcon(
  "PixelLightBulb",
  <>
    <polygon points="14 21 14 22 13 22 13 23 11 23 11 22 10 22 10 21 14 21" />
    <rect x="11" y="4" width="2" height="1" />
    <rect x="10" y="5" width="1" height="1" />
    <path d="m19,7v-2h-1v-1h-1v-1h-1v-1h-2v-1h-4v1h-2v1h-1v1h-1v1h-1v2h-1v4h1v2h1v1h1v1h1v1h1v4h6v-4h1v-1h1v-1h1v-1h1v-2h1v-4h-1Zm-1,4h-1v2h-1v1h-1v1h-1v1h-4v-1h-1v-1h-1v-1h-1v-2h-1v-4h1v-2h1v-1h2v-1h4v1h2v1h1v2h1v4Z" />
    <rect x="9" y="6" width="1" height="1" />
    <rect x="8" y="7" width="1" height="2" />
  </>,
  <>
    <rect x="2" y="1" width="1" height="1" />
    <rect x="3" y="2" width="1" height="1" />
    <rect x="4" y="3" width="1" height="1" />
    <rect x="1" y="16" width="1" height="1" />
    <rect x="2" y="15" width="1" height="1" />
    <rect x="3" y="14" width="1" height="1" />
    <rect x="22" y="16" width="1" height="1" />
    <rect x="21" y="15" width="1" height="1" />
    <rect x="20" y="14" width="1" height="1" />
    <rect x="21" y="1" width="1" height="1" />
    <rect x="20" y="2" width="1" height="1" />
    <rect x="19" y="3" width="1" height="1" />
    <rect x="1" y="8" width="2" height="1" />
    <polygon points="15 18 15 21 14 21 14 22 13 22 13 23 11 23 11 22 10 22 10 21 9 21 9 18 15 18" />
    <path d="m19,5h-1v-1h-1v-1h-1v-1h-2v-1h-4v1h-2v1h-1v1h-1v1h-1v2h-1v4h1v2h1v1h1v1h1v1h1v1h6v-1h1v-1h1v-1h1v-1h1v-2h1v-4h-1v-2Zm-12,2h1v-1h1v-1h1v-1h3v1h-3v1h-1v1h-1v2h-1v-2Z" />
    <rect x="21" y="8" width="2" height="1" />
  </>,
);

export const PixelPen = pixelIcon(
  "PixelPen",
  <>
    <polygon points="23 5 23 7 22 7 22 8 21 8 21 9 20 9 20 10 19 10 19 9 18 9 18 8 17 8 17 7 16 7 16 6 15 6 15 5 14 5 14 4 15 4 15 3 16 3 16 2 17 2 17 1 19 1 19 2 20 2 20 3 21 3 21 4 22 4 22 5 23 5" />
    <path d="m17,10v-1h-1v-1h-1v-1h-1v-1h-2v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v6h6v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-2h-1Zm-2,2v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1H3v-4h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h2v1h1v1h1v2h-1Z" />
  </>,
  <>
    <polygon points="17 10 18 10 18 12 17 12 17 13 16 13 16 14 15 14 15 15 14 15 14 16 13 16 13 17 12 17 12 18 11 18 11 19 10 19 10 20 9 20 9 21 8 21 8 22 7 22 7 23 1 23 1 17 2 17 2 16 3 16 3 15 4 15 4 14 5 14 5 13 6 13 6 12 7 12 7 11 8 11 8 10 9 10 9 9 10 9 10 8 11 8 11 7 12 7 12 6 14 6 14 7 15 7 15 8 16 8 16 9 17 9 17 10" />
    <polygon points="23 5 23 7 22 7 22 8 21 8 21 9 20 9 20 10 19 10 19 9 18 9 18 8 17 8 17 7 16 7 16 6 15 6 15 5 14 5 14 4 15 4 15 3 16 3 16 2 17 2 17 1 19 1 19 2 20 2 20 3 21 3 21 4 22 4 22 5 23 5" />
  </>,
);

export const PixelPaintBrush = pixelIcon(
  "PixelPaintBrush",
  <path d="M19,2V1H4V2H3V16H4v1H9v4h1v1h1v1h2V22h1V21h1V17h4V16h1V2ZM13,21H11V19h2Zm5-7H5V3H7V5H9V3h2V7h2V3h5Z" />,
  <>
    <polygon points="20 2 20 12 3 12 3 2 4 2 4 1 7 1 7 4 9 4 9 1 11 1 11 6 13 6 13 1 19 1 19 2 20 2" />
    <path d="M3,14v2H4v1H9v4h1v1h1v1h2V22h1V21h1V17h4V16h1V14Zm8,7V19h2v2Z" />
  </>,
);

export const PixelCode = pixelIcon(
  "PixelCode",
  <>
    <polygon points="7 7 7 8 6 8 6 9 5 9 5 10 4 10 4 11 3 11 3 13 4 13 4 14 5 14 5 15 6 15 6 16 7 16 7 17 5 17 5 16 4 16 4 15 3 15 3 14 2 14 2 13 1 13 1 11 2 11 2 10 3 10 3 9 4 9 4 8 5 8 5 7 7 7" />
    <polygon points="15 3 16 3 16 6 15 6 15 9 14 9 14 12 13 12 13 14 12 14 12 17 11 17 11 20 10 20 10 21 9 21 9 18 10 18 10 15 11 15 11 12 12 12 12 10 13 10 13 7 14 7 14 4 15 4 15 3" />
    <polygon points="23 11 23 13 22 13 22 14 21 14 21 15 20 15 20 16 19 16 19 17 17 17 17 16 18 16 18 15 19 15 19 14 20 14 20 13 21 13 21 11 20 11 20 10 19 10 19 9 18 9 18 8 17 8 17 7 19 7 19 8 20 8 20 9 21 9 21 10 22 10 22 11 23 11" />
  </>,
  <>
    <polygon points="15 4 16 4 16 6 15 6 15 9 14 9 14 12 13 12 13 14 12 14 12 17 11 17 11 20 10 20 10 21 9 21 9 20 8 20 8 18 9 18 9 15 10 15 10 12 11 12 11 10 12 10 12 7 13 7 13 4 14 4 14 3 15 3 15 4" />
    <polygon points="23 11 23 13 22 13 22 14 21 14 21 15 20 15 20 16 19 16 19 17 17 17 17 15 18 15 18 14 19 14 19 13 20 13 20 11 19 11 19 10 18 10 18 9 17 9 17 7 19 7 19 8 20 8 20 9 21 9 21 10 22 10 22 11 23 11" />
    <polygon points="7 7 7 9 6 9 6 10 5 10 5 11 4 11 4 13 5 13 5 14 6 14 6 15 7 15 7 17 5 17 5 16 4 16 4 15 3 15 3 14 2 14 2 13 1 13 1 11 2 11 2 10 3 10 3 9 4 9 4 8 5 8 5 7 7 7" />
  </>,
);

// -- Project icon-picker glyphs ------------------------------------------

export const PixelFolder = pixelIcon(
  "PixelFolder",
  <path d="m22,6v-1h-9v-1h-1v-1h-1v-1H2v1h-1v18h1v1h20v-1h1V6h-1Zm-1,14H3V4h7v1h1v1h1v1h9v13Z" />,
  <polygon points="23 6 23 21 22 21 22 22 2 22 2 21 1 21 1 3 2 3 2 2 11 2 11 3 12 3 12 4 13 4 13 5 22 5 22 6 23 6" />,
);

export const PixelFile = pixelIcon(
  "PixelFile",
  <path d="M14 2H5v20h14V7h-5V2Zm-7 2h5v5h5v11H7V4Z" />,
  <polygon points="14 2 14 7 19 7 19 22 5 22 5 2 14 2" />,
);

export const PixelFlag = pixelIcon(
  "PixelFlag",
  <path d="m21,4v1h-2v1h-6v-1h-7v1h-1v-1h1v-2h-1v-1h-2v1h-1v2h1v17h2v-4h1v-1h7v1h6v-1h2v-1h1V4h-1Zm-1,11h-1v1h-6v-1h-7v1h-1v-8h1v-1h7v1h6v-1h1v8Z" />,
  <polygon points="22 4 22 16 21 16 21 17 19 17 19 18 13 18 13 17 6 17 6 18 5 18 5 22 3 22 3 5 2 5 2 3 3 3 3 2 5 2 5 3 6 3 6 5 5 5 5 6 6 6 6 5 13 5 13 6 19 6 19 5 21 5 21 4 22 4" />,
);

export const PixelStar = pixelIcon(
  "PixelStar",
  <path d="m16,8v-2h-1v-2h-1v-2h-1v-1h-2v1h-1v2h-1v2h-1v2H1v2h1v1h1v1h1v1h1v1h1v5h-1v4h2v-1h2v-1h2v-1h2v1h2v1h2v1h2v-4h-1v-5h1v-1h1v-1h1v-1h1v-1h1v-2h-7Zm4,3h-1v1h-1v1h-1v1h-1v5h1v1h-2v-1h-2v-1h-2v1h-2v1h-2v-1h1v-5h-1v-1h-1v-1h-1v-1h-1v-1h4v-1h1v-1h1v-2h1v-2h2v2h1v2h1v1h1v1h4v1Z" />,
  <polygon points="23 8 23 10 22 10 22 11 21 11 21 12 20 12 20 13 19 13 19 14 18 14 18 19 19 19 19 23 17 23 17 22 15 22 15 21 13 21 13 20 11 20 11 21 9 21 9 22 7 22 7 23 5 23 5 19 6 19 6 14 5 14 5 13 4 13 4 12 3 12 3 11 2 11 2 10 1 10 1 8 8 8 8 6 9 6 9 4 10 4 10 2 11 2 11 1 13 1 13 2 14 2 14 4 15 4 15 6 16 6 16 8 23 8" />,
);

export const PixelBriefcase = pixelIcon(
  "PixelBriefcase",
  <path d="M22,7V6H17V3H16V2H8V3H7V6H2V7H1V21H2v1H22V21h1V7ZM9,4h6V6H9ZM21,19H20v1H4V19H3V14H9v2h6V14h6Zm0-7H3V9H4V8H20V9h1Z" />,
  <>
    <path d="M22,7V6H17V3H16V2H8V3H7V6H2V7H1v6H23V7ZM9,4h6V6H9Z" />
    <polygon points="23 15 23 21 22 21 22 22 2 22 2 21 1 21 1 15 9 15 9 17 15 17 15 15 23 15" />
  </>,
);

export const PixelChartLine = pixelIcon(
  "PixelChartLine",
  <>
    <polygon points="22 5 22 12 21 12 21 8 19 8 19 9 18 9 18 10 17 10 17 11 16 11 16 12 15 12 15 13 14 13 14 14 13 14 13 13 12 13 12 12 11 12 11 11 10 11 10 10 9 10 9 11 8 11 8 12 7 12 7 13 6 13 6 11 7 11 7 10 8 10 8 9 9 9 9 8 10 8 10 9 11 9 11 10 12 10 12 11 13 11 13 12 14 12 14 11 15 11 15 10 16 10 16 9 17 9 17 8 18 8 18 7 19 7 19 6 15 6 15 5 22 5" />
    <polygon points="23 18 23 20 2 20 2 19 1 19 1 4 3 4 3 18 23 18" />
  </>,
  <>
    <polygon points="6 13 6 11 7 11 7 10 8 10 8 9 9 9 9 8 10 8 10 9 11 9 11 10 12 10 12 11 13 11 13 12 14 12 14 11 15 11 15 10 16 10 16 9 17 9 17 7 16 7 16 6 15 6 15 5 22 5 22 12 21 12 21 11 20 11 20 10 18 10 18 11 17 11 17 12 16 12 16 13 15 13 15 14 14 14 14 15 13 15 13 14 12 14 12 13 11 13 11 12 10 12 10 11 9 11 9 12 8 12 8 13 6 13" />
    <polygon points="23 17 23 20 2 20 2 19 1 19 1 4 4 4 4 17 23 17" />
  </>,
);

export const PixelCalendar = pixelIcon(
  "PixelCalendar",
  <>
    <rect x="6" y="1" width="2" height="6" />
    <rect x="9" y="4" width="6" height="2" />
    <rect x="16" y="1" width="2" height="6" />
    <path d="M22,5V4H19V6h2V9H3V6H5V4H2V5H1V22H2v1H22V22h1V5ZM21,21H3V11H21Z" />
  </>,
  <>
    <rect x="16" y="1" width="2" height="1" />
    <rect x="6" y="1" width="2" height="1" />
    <polygon points="23 5 23 9 1 9 1 5 2 5 2 4 5 4 5 2 6 2 6 7 8 7 8 2 9 2 9 4 15 4 15 2 16 2 16 7 18 7 18 2 19 2 19 4 22 4 22 5 23 5" />
    <polygon points="23 11 23 22 22 22 22 23 2 23 2 22 1 22 1 11 23 11" />
  </>,
);

// No literal history/clock-with-arrow glyph in the library -- a plain clock
// face (stepped-octagon ring + two hands, same disconnected-rect technique
// PixelCalendar/PixelGlobe use for their basic variant) is the closest
// available reading for a room/design "History" timeline.
export const PixelHistory = pixelIcon(
  "PixelHistory",
  <>
    <rect x="8" y="2" width="8" height="2" />
    <rect x="16" y="4" width="2" height="2" />
    <rect x="18" y="6" width="2" height="2" />
    <rect x="20" y="8" width="2" height="8" />
    <rect x="18" y="16" width="2" height="2" />
    <rect x="16" y="18" width="2" height="2" />
    <rect x="8" y="20" width="8" height="2" />
    <rect x="6" y="18" width="2" height="2" />
    <rect x="4" y="16" width="2" height="2" />
    <rect x="2" y="8" width="2" height="8" />
    <rect x="4" y="6" width="2" height="2" />
    <rect x="6" y="4" width="2" height="2" />
    <rect x="11" y="6" width="2" height="7" />
    <rect x="12" y="11" width="5" height="2" />
  </>,
  <>
    <rect x="8" y="2" width="8" height="3" />
    <rect x="16" y="4" width="3" height="3" />
    <rect x="18" y="6" width="3" height="3" />
    <rect x="20" y="8" width="3" height="9" />
    <rect x="18" y="16" width="3" height="3" />
    <rect x="16" y="18" width="3" height="3" />
    <rect x="8" y="20" width="8" height="3" />
    <rect x="6" y="18" width="3" height="3" />
    <rect x="4" y="16" width="3" height="3" />
    <rect x="2" y="8" width="3" height="9" />
    <rect x="4" y="6" width="3" height="3" />
    <rect x="6" y="4" width="3" height="3" />
    <rect x="11" y="5" width="3" height="8" />
    <rect x="12" y="11" width="6" height="3" />
    <rect x="11" y="11" width="3" height="3" />
  </>,
);

export const PixelBookmark = pixelIcon(
  "PixelBookmark",
  <path d="m19,2v-1H5v1h-1v21h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h2v1h1v1h1v1h1v1h1v1h1v1h1v1h1V2h-1Zm-1,16h-1v-1h-1v-1h-1v-1h-1v-1h-4v1h-1v1h-1v1h-1v1h-1V4h1v-1h10v1h1v14Z" />,
  <polygon points="20 2 20 23 19 23 19 22 18 22 18 21 17 21 17 20 16 20 16 19 15 19 15 18 14 18 14 17 13 17 13 16 11 16 11 17 10 17 10 18 9 18 9 19 8 19 8 20 7 20 7 21 6 21 6 22 5 22 5 23 4 23 4 2 5 2 5 1 19 1 19 2 20 2" />,
);

export const PixelTrophy = pixelIcon(
  "PixelTrophy",
  <path d="m18,4v-2H6v2H1v5h1v2h1v1h1v1h1v1h1v1h1v1h3v1h2v3h-4v3h10v-3h-4v-3h2v-1h3v-1h1v-1h1v-1h1v-1h1v-2h1v-5h-5Zm-10,9h-2v-1h-1v-1h-1v-2h-1v-3h2v1h1v2h1v3h1v1Zm0-4v-5h8v5h-1v3h-1v2h-4v-2h-1v-3h-1Zm12,0v2h-1v1h-1v1h-2v-1h1v-2h1v-3h1v-1h2v3h-1Z" />,
  <path d="m18,4v-2H6v2H1v5h1v2h1v1h1v1h1v1h1v1h3v1h2v3h-4v3h10v-3h-4v-3h2v-1h3v-1h1v-1h1v-1h1v-1h1v-2h1v-5h-5ZM5,12v-1h-1v-2h-1v-3h2v1h1v2h1v3h1v1h-2v-1h-1Zm16-3h-1v2h-1v1h-1v1h-2v-1h1v-2h1v-3h1v-1h2v3Z" />,
);

// No literal shield glyph -- lock is the closest "protection" substitute.
export const PixelShield = pixelIcon(
  "PixelShield",
  <path d="m21,12v-1h-3v-6h-1v-2h-1v-1h-2v-1h-4v1h-2v1h-1v2h-1v6h-3v1h-1v10h1v1h18v-1h1v-10h-1Zm-1,1v8H4v-8h16ZM9,5v-1h1v-1h4v1h1v1h1v6h-8v-6h1Z" />,
  <path d="m21,12v-1h-3v-6h-1v-2h-1v-1h-2v-1h-4v1h-2v1h-1v2h-1v6h-3v1h-1v10h1v1h18v-1h1v-10h-1Zm-6-1h-6v-6h1v-1h4v1h1v6Z" />,
);

// megaphone -> bullhorn, an exact match.
export const PixelMegaphone = pixelIcon(
  "PixelMegaphone",
  <path d="m22,10v-1h-1V3h-1v-1h-1v1h-1v1h-2v1h-2v1h-2v1H2v1h-1v7h1v1h3v5h1v1h2v-1h1v-5h3v1h2v1h2v1h2v1h1v1h1v-1h1v-6h1v-1h1v-3h-1Zm-3,7h-2v-1h-2v-1h-2v-1h-3v-5h3v-1h2v-1h2v-1h2v11Z" />,
  <>
    <polygon points="23 10 23 13 22 13 22 14 21 14 21 9 22 9 22 10 23 10" />
    <polygon points="2 7 8 7 8 22 6 22 6 21 5 21 5 16 2 16 2 15 1 15 1 8 2 8 2 7" />
    <polygon points="20 2 20 21 19 21 19 20 18 20 18 19 16 19 16 18 14 18 14 17 12 17 12 16 10 16 10 7 12 7 12 6 14 6 14 5 16 5 16 4 18 4 18 3 19 3 19 2 20 2" />
  </>,
);

export const PixelGlobe = pixelIcon(
  "PixelGlobe",
  <path d="m22,9v-2h-1v-2h-1v-1h-1v-1h-2v-1h-2v-1h-6v1h-2v1h-2v1h-1v1h-1v2h-1v2h-1v7h1v1h1v2h1v1h1v1h2v1h2v1h6v-1h2v-1h2v-1h1v-1h1v-2h1v-2h1v-6h-1Zm-1,1v4h-3v-4h3Zm-5-6h1v1h2v2h1v1h-3v-3h-1v-1Zm-2,14v2h-1v1h-2v-1h-1v-2h-1v-2h6v2h-1Zm2-8v4h-8v-4h8Zm-7-4h1v-2h1v-1h2v1h1v2h1v2h-6v-2Zm-5,1h1v-2h2v-1h1v1h-1v3h-3v-1Zm-1,7v-4h3v4h-3Zm2,5v-2h-1v-1h3v3h1v1h-1v-1h-2Zm14-2v2h-2v1h-1v-1h1v-3h3v1h-1Z" />,
  <>
    <rect x="9" y="1" width="1" height="1" />
    <polygon points="9 2 9 3 8 3 8 5 7 5 7 8 2 8 2 7 3 7 3 5 4 5 4 4 5 4 5 3 7 3 7 2 9 2" />
    <polygon points="13 2 14 2 14 4 15 4 15 6 16 6 16 8 8 8 8 6 9 6 9 4 10 4 10 2 11 2 11 1 13 1 13 2" />
    <rect x="14" y="1" width="1" height="1" />
    <polygon points="22 7 22 8 17 8 17 5 16 5 16 3 15 3 15 2 17 2 17 3 19 3 19 4 20 4 20 5 21 5 21 7 22 7" />
    <polygon points="17 10 17 14 16 14 16 15 8 15 8 14 7 14 7 10 8 10 8 9 16 9 16 10 17 10" />
    <polygon points="1 9 7 9 7 10 6 10 6 14 7 14 7 15 1 15 1 9" />
    <polygon points="23 9 23 15 17 15 17 14 18 14 18 10 17 10 17 9 23 9" />
    <polygon points="22 16 22 17 21 17 21 19 20 19 20 20 19 20 19 21 17 21 17 22 15 22 15 21 16 21 16 19 17 19 17 16 22 16" />
    <rect x="9" y="22" width="1" height="1" />
    <polygon points="9 21 9 22 7 22 7 21 5 21 5 20 4 20 4 19 3 19 3 17 2 17 2 16 7 16 7 19 8 19 8 21 9 21" />
    <rect x="14" y="22" width="1" height="1" />
    <polygon points="14 22 13 22 13 23 11 23 11 22 10 22 10 20 9 20 9 18 8 18 8 16 16 16 16 18 15 18 15 20 14 20 14 22" />
  </>,
);

// -- Business-flavoured substitutes -------------------------------------
// Swapped in for Project icon options that either had no equivalent in this
// set at all, or whose closest available substitute (a location pin, a
// shapes cluster, a literal heart) didn't read as a workspace/business
// glyph. See PROJECT_ICON_COMPONENTS in project-icons.tsx for which key
// each one now maps to. PixelTag further replaces two earlier substitutes
// for "gift" (a box+$, then a plain $) that either read too busy at
// 16-20px or didn't fit -- a price/gift tag is the current pick.

export const PixelTrending = pixelIcon(
  "PixelTrending",
  <polygon points="23 5 23 14 22 14 22 13 21 13 21 12 20 12 20 11 18 11 18 12 17 12 17 13 16 13 16 14 15 14 15 15 14 15 14 16 13 16 13 17 12 17 12 18 10 18 10 17 9 17 9 16 8 16 8 15 7 15 7 14 5 14 5 15 4 15 4 16 3 16 3 17 1 17 1 15 2 15 2 14 3 14 3 13 4 13 4 12 5 12 5 11 7 11 7 12 8 12 8 13 9 13 9 14 10 14 10 15 12 15 12 14 13 14 13 13 14 13 14 12 15 12 15 11 16 11 16 10 17 10 17 8 16 8 16 7 15 7 15 6 14 6 14 5 23 5" />,
  <polygon points="23 5 23 15 22 15 22 14 21 14 21 13 20 13 20 12 18 12 18 13 17 13 17 14 16 14 16 15 15 15 15 16 14 16 14 17 13 17 13 18 12 18 12 19 10 19 10 18 9 18 9 17 8 17 8 16 7 16 7 15 5 15 5 16 4 16 4 17 1 17 1 14 2 14 2 13 3 13 3 12 4 12 4 11 5 11 5 10 7 10 7 11 8 11 8 12 9 12 9 13 10 13 10 14 12 14 12 13 13 13 13 12 14 12 14 11 15 11 15 10 16 10 16 8 15 8 15 7 14 7 14 6 13 6 13 5 23 5" />,
);

export const PixelBadgeCheck = pixelIcon(
  "PixelBadgeCheck",
  <>
    <path d="m22,10v-1h-1v-4h-1v-1h-1v-1h-4v-1h-1v-1h-4v1h-1v1h-4v1h-1v1h-1v4h-1v1h-1v4h1v1h1v4h1v1h1v1h4v1h1v1h4v-1h1v-1h4v-1h1v-1h1v-4h1v-1h1v-4h-1Zm-1,4h-1v1h-1v4h-4v1h-1v1h-4v-1h-1v-1h-4v-4h-1v-1h-1v-4h1v-1h1v-4h4v-1h1v-1h4v1h1v1h4v4h1v1h1v4Z" />
    <polygon points="17 9 17 11 16 11 16 12 15 12 15 13 14 13 14 14 13 14 13 15 12 15 12 16 10 16 10 15 9 15 9 14 8 14 8 13 7 13 7 11 8 11 8 10 9 10 9 11 10 11 10 12 12 12 12 11 13 11 13 10 14 10 14 9 15 9 15 8 16 8 16 9 17 9" />
  </>,
  <path d="m22,10v-1h-1v-4h-1v-1h-1v-1h-4v-1h-1v-1h-4v1h-1v1h-4v1h-1v1h-1v4h-1v1h-1v4h1v1h1v4h1v1h1v1h4v1h1v1h4v-1h1v-1h4v-1h1v-1h1v-4h1v-1h1v-4h-1ZM7,11h1v-1h1v1h1v1h2v-1h1v-1h1v-1h1v-1h1v1h1v2h-1v1h-1v1h-1v1h-1v1h-1v1h-2v-1h-1v-1h-1v-1h-1v-2Z" />,
);

export const PixelHandshake = pixelIcon(
  "PixelHandshake",
  <polygon points="18 8 18 7 11 7 11 8 10 8 10 9 9 9 9 10 8 10 8 12 11 12 11 11 12 11 12 10 13 10 13 9 15 9 15 10 16 10 16 11 17 11 17 12 18 12 18 13 19 13 19 14 21 14 21 13 23 13 23 15 22 15 22 16 20 16 20 17 19 17 19 18 18 18 18 19 17 19 17 20 14 20 14 21 8 21 8 20 6 20 6 19 5 19 5 18 4 18 4 17 3 17 3 16 2 16 2 15 1 15 1 13 3 13 3 14 4 14 4 15 5 15 5 16 6 16 6 17 7 17 7 18 8 18 8 19 9 19 9 18 8 18 8 17 7 17 7 16 9 16 9 17 10 17 10 18 11 18 11 19 13 19 13 18 12 18 12 17 11 17 11 16 10 16 10 15 12 15 12 16 13 16 13 17 14 17 14 18 17 18 17 17 15 17 15 16 14 16 14 15 13 15 13 14 15 14 15 15 16 15 16 16 18 16 18 15 17 15 17 14 16 14 16 13 15 13 15 12 13 12 13 13 11 13 11 14 8 14 8 13 7 13 7 12 6 12 6 10 7 10 7 9 8 9 8 8 9 8 9 7 6 7 6 8 5 8 5 7 3 7 3 6 1 6 1 4 3 4 3 5 5 5 5 6 6 6 6 5 18 5 18 6 19 6 19 5 21 5 21 4 23 4 23 6 21 6 21 7 19 7 19 8 18 8" />,
  <>
    <polygon points="6 12 7 12 7 13 12 13 12 12 14 12 14 13 15 13 15 14 16 14 16 15 17 15 17 16 18 16 18 19 17 19 17 18 16 18 16 17 15 17 15 16 14 16 14 15 13 15 13 16 14 16 14 17 15 17 15 18 16 18 16 19 17 19 17 20 16 20 16 21 15 21 15 20 14 20 14 19 13 19 13 18 12 18 12 17 11 17 11 16 10 16 10 17 11 17 11 18 12 18 12 19 13 19 13 20 14 20 14 21 11 21 11 20 10 20 10 19 9 19 9 18 8 18 8 19 9 19 9 20 10 20 10 21 7 21 7 20 6 20 6 19 5 19 5 18 4 18 4 17 3 17 3 16 2 16 2 15 1 15 1 4 2 4 2 5 4 5 4 6 6 6 6 5 9 5 9 7 8 7 8 8 7 8 7 9 6 9 6 12" />
    <polygon points="23 4 23 15 22 15 22 16 21 16 21 17 20 17 20 16 19 16 19 15 18 15 18 14 17 14 17 13 16 13 16 12 15 12 15 11 14 11 14 10 12 10 12 11 11 11 11 12 7 12 7 10 8 10 8 9 9 9 9 8 10 8 10 7 11 7 11 6 12 6 12 5 17 5 17 6 20 6 20 5 22 5 22 4 23 4" />
  </>,
);

export const PixelSitemap = pixelIcon(
  "PixelSitemap",
  <path d="M22,17V16H21V12H20V11H13V8h2V2H9V8h2v3H4v1H3v4H2v1H1v4H2v1H6V21H7V17H6V16H5V13h6v3H10v1H9v4h1v1h4V21h1V17H14V16H13V13h6v3H18v1H17v4h1v1h4V21h1V17Zm-9,1v2H11V18Zm8,0v2H19V18ZM3,20V18H5v2ZM11,6V4h2V6Z" />,
  <polygon points="23 17 23 21 22 21 22 22 18 22 18 21 17 21 17 17 18 17 18 16 19 16 19 13 13 13 13 16 14 16 14 17 15 17 15 21 14 21 14 22 10 22 10 21 9 21 9 17 10 17 10 16 11 16 11 13 5 13 5 16 6 16 6 17 7 17 7 21 6 21 6 22 2 22 2 21 1 21 1 17 2 17 2 16 3 16 3 12 4 12 4 11 11 11 11 8 9 8 9 2 15 2 15 8 13 8 13 11 20 11 20 12 21 12 21 16 22 16 22 17 23 17" />,
);

export const PixelMerge = pixelIcon(
  "PixelMerge",
  <path d="M21,11V10H17v1H16v1H11V11H9V10H8V9H7V7H8V6H9V2H8V1H4V2H3V6H4V7H5V17H4v1H3v4H4v1H8V22H9V18H8V17H7V11H8v1H9v1h2v1h5v1h1v1h4V15h1V11ZM5,3H7V5H5ZM7,21H5V19H7Zm13-7H18V12h2Z" />,
  <path d="M21,11V10H20V9H17v1H16v1H11V10H9V9H8V8H7V7H8V6H9V3H8V2H7V1H4V2H3V3H2V6H3V7H4V17H3v1H2v3H3v1H4v1H7V22H8V21H9V18H8V17H7V11H8v1H9v1h2v1h5v1h1v1h3V15h1V14h1V11ZM5,4V3H6V4H7V5H6V6H5V5H4V4ZM6,20v1H5V20H4V19H5V18H6v1H7v1Zm13-7v1H18V13H17V12h1V11h1v1h1v1Z" />,
);

export const PixelTag = pixelIcon(
  "PixelTag",
  <>
    <polygon points="8 5 8 7 7 7 7 8 5 8 5 7 4 7 4 5 5 5 5 4 7 4 7 5 8 5" />
    <path d="m22,13v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1H2v1h-1v9h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h2v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-2h-1ZM3,3h7v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v2h-1v1h-1v1h-1v1h-1v1h-1v1h-2v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1V3Z" />
  </>,
  <path d="m22,13v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1H2v1h-1v9h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h2v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-2h-1ZM4,5h1v-1h2v1h1v2h-1v1h-2v-1h-1v-2Z" />,
);

export const PixelClipboard = pixelIcon(
  "PixelClipboard",
  <path d="m19,5v-1h-3v-1h-1v-1h-1v-1h-4v1h-1v1h-1v1h-3v1h-1v17h1v1h14v-1h1V5h-1Zm-9-2h1v-1h2v1h1v2h-1v1h-2v-1h-1v-2Zm-4,3h2v1h8v-1h2v15H6V6Z" />,
  <>
    <path d="m15,3v-1h-1v-1h-4v1h-1v1h-1v3h1v1h6v-1h1v-3h-1Zm-4,3v-1h-1v-2h1v-1h2v1h1v2h-1v1h-2Z" />
    <polygon points="20 5 20 22 19 22 19 23 5 23 5 22 4 22 4 5 5 5 5 4 7 4 7 7 8 7 8 8 16 8 16 7 17 7 17 4 19 4 19 5 20 5" />
  </>,
);

// -- Additional business Project icons ------------------------------------

export const PixelBank = pixelIcon(
  "PixelBank",
  <>
    <polygon points="14 4 14 6 13 6 13 7 11 7 11 6 10 6 10 4 11 4 11 3 13 3 13 4 14 4" />
    <path d="m21,20v-1h-1v-9h-2v9h-2v-9h-2v9h-4v-9h-2v9h-2v-9h-2v9h-1v1H1v2h1v1h20v-1h1v-2h-2Zm0,2H3v-1h1v-1h16v1h1v1Z" />
    <polygon points="22 7 22 8 21 8 21 9 3 9 3 8 2 8 2 7 4 7 4 8 20 8 20 7 22 7" />
    <polygon points="23 5 23 7 22 7 22 6 19 6 19 5 17 5 17 4 15 4 15 3 13 3 13 2 11 2 11 3 9 3 9 4 7 4 7 5 5 5 5 6 2 6 2 7 1 7 1 5 4 5 4 4 6 4 6 3 8 3 8 2 10 2 10 1 14 1 14 2 16 2 16 3 18 3 18 4 20 4 20 5 23 5" />
  </>,
  <>
    <polygon points="23 20 23 22 22 22 22 23 2 23 2 22 1 22 1 20 3 20 3 19 4 19 4 10 6 10 6 19 8 19 8 10 10 10 10 19 14 19 14 10 16 10 16 19 18 19 18 10 20 10 20 19 21 19 21 20 23 20" />
    <path d="m20,5v-1h-2v-1h-2v-1h-2v-1h-4v1h-2v1h-2v1h-2v1H1v2h1v1h1v1h18v-1h1v-1h1v-2h-3Zm-9,2v-1h-1v-2h1v-1h2v1h1v2h-1v1h-2Z" />
  </>,
);

export const PixelCoins = pixelIcon(
  "PixelCoins",
  <>
    <polygon points="23 4 23 15 22 15 22 16 19 16 19 14 21 14 21 12 19 12 19 10 21 10 21 8 18 8 18 6 20 6 20 4 18 4 18 3 11 3 11 4 9 4 9 5 7 5 7 3 9 3 9 2 11 2 11 1 18 1 18 2 20 2 20 3 22 3 22 4 23 4" />
    <path d="M15,8V7H12V6H6V7H3V8H1V21H3v1H6v1h6V22h3V21h2V8ZM3,9H6V8h6V9h3v2H12v1H6V11H3ZM15,20H12v1H6V20H3V17H6v1h6V17h3Zm-3-5v1H6V15H3V13H6v1h6V13h3v2Z" />
  </>,
  <>
    <polygon points="16 10 17 10 17 12 16 12 16 13 15 13 15 14 12 14 12 15 6 15 6 14 3 14 3 13 2 13 2 12 1 12 1 10 2 10 2 9 3 9 3 8 6 8 6 7 12 7 12 8 15 8 15 9 16 9 16 10" />
    <polygon points="17 15 17 17 15 17 15 18 12 18 12 19 6 19 6 18 3 18 3 17 1 17 1 15 3 15 3 16 6 16 6 17 12 17 12 16 15 16 15 15 17 15" />
    <polygon points="17 19 17 21 15 21 15 22 12 22 12 23 6 23 6 22 3 22 3 21 1 21 1 19 3 19 3 20 6 20 6 21 12 21 12 20 15 20 15 19 17 19" />
    <rect x="22" y="13" width="1" height="1" />
    <rect x="22" y="9" width="1" height="1" />
    <polygon points="23 4 23 6 22 6 22 7 21 7 21 8 18 8 18 7 16 7 16 6 12 6 12 5 6 5 6 4 7 4 7 3 8 3 8 2 11 2 11 1 18 1 18 2 21 2 21 3 22 3 22 4 23 4" />
    <polygon points="22 14 22 15 21 15 21 16 19 16 19 14 22 14" />
    <polygon points="22 10 22 11 21 11 21 12 19 12 19 10 22 10" />
  </>,
);

export const PixelCreditCard = pixelIcon(
  "PixelCreditCard",
  <>
    <path d="m22,5v-1H2v1h-1v14h1v1h20v-1h1V5h-1Zm-1,13H3v-7h18v7Zm0-10H3v-2h18v2Z" />
    <rect x="4" y="15" width="4" height="1" />
    <rect x="10" y="15" width="6" height="1" />
  </>,
  <>
    <path d="m1,11v8h1v1h20v-1h1v-8H1Zm3,4h4v1h-4v-1Zm6,0h6v1h-6v-1Z" />
    <polygon points="23 5 23 8 1 8 1 5 2 5 2 4 22 4 22 5 23 5" />
  </>,
);

export const PixelWallet = pixelIcon(
  "PixelWallet",
  <>
    <polygon points="18 12 18 13 19 13 19 15 18 15 18 16 16 16 16 15 15 15 15 13 16 13 16 12 18 12" />
    <polygon points="23 8 23 21 22 21 22 22 2 22 2 21 1 21 1 3 2 3 2 2 21 2 21 3 22 3 22 4 3 4 3 20 21 20 21 9 5 9 5 7 22 7 22 8 23 8" />
  </>,
  <path d="m22,8v-1H4v-2h18v-2h-1v-1H2v1h-1v18h1v1h20v-1h1v-13h-1Zm-1,7h-1v1h-2v-1h-1v-2h1v-1h2v1h1v2Z" />,
);

export const PixelCrown = pixelIcon(
  "PixelCrown",
  <path d="m22,7v-1h-2v1h-1v2h1v1h-1v1h-1v1h-2v-1h-1v-2h-1v-2h-1v-1h1v-2h-1v-1h-2v1h-1v2h1v1h-1v2h-1v2h-1v1h-2v-1h-1v-1h-1v-1h1v-2h-1v-1h-2v1h-1v2h1v1h1v4h1v3h1v2h1v2h12v-2h1v-2h1v-3h1v-4h1v-1h1v-2h-1Zm-4,7v3h-1v2H7v-2h-1v-3h-1v-1h1v1h2v-1h1v-1h1v-1h1v-2h2v2h1v1h1v1h1v1h2v-1h1v1h-1Z" />,
  <polygon points="23 7 23 9 22 9 22 10 21 10 21 14 20 14 20 17 19 17 19 19 18 19 18 21 6 21 6 19 5 19 5 17 4 17 4 14 3 14 3 10 2 10 2 9 1 9 1 7 2 7 2 6 4 6 4 7 5 7 5 9 4 9 4 10 5 10 5 11 6 11 6 12 8 12 8 11 9 11 9 9 10 9 10 7 11 7 11 6 10 6 10 4 11 4 11 3 13 3 13 4 14 4 14 6 13 6 13 7 14 7 14 9 15 9 15 11 16 11 16 12 18 12 18 11 19 11 19 10 20 10 20 9 19 9 19 7 20 7 20 6 22 6 22 7 23 7" />,
);

export const PixelGraduationCap = pixelIcon(
  "PixelGraduationCap",
  <path d="M22,8V7H20V6H17V5H15V4H13V3H11V4H9V5H7V6H4V7H2V8H1V21H3V10H4v1H5v7H6v1H7v1H9v1h6V20h2V19h1V18h1V11h1V10h2V9h1V8Zm-5,9H16v1H15v1H9V18H8V17H7V12H9v1h2v1h2V13h2V12h2Zm3-8H17v1H15v1H13v1H11V11H9V10H7V9H4V8H7V7H9V6h2V5h2V6h2V7h2V8h3Z" />,
  <>
    <polygon points="19 13 19 18 18 18 18 19 17 19 17 20 15 20 15 21 9 21 9 20 7 20 7 19 6 19 6 18 5 18 5 13 7 13 7 14 9 14 9 15 11 15 11 16 13 16 13 15 15 15 15 14 17 14 17 13 19 13" />
    <polygon points="23 8 23 9 22 9 22 10 20 10 20 11 17 11 17 12 15 12 15 13 13 13 13 14 11 14 11 13 9 13 9 12 7 12 7 11 4 11 4 10 3 10 3 21 1 21 1 8 2 8 2 7 4 7 4 6 7 6 7 5 9 5 9 4 11 4 11 3 13 3 13 4 15 4 15 5 17 5 17 6 20 6 20 7 22 7 22 8 23 8" />
  </>,
);

export const PixelAnalytics = pixelIcon(
  "PixelAnalytics",
  <>
    <rect x="2" y="15" width="2" height="7" />
    <rect x="8" y="10" width="2" height="12" />
    <rect x="14" y="14" width="2" height="8" />
    <rect x="20" y="10" width="2" height="12" />
    <rect x="18" y="5" width="1" height="1" />
    <rect x="17" y="6" width="1" height="1" />
    <rect x="14" y="7" width="2" height="1" />
    <rect x="14" y="10" width="2" height="1" />
    <rect x="13" y="8" width="1" height="2" />
    <rect x="16" y="8" width="1" height="2" />
    <rect x="12" y="6" width="1" height="1" />
    <rect x="11" y="5" width="1" height="1" />
    <rect x="8" y="4" width="2" height="1" />
    <rect x="8" y="1" width="2" height="1" />
    <rect x="10" y="2" width="1" height="2" />
    <rect x="7" y="2" width="1" height="2" />
    <rect x="20" y="4" width="2" height="1" />
    <rect x="19" y="2" width="1" height="2" />
    <rect x="20" y="1" width="2" height="1" />
    <rect x="22" y="2" width="1" height="2" />
    <rect x="6" y="6" width="1" height="1" />
    <rect x="5" y="7" width="1" height="1" />
    <rect x="4" y="9" width="1" height="2" />
    <rect x="1" y="9" width="1" height="2" />
    <rect x="2" y="8" width="2" height="1" />
    <rect x="2" y="11" width="2" height="1" />
  </>,
  <>
    <polygon points="10 11 11 11 11 21 10 21 10 22 8 22 8 21 7 21 7 11 8 11 8 10 10 10 10 11" />
    <rect x="11" y="5" width="1" height="1" />
    <rect x="12" y="6" width="1" height="1" />
    <polygon points="16 8 17 8 17 10 16 10 16 11 14 11 14 10 13 10 13 8 14 8 14 7 16 7 16 8" />
    <polygon points="16 15 17 15 17 21 16 21 16 22 14 22 14 21 13 21 13 15 14 15 14 14 16 14 16 15" />
    <rect x="17" y="6" width="1" height="1" />
    <rect x="18" y="5" width="1" height="1" />
    <polygon points="23 2 23 4 22 4 22 5 20 5 20 4 19 4 19 2 20 2 20 1 22 1 22 2 23 2" />
    <polygon points="22 11 23 11 23 21 22 21 22 22 20 22 20 21 19 21 19 11 20 11 20 10 22 10 22 11" />
    <rect x="5" y="7" width="1" height="1" />
    <polygon points="4 9 5 9 5 11 4 11 4 12 2 12 2 11 1 11 1 9 2 9 2 8 4 8 4 9" />
    <polygon points="4 16 5 16 5 21 4 21 4 22 2 22 2 21 1 21 1 16 2 16 2 15 4 15 4 16" />
    <rect x="6" y="6" width="1" height="1" />
    <polygon points="8 4 7 4 7 2 8 2 8 1 10 1 10 2 11 2 11 4 10 4 10 5 8 5 8 4" />
  </>,
);

export const PixelReceipt = pixelIcon(
  "PixelReceipt",
  <>
    <rect x="7" y="15" width="10" height="2" />
    <rect x="7" y="11" width="10" height="2" />
    <rect x="7" y="7" width="10" height="2" />
    <path d="m19,1v1h-1v1h-1v-1h-1v-1h-2v1h-1v1h-2v-1h-1v-1h-2v1h-1v1h-1v-1h-1v-1h-1v22h1v-1h1v-1h1v1h1v1h2v-1h1v-1h2v1h1v1h2v-1h1v-1h1v1h1v1h1V1h-1Zm-3,19v1h-2v-1h-1v-1h-2v1h-1v1h-2v-1h-1v-1h-1V5h1v-1h1v-1h2v1h1v1h2v-1h1v-1h2v1h1v1h1v14h-1v1h-1Z" />
  </>,
  <path d="m19,1v1h-1v1h-1v-1h-1v-1h-2v1h-1v1h-2v-1h-1v-1h-2v1h-1v1h-1v-1h-1v-1h-1v22h1v-1h1v-1h1v1h1v1h2v-1h1v-1h2v1h1v1h2v-1h1v-1h1v1h1v1h1V1h-1Zm-1,8H6v-2h12v2Zm0,4H6v-2h12v2Zm0,4H6v-2h12v2Z" />,
);

export const PixelShop = pixelIcon(
  "PixelShop",
  <>
    <polygon points="14 11 14 20 13 20 13 21 4 21 4 20 3 20 3 11 5 11 5 16 12 16 12 11 14 11" />
    <rect x="19" y="11" width="2" height="10" />
    <path d="m22,7v-1h-1v-2h-1v-1H4v1h-1v2h-1v1h-1v2h1v1h20v-1h1v-2h-1Zm-19,1v-1h1v-1h1v-1h14v1h1v1h1v1H3Z" />
  </>,
  <>
    <polygon points="23 7 23 9 22 9 22 10 2 10 2 9 1 9 1 7 2 7 2 6 3 6 3 4 4 4 4 3 20 3 20 4 21 4 21 6 22 6 22 7 23 7" />
    <polygon points="14 11 14 20 13 20 13 21 4 21 4 20 3 20 3 11 5 11 5 16 12 16 12 11 14 11" />
    <rect x="19" y="11" width="2" height="10" />
  </>,
);

export const PixelSeedlings = pixelIcon(
  "PixelSeedlings",
  <>
    <path d="m18,2v1h-2v1h-2v1h-1v1h-1v2h1v2h1v2h2v-1h2v-1h2v-1h1v-1h1v-2h1V2h-5Zm2,4v2h-2v1h-2v1h-1v-2h-1v-2h2v-1h2v-1h3v2h-1Z" />
    <path d="m12,9h-1v-1h-1v-1h-2v-1h-2v-1H1v3h1v2h1v2h1v1h1v1h2v1h4v7h2v-11h-1v-2Zm-7,3v-2h-1v-2h-1v-1h3v1h2v1h2v2h1v2h-4v-1h-2Z" />
  </>,
  <>
    <polygon points="12 11 13 11 13 22 11 22 11 15 7 15 7 14 5 14 5 13 4 13 4 12 3 12 3 10 2 10 2 8 1 8 1 5 6 5 6 6 8 6 8 7 10 7 10 8 11 8 11 9 12 9 12 11" />
    <polygon points="23 2 23 6 22 6 22 8 21 8 21 9 20 9 20 10 18 10 18 11 16 11 16 12 14 12 14 10 13 10 13 8 12 8 12 6 13 6 13 5 14 5 14 4 16 4 16 3 18 3 18 2 23 2" />
  </>,
);

// -- App-wide UI-chrome glyphs --------------------------------------------
// Named to match the boxicons component each replaces (imported with an
// alias at the call site, e.g. `import { PixelPlus as Plus } from
// "@/ui/pixel-icons"`), so swapping a file over is a one-line import change
// -- every existing `<Plus />`/`icon: Move`/etc. reference keeps working
// unchanged. ChevronLeft/ChevronRight use this set's "angle" glyphs (no
// chevron-left/-right exist, only up/down); Move uses "shuffle" (no literal
// move/drag-arrows glyph); MessageCircle uses "message"; ListUl/ListOl use
// "bullet-list"/"numbered-list"; Italic uses "italics"; GitBranch uses
// "branch"; Fullscreen uses "expand". File and Buildings and Code and
// LightBulb reuse PixelClipboard/PixelBank/PixelCode/PixelLightBulb above
// rather than getting their own export.

export const PixelPlus = pixelIcon(
  "PixelPlus",
  <polygon points="23 11 23 13 13 13 13 23 11 23 11 13 1 13 1 11 11 11 11 1 13 1 13 11 23 11" />,
  <polygon points="23 11 23 13 22 13 22 14 14 14 14 22 13 22 13 23 11 23 11 22 10 22 10 14 2 14 2 13 1 13 1 11 2 11 2 10 10 10 10 2 11 2 11 1 13 1 13 2 14 2 14 10 22 10 22 11 23 11" />,
);

export const PixelX = pixelIcon(
  "PixelX",
  <polygon points="14 13 15 13 15 14 16 14 16 15 17 15 17 16 18 16 18 17 19 17 19 18 20 18 20 19 21 19 21 20 22 20 22 21 21 21 21 22 20 22 20 21 19 21 19 20 18 20 18 19 17 19 17 18 16 18 16 17 15 17 15 16 14 16 14 15 13 15 13 14 11 14 11 15 10 15 10 16 9 16 9 17 8 17 8 18 7 18 7 19 6 19 6 20 5 20 5 21 4 21 4 22 3 22 3 21 2 21 2 20 3 20 3 19 4 19 4 18 5 18 5 17 6 17 6 16 7 16 7 15 8 15 8 14 9 14 9 13 10 13 10 11 9 11 9 10 8 10 8 9 7 9 7 8 6 8 6 7 5 7 5 6 4 6 4 5 3 5 3 4 2 4 2 3 3 3 3 2 4 2 4 3 5 3 5 4 6 4 6 5 7 5 7 6 8 6 8 7 9 7 9 8 10 8 10 9 11 9 11 10 13 10 13 9 14 9 14 8 15 8 15 7 16 7 16 6 17 6 17 5 18 5 18 4 19 4 19 3 20 3 20 2 21 2 21 3 22 3 22 4 21 4 21 5 20 5 20 6 19 6 19 7 18 7 18 8 17 8 17 9 16 9 16 10 15 10 15 11 14 11 14 13" />,
  <polygon points="15 13 16 13 16 14 17 14 17 15 18 15 18 16 19 16 19 17 20 17 20 18 21 18 21 19 22 19 22 20 21 20 21 21 20 21 20 22 19 22 19 21 18 21 18 20 17 20 17 19 16 19 16 18 15 18 15 17 14 17 14 16 13 16 13 15 11 15 11 16 10 16 10 17 9 17 9 18 8 18 8 19 7 19 7 20 6 20 6 21 5 21 5 22 4 22 4 21 3 21 3 20 2 20 2 19 3 19 3 18 4 18 4 17 5 17 5 16 6 16 6 15 7 15 7 14 8 14 8 13 9 13 9 11 8 11 8 10 7 10 7 9 6 9 6 8 5 8 5 7 4 7 4 6 3 6 3 5 2 5 2 4 3 4 3 3 4 3 4 2 5 2 5 3 6 3 6 4 7 4 7 5 8 5 8 6 9 6 9 7 10 7 10 8 11 8 11 9 13 9 13 8 14 8 14 7 15 7 15 6 16 6 16 5 17 5 17 4 18 4 18 3 19 3 19 2 20 2 20 3 21 3 21 4 22 4 22 5 21 5 21 6 20 6 20 7 19 7 19 8 18 8 18 9 17 9 17 10 16 10 16 11 15 11 15 13" />,
);

export const PixelTrash = pixelIcon(
  "PixelTrash",
  <>
    <path d="m4,6v8h1v8h1v1h12v-1h1v-8h1V6H4Zm14,7h-1v8H7v-8h-1v-5h12v5Z" />
    <polygon points="21 3 21 5 3 5 3 3 4 3 4 2 9 2 9 1 15 1 15 2 20 2 20 3 21 3" />
  </>,
  <>
    <polygon points="20 6 20 14 19 14 19 22 18 22 18 23 6 23 6 22 5 22 5 14 4 14 4 6 20 6" />
    <polygon points="21 3 21 5 3 5 3 3 4 3 4 2 9 2 9 1 15 1 15 2 20 2 20 3 21 3" />
  </>,
);

export const PixelChevronDown = pixelIcon(
  "PixelChevronDown",
  <polygon points="22 6 22 8 21 8 21 9 20 9 20 10 19 10 19 11 18 11 18 12 17 12 17 13 16 13 16 14 15 14 15 15 14 15 14 16 13 16 13 17 11 17 11 16 10 16 10 15 9 15 9 14 8 14 8 13 7 13 7 12 6 12 6 11 5 11 5 10 4 10 4 9 3 9 3 8 2 8 2 6 4 6 4 7 5 7 5 8 6 8 6 9 7 9 7 10 8 10 8 11 9 11 9 12 10 12 10 13 11 13 11 14 13 14 13 13 14 13 14 12 15 12 15 11 16 11 16 10 17 10 17 9 18 9 18 8 19 8 19 7 20 7 20 6 22 6" />,
  <polygon points="23 8 23 9 22 9 22 10 21 10 21 11 20 11 20 12 19 12 19 13 18 13 18 14 17 14 17 15 16 15 16 16 15 16 15 17 14 17 14 18 13 18 13 19 11 19 11 18 10 18 10 17 9 17 9 16 8 16 8 15 7 15 7 14 6 14 6 13 5 13 5 12 4 12 4 11 3 11 3 10 2 10 2 9 1 9 1 8 2 8 2 7 3 7 3 6 4 6 4 7 5 7 5 8 6 8 6 9 7 9 7 10 8 10 8 11 9 11 9 12 10 12 10 13 11 13 11 14 13 14 13 13 14 13 14 12 15 12 15 11 16 11 16 10 17 10 17 9 18 9 18 8 19 8 19 7 20 7 20 6 21 6 21 7 22 7 22 8 23 8" />,
);

export const PixelChevronUp = pixelIcon(
  "PixelChevronUp",
  <polygon points="22 16 22 18 20 18 20 17 19 17 19 16 18 16 18 15 17 15 17 14 16 14 16 13 15 13 15 12 14 12 14 11 13 11 13 10 11 10 11 11 10 11 10 12 9 12 9 13 8 13 8 14 7 14 7 15 6 15 6 16 5 16 5 17 4 17 4 18 2 18 2 16 3 16 3 15 4 15 4 14 5 14 5 13 6 13 6 12 7 12 7 11 8 11 8 10 9 10 9 9 10 9 10 8 11 8 11 7 13 7 13 8 14 8 14 9 15 9 15 10 16 10 16 11 17 11 17 12 18 12 18 13 19 13 19 14 20 14 20 15 21 15 21 16 22 16" />,
  <polygon points="23 16 23 17 22 17 22 18 21 18 21 19 20 19 20 18 19 18 19 17 18 17 18 16 17 16 17 15 16 15 16 14 15 14 15 13 14 13 14 12 13 12 13 11 11 11 11 12 10 12 10 13 9 13 9 14 8 14 8 15 7 15 7 16 6 16 6 17 5 17 5 18 4 18 4 19 3 19 3 18 2 18 2 17 1 17 1 16 2 16 2 15 3 15 3 14 4 14 4 13 5 13 5 12 6 12 6 11 7 11 7 10 8 10 8 9 9 9 9 8 10 8 10 7 11 7 11 6 13 6 13 7 14 7 14 8 15 8 15 9 16 9 16 10 17 10 17 11 18 11 18 12 19 12 19 13 20 13 20 14 21 14 21 15 22 15 22 16 23 16" />,
);

export const PixelChevronRight = pixelIcon(
  "PixelChevronRight",
  <polygon points="16 11 16 13 15 13 15 14 14 14 14 15 13 15 13 16 12 16 12 17 11 17 11 18 10 18 10 19 9 19 9 20 8 20 8 19 7 19 7 18 8 18 8 17 9 17 9 16 10 16 10 15 11 15 11 14 12 14 12 13 13 13 13 11 12 11 12 10 11 10 11 9 10 9 10 8 9 8 9 7 8 7 8 6 7 6 7 5 8 5 8 4 9 4 9 5 10 5 10 6 11 6 11 7 12 7 12 8 13 8 13 9 14 9 14 10 15 10 15 11 16 11" />,
  <polygon points="7 19 7 17 8 17 8 16 9 16 9 15 10 15 10 14 11 14 11 13 12 13 12 11 11 11 11 10 10 10 10 9 9 9 9 8 8 8 8 7 7 7 7 5 8 5 8 4 10 4 10 5 11 5 11 6 12 6 12 7 13 7 13 8 14 8 14 9 15 9 15 10 16 10 16 11 17 11 17 13 16 13 16 14 15 14 15 15 14 15 14 16 13 16 13 17 12 17 12 18 11 18 11 19 10 19 10 20 8 20 8 19 7 19" />,
);

export const PixelChevronLeft = pixelIcon(
  "PixelChevronLeft",
  <polygon points="11 13 12 13 12 14 13 14 13 15 14 15 14 16 15 16 15 17 16 17 16 18 17 18 17 19 16 19 16 20 15 20 15 19 14 19 14 18 13 18 13 17 12 17 12 16 11 16 11 15 10 15 10 14 9 14 9 13 8 13 8 11 9 11 9 10 10 10 10 9 11 9 11 8 12 8 12 7 13 7 13 6 14 6 14 5 15 5 15 4 16 4 16 5 17 5 17 6 16 6 16 7 15 7 15 8 14 8 14 9 13 9 13 10 12 10 12 11 11 11 11 13" />,
  <polygon points="17 5 17 7 16 7 16 8 15 8 15 9 14 9 14 10 13 10 13 11 12 11 12 13 13 13 13 14 14 14 14 15 15 15 15 16 16 16 16 17 17 17 17 19 16 19 16 20 14 20 14 19 13 19 13 18 12 18 12 17 11 17 11 16 10 16 10 15 9 15 9 14 8 14 8 13 7 13 7 11 8 11 8 10 9 10 9 9 10 9 10 8 11 8 11 7 12 7 12 6 13 6 13 5 14 5 14 4 16 4 16 5 17 5" />,
);

export const PixelSearch = pixelIcon(
  "PixelSearch",
  <path d="m22,20v-1h-1v-1h-1v-1h-1v-1h-2v-1h1v-2h1v-6h-1v-2h-1v-1h-1v-1h-1v-1h-2v-1h-6v1h-2v1h-1v1h-1v1h-1v2h-1v6h1v2h1v1h1v1h1v1h2v1h6v-1h2v-1h1v2h1v1h1v1h1v1h1v1h2v-1h1v-2h-1Zm-10-5v1h-4v-1h-2v-1h-1v-2h-1v-4h1v-2h1v-1h2v-1h4v1h2v1h1v2h1v4h-1v2h-1v1h-2Z" />,
  <>
    <polygon points="16 17 15 17 15 18 13 18 13 19 7 19 7 18 5 18 5 17 4 17 4 16 3 16 3 15 2 15 2 13 1 13 1 7 2 7 2 5 3 5 3 4 4 4 4 3 5 3 5 2 7 2 7 1 13 1 13 2 15 2 15 3 16 3 16 4 17 4 17 5 18 5 18 7 19 7 19 13 18 13 18 15 17 15 17 16 16 16 16 17" />
    <polygon points="23 20 23 22 22 22 22 23 20 23 20 22 19 22 19 21 18 21 18 20 17 20 17 19 16 19 16 18 17 18 17 17 18 17 18 16 19 16 19 17 20 17 20 18 21 18 21 19 22 19 22 20 23 20" />
  </>,
);

export const PixelLink = pixelIcon(
  "PixelLink",
  <>
    <polygon points="16 10 17 10 17 17 16 17 16 18 15 18 15 19 14 19 14 20 13 20 13 21 12 21 12 22 11 22 11 23 5 23 5 22 4 22 4 21 3 21 3 20 2 20 2 19 1 19 1 14 2 14 2 13 3 13 3 12 4 12 4 11 5 11 5 14 4 14 4 15 3 15 3 18 4 18 4 19 5 19 5 20 6 20 6 21 10 21 10 20 11 20 11 19 12 19 12 18 13 18 13 17 14 17 14 16 15 16 15 11 14 11 14 10 13 10 13 9 14 9 14 8 15 8 15 9 16 9 16 10" />
    <polygon points="23 5 23 10 22 10 22 11 21 11 21 12 20 12 20 13 19 13 19 10 20 10 20 9 21 9 21 6 20 6 20 5 19 5 19 4 18 4 18 3 14 3 14 4 13 4 13 5 12 5 12 6 11 6 11 7 10 7 10 8 9 8 9 13 10 13 10 14 11 14 11 15 10 15 10 16 9 16 9 15 8 15 8 14 7 14 7 7 8 7 8 6 9 6 9 5 10 5 10 4 11 4 11 3 12 3 12 2 13 2 13 1 19 1 19 2 20 2 20 3 21 3 21 4 22 4 22 5 23 5" />
  </>,
  <>
    <polygon points="16 10 17 10 17 17 16 17 16 18 15 18 15 19 14 19 14 20 13 20 13 21 12 21 12 22 11 22 11 23 5 23 5 22 4 22 4 21 3 21 3 20 2 20 2 19 1 19 1 14 2 14 2 13 3 13 3 12 4 12 4 11 5 11 5 15 4 15 4 18 5 18 5 19 6 19 6 20 9 20 9 19 10 19 10 18 11 18 11 17 12 17 12 16 13 16 13 15 14 15 14 12 13 12 13 11 12 11 12 10 13 10 13 9 14 9 14 8 15 8 15 9 16 9 16 10" />
    <polygon points="23 5 23 10 22 10 22 11 21 11 21 12 20 12 20 13 19 13 19 9 20 9 20 6 19 6 19 5 18 5 18 4 15 4 15 5 14 5 14 6 13 6 13 7 12 7 12 8 11 8 11 9 10 9 10 12 11 12 11 13 12 13 12 14 11 14 11 15 10 15 10 16 9 16 9 15 8 15 8 14 7 14 7 7 8 7 8 6 9 6 9 5 10 5 10 4 11 4 11 3 12 3 12 2 13 2 13 1 19 1 19 2 20 2 20 3 21 3 21 4 22 4 22 5 23 5" />
  </>,
);

export const PixelEdit = pixelIcon(
  "PixelEdit",
  <>
    <polygon points="22 4 22 7 21 7 21 8 20 8 20 7 19 7 19 6 21 6 21 5 20 5 20 4 19 4 19 6 18 6 18 5 17 5 17 4 18 4 18 3 21 3 21 4 22 4" />
    <polygon points="18 14 18 21 17 21 17 22 2 22 2 21 1 21 1 6 2 6 2 5 14 5 14 6 13 6 13 7 3 7 3 20 16 20 16 15 17 15 17 14 18 14" />
    <path d="m18,8v-1h-1v-1h-2v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v4h4v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-2h-1Zm-1,2h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-2v-2h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h2v2Z" />
  </>,
  <>
    <polygon points="22 4 22 7 21 7 21 8 20 8 20 7 19 7 19 6 18 6 18 5 17 5 17 4 18 4 18 3 21 3 21 4 22 4" />
    <polygon points="17 14 18 14 18 21 17 21 17 22 2 22 2 21 1 21 1 6 2 6 2 5 14 5 14 6 13 6 13 7 3 7 3 20 16 20 16 15 17 15 17 14" />
    <polygon points="18 8 19 8 19 10 18 10 18 11 17 11 17 12 16 12 16 13 15 13 15 14 14 14 14 15 13 15 13 16 12 16 12 17 11 17 11 18 7 18 7 14 8 14 8 13 9 13 9 12 10 12 10 11 11 11 11 10 12 10 12 9 13 9 13 8 14 8 14 7 15 7 15 6 17 6 17 7 18 7 18 8" />
  </>,
);

export const PixelAt = pixelIcon(
  "PixelAt",
  <path d="m22,10v-2h-1v-2h-1v-2h-1v-1h-2v-1h-3v-1h-4v1h-3v1h-2v1h-1v1h-1v2h-1v2h-1v6h1v2h1v2h1v1h1v1h2v1h3v1h4v-1h3v-2h-3v1h-4v-1h-3v-1h-1v-1h-1v-2h-1v-2h-1v-4h1v-2h1v-2h1v-1h1v-1h3v-1h4v1h3v1h1v1h1v2h1v2h1v4h-1v1h-2v-5h-1v-2h-1v-1h-2v-1h-4v1h-2v1h-1v2h-1v4h1v2h1v1h2v1h4v-1h2v-1h1v1h4v-1h1v-2h1v-4h-1Zm-6,4h-1v1h-1v1h-4v-1h-1v-1h-1v-4h1v-1h1v-1h4v1h1v1h1v4Z" />,
  <path d="m22,10v-2h-1v-2h-1v-2h-1v-1h-2v-1h-3v-1h-4v1h-3v1h-2v1h-1v1h-1v2h-1v2h-1v6h1v2h1v2h1v1h1v1h2v1h3v1h4v-1h3v-3h-3v1h-4v-1h-3v-1h-1v-2h-1v-2h-1v-4h1v-2h1v-2h1v-1h3v-1h4v1h3v1h1v2h1v2h1v4h-2v-4h-1v-2h-1v-1h-2v-1h-4v1h-2v1h-1v2h-1v4h1v2h1v1h2v1h4v-1h2v-1h1v1h4v-1h1v-2h1v-4h-1Zm-7,4h-1v1h-4v-1h-1v-4h1v-1h4v1h1v4Z" />,
);

export const PixelArrowUp = pixelIcon(
  "PixelArrowUp",
  <polygon points="23 11 23 12 22 12 22 13 21 13 21 12 20 12 20 11 19 11 19 10 18 10 18 9 17 9 17 8 16 8 16 7 15 7 15 6 14 6 14 5 13 5 13 23 11 23 11 5 10 5 10 6 9 6 9 7 8 7 8 8 7 8 7 9 6 9 6 10 5 10 5 11 4 11 4 12 3 12 3 13 2 13 2 12 1 12 1 11 2 11 2 10 3 10 3 9 4 9 4 8 5 8 5 7 6 7 6 6 7 6 7 5 8 5 8 4 9 4 9 3 10 3 10 2 11 2 11 1 13 1 13 2 14 2 14 3 15 3 15 4 16 4 16 5 17 5 17 6 18 6 18 7 19 7 19 8 20 8 20 9 21 9 21 10 22 10 22 11 23 11" />,
  <polygon points="11 1 13 1 13 2 14 2 14 3 15 3 15 4 16 4 16 5 17 5 17 6 18 6 18 7 19 7 19 8 20 8 20 9 21 9 21 10 22 10 22 11 23 11 23 12 22 12 22 13 21 13 21 14 20 14 20 13 19 13 19 12 18 12 18 11 17 11 17 10 16 10 16 9 15 9 15 8 14 8 14 23 10 23 10 8 9 8 9 9 8 9 8 10 7 10 7 11 6 11 6 12 5 12 5 13 4 13 4 14 3 14 3 13 2 13 2 12 1 12 1 11 2 11 2 10 3 10 3 9 4 9 4 8 5 8 5 7 6 7 6 6 7 6 7 5 8 5 8 4 9 4 9 3 10 3 10 2 11 2 11 1" />,
);

export const PixelUserPlus = pixelIcon(
  "PixelUserPlus",
  <>
    <polygon points="11 20 12 20 12 21 2 21 2 20 1 20 1 17 2 17 2 16 3 16 3 15 4 15 4 14 11 14 11 15 10 15 10 16 4 16 4 17 3 17 3 19 11 19 11 20" />
    <path d="M22,15V13H21V12H19V11H16v1H14v1H13v2H12v3h1v2h1v1h2v1h3V21h2V20h1V18h1V15Zm-4,2v2H17V17H15V16h2V14h1v2h2v1Z" />
    <path d="M12,5V4H11V3H6V4H5V5H4v5H5v1H6v1h5V11h1V10h1V5ZM10,9v1H7V9H6V6H7V5h3V6h1V9Z" />
  </>,
  <>
    <polygon points="11 20 12 20 12 21 2 21 2 20 1 20 1 17 2 17 2 16 3 16 3 15 4 15 4 14 11 14 11 15 10 15 10 18 11 18 11 20" />
    <polygon points="13 5 13 10 12 10 12 11 11 11 11 12 6 12 6 11 5 11 5 10 4 10 4 5 5 5 5 4 6 4 6 3 11 3 11 4 12 4 12 5 13 5" />
    <path d="M22,15V13H21V12H19V11H16v1H14v1H13v2H12v3h1v2h1v1h2v1h3V21h2V20h1V18h1V15Zm-4,4H17V17H15V16h2V14h1v2h2v1H18Z" />
  </>,
);

export const PixelStrikethrough = pixelIcon(
  "PixelStrikethrough",
  <>
    <rect x="2" y="11" width="20" height="2" />
    <polygon points="19 2 19 3 9 3 9 4 8 4 8 9 6 9 6 3 7 3 7 2 8 2 8 1 18 1 18 2 19 2" />
    <polygon points="18 15 18 21 17 21 17 22 16 22 16 23 6 23 6 22 5 22 5 21 15 21 15 20 16 20 16 15 18 15" />
  </>,
  <>
    <polygon points="18 16 18 21 17 21 17 22 16 22 16 23 6 23 6 22 5 22 5 20 14 20 14 19 15 19 15 16 18 16" />
    <polygon points="22 11 22 13 21 13 21 14 3 14 3 13 2 13 2 11 3 11 3 10 21 10 21 11 22 11" />
    <polygon points="6 8 6 3 7 3 7 2 8 2 8 1 18 1 18 2 19 2 19 4 10 4 10 5 9 5 9 8 6 8" />
  </>,
);

export const PixelRobot = pixelIcon(
  "PixelRobot",
  <>
    <rect x="14" y="15" width="3" height="1" />
    <rect x="11" y="15" width="2" height="1" />
    <rect x="7" y="15" width="3" height="1" />
    <path d="m19,7h-1v-1h-5v-3h-2v3h-5v1h-1v1h-1v10h1v1h1v1h12v-1h1v-1h1v-10h-1v-1Zm-2,10v1H7v-1h-1v-8h1v-1h10v1h1v8h-1Z" />
    <polygon points="23 11 23 16 22 16 22 17 21 17 21 10 22 10 22 11 23 11" />
    <polygon points="2 10 3 10 3 17 2 17 2 16 1 16 1 11 2 11 2 10" />
    <rect x="14" y="10" width="3" height="3" />
    <rect x="7" y="10" width="3" height="3" />
  </>,
  <>
    <polygon points="2 10 3 10 3 17 2 17 2 16 1 16 1 11 2 11 2 10" />
    <path d="m19,7h-1v-1h-5v-3h-2v3h-5v1h-1v1h-1v10h1v1h1v1h12v-1h1v-1h1v-10h-1v-1Zm-2,6h-3v-3h3v3Zm-4,4h-2v-1h2v1Zm-6-1h3v1h-3v-1Zm0-6h3v3h-3v-3Zm7,7v-1h3v1h-3Z" />
    <polygon points="23 11 23 16 22 16 22 17 21 17 21 10 22 10 22 11 23 11" />
  </>,
);

export const PixelQuoteLeft = pixelIcon(
  "PixelQuoteLeft",
  <>
    <path d="m22,13v-1h-5v-4h1v-1h2v-1h1v-3h-1v-1h-2v1h-2v1h-1v1h-1v2h-1v14h1v1h8v-1h1v-8h-1Zm-7,0h1v1h5v6h-6v-7Z" />
    <path d="m10,13v-1h-5v-4h1v-1h2v-1h1v-3h-1v-1h-2v1h-2v1h-1v1h-1v2h-1v14h1v1h8v-1h1v-8h-1Zm-7,0h1v1h5v6H3v-7Z" />
  </>,
  <>
    <polygon points="10 13 11 13 11 21 10 21 10 22 2 22 2 21 1 21 1 7 2 7 2 5 3 5 3 4 4 4 4 3 6 3 6 2 8 2 8 3 9 3 9 6 8 6 8 7 6 7 6 8 5 8 5 12 10 12 10 13" />
    <polygon points="23 13 23 21 22 21 22 22 14 22 14 21 13 21 13 7 14 7 14 5 15 5 15 4 16 4 16 3 18 3 18 2 20 2 20 3 21 3 21 6 20 6 20 7 18 7 18 8 17 8 17 12 22 12 22 13 23 13" />
  </>,
);

export const PixelMove = pixelIcon(
  "PixelMove",
  <>
    <polygon points="8 15 9 15 9 17 8 17 8 18 7 18 7 19 1 19 1 17 7 17 7 16 8 16 8 15" />
    <polygon points="21 16 22 16 22 18 21 18 21 19 20 19 20 20 19 20 19 21 18 21 18 18 14 18 14 17 13 17 13 16 12 16 12 14 11 14 11 13 10 13 10 11 9 11 9 10 8 10 8 8 7 8 7 7 1 7 1 5 8 5 8 6 9 6 9 8 10 8 10 10 11 10 11 11 12 11 12 13 13 13 13 14 14 14 14 16 18 16 18 13 19 13 19 14 20 14 20 15 21 15 21 16" />
    <polygon points="22 5 22 7 21 7 21 8 20 8 20 9 19 9 19 10 18 10 18 7 14 7 14 8 13 8 13 9 12 9 12 7 13 7 13 6 14 6 14 5 18 5 18 2 19 2 19 3 20 3 20 4 21 4 21 5 22 5" />
  </>,
  <>
    <polygon points="8 14 9 14 9 17 8 17 8 18 7 18 7 19 1 19 1 16 7 16 7 15 8 15 8 14" />
    <polygon points="22 17 23 17 23 18 22 18 22 19 21 19 21 20 20 20 20 21 19 21 19 22 18 22 18 19 14 19 14 18 13 18 13 17 12 17 12 15 11 15 11 14 10 14 10 12 9 12 9 11 8 11 8 9 7 9 7 8 1 8 1 5 8 5 8 6 9 6 9 8 10 8 10 10 11 10 11 11 12 11 12 13 13 13 13 14 14 14 14 16 18 16 18 13 19 13 19 14 20 14 20 15 21 15 21 16 22 16 22 17" />
    <polygon points="23 6 23 7 22 7 22 8 21 8 21 9 20 9 20 10 19 10 19 11 18 11 18 8 14 8 14 9 13 9 13 10 12 10 12 7 13 7 13 6 14 6 14 5 18 5 18 2 19 2 19 3 20 3 20 4 21 4 21 5 22 5 22 6 23 6" />
  </>,
);

export const PixelMessageCircle = pixelIcon(
  "PixelMessageCircle",
  <path d="m22,2v-1H2v1h-1v16h1v1h6v4h1v-1h1v-1h1v-1h2v-1h9v-1h1V2h-1Zm-1,15H3V3h18v14Z" />,
  <polygon points="23 2 23 18 22 18 22 19 13 19 13 20 11 20 11 21 10 21 10 22 9 22 9 23 8 23 8 19 2 19 2 18 1 18 1 2 2 2 2 1 22 1 22 2 23 2" />,
);

export const PixelListUl = pixelIcon(
  "PixelListUl",
  <>
    <rect x="2" y="5" width="3" height="3" />
    <rect x="2" y="11" width="3" height="3" />
    <rect x="2" y="17" width="3" height="3" />
    <rect x="8" y="18" width="14" height="1" />
    <rect x="8" y="6" width="14" height="1" />
    <rect x="8" y="12" width="14" height="1" />
  </>,
  <>
    <rect x="2" y="5" width="3" height="3" />
    <rect x="2" y="17" width="3" height="3" />
    <rect x="2" y="11" width="3" height="3" />
    <polygon points="23 6 23 7 22 7 22 8 10 8 10 7 9 7 9 6 10 6 10 5 22 5 22 6 23 6" />
    <polygon points="22 12 23 12 23 13 22 13 22 14 10 14 10 13 9 13 9 12 10 12 10 11 22 11 22 12" />
    <polygon points="22 18 23 18 23 19 22 19 22 20 10 20 10 19 9 19 9 18 10 18 10 17 22 17 22 18" />
  </>,
);

export const PixelListOl = pixelIcon(
  "PixelListOl",
  <>
    <rect x="4" y="11" width="1" height="2" />
    <polygon points="4 8 5 8 5 9 2 9 2 8 3 8 3 6 2 6 2 5 3 5 3 4 4 4 4 8" />
    <polygon points="4 10 4 11 3 11 3 12 2 12 2 10 4 10" />
    <polygon points="5 16 5 21 2 21 2 20 4 20 4 19 3 19 3 18 4 18 4 17 2 17 2 16 5 16" />
    <polygon points="3 13 4 13 4 14 5 14 5 15 2 15 2 14 3 14 3 13" />
    <rect x="9" y="6" width="14" height="1" />
    <rect x="9" y="12" width="14" height="1" />
    <rect x="9" y="18" width="14" height="1" />
  </>,
  <>
    <polygon points="5 8 5 9 2 9 2 8 3 8 3 6 2 6 2 5 3 5 3 4 4 4 4 8 5 8" />
    <polygon points="5 16 5 21 2 21 2 20 4 20 4 19 3 19 3 18 4 18 4 17 2 17 2 16 5 16" />
    <polygon points="3 13 4 13 4 14 5 14 5 15 2 15 2 14 3 14 3 13" />
    <rect x="4" y="11" width="1" height="2" />
    <polygon points="4 10 4 11 3 11 3 12 2 12 2 10 4 10" />
    <polygon points="22 12 23 12 23 13 22 13 22 14 10 14 10 13 9 13 9 12 10 12 10 11 22 11 22 12" />
    <polygon points="22 18 23 18 23 19 22 19 22 20 10 20 10 19 9 19 9 18 10 18 10 17 22 17 22 18" />
    <polygon points="23 6 23 7 22 7 22 8 10 8 10 7 9 7 9 6 10 6 10 5 22 5 22 6 23 6" />
  </>,
);

export const PixelItalic = pixelIcon(
  "PixelItalic",
  <polygon points="22 1 22 3 17 3 17 4 16 4 16 6 15 6 15 8 14 8 14 11 13 11 13 13 12 13 12 16 11 16 11 18 10 18 10 20 9 20 9 21 16 21 16 23 2 23 2 21 7 21 7 20 8 20 8 18 9 18 9 16 10 16 10 13 11 13 11 11 12 11 12 8 13 8 13 6 14 6 14 4 15 4 15 3 8 3 8 1 22 1" />,
  <polygon points="22 1 22 4 17 4 17 6 16 6 16 8 15 8 15 11 14 11 14 13 13 13 13 16 12 16 12 18 11 18 11 20 16 20 16 23 2 23 2 20 7 20 7 18 8 18 8 16 9 16 9 13 10 13 10 11 11 11 11 8 12 8 12 6 13 6 13 4 8 4 8 1 22 1" />,
);

export const PixelHome = pixelIcon(
  "PixelHome",
  <path d="m22,11v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-2v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h3v10h1v1h4v-7h6v7h4v-1h1v-10h3v-1h-1Zm-3,0h-1v10h-1v-6h-1v-1h-8v1h-1v6h-1v-10h-1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h1v-1h2v1h1v1h1v1h1v1h1v1h1v1h1v1Z" />,
  <polygon points="23 11 23 12 20 12 20 22 19 22 19 23 15 23 15 16 9 16 9 23 5 23 5 22 4 22 4 12 1 12 1 11 2 11 2 10 3 10 3 9 4 9 4 8 5 8 5 7 6 7 6 6 7 6 7 5 8 5 8 4 9 4 9 3 10 3 10 2 11 2 11 1 13 1 13 2 14 2 14 3 15 3 15 4 16 4 16 5 17 5 17 6 18 6 18 7 19 7 19 8 20 8 20 9 21 9 21 10 22 10 22 11 23 11" />,
);

export const PixelGitBranch = pixelIcon(
  "PixelGitBranch",
  <path d="M20,2V1H16V2H15V6h1V7h1v4H7V7H8V6H9V2H8V1H4V2H3V6H4V7H5V17H4v1H3v4H4v1H8V22H9V18H8V17H7V13H19V7h1V6h1V2ZM5,3H7V5H5ZM7,21H5V19H7ZM19,5H17V3h2Z" />,
  <path d="M21,3V2H20V1H17V2H16V3H15V6h1V7h1v3H7V7H8V6H9V3H8V2H7V1H4V2H3V3H2V6H3V7H4V17H3v1H2v3H3v1H4v1H7V22H8V21H9V18H8V17H7V13H19V12h1V7h1V6h1V3ZM20,5H19V6H18V5H17V4h1V3h1V4h1ZM4,5V4H5V3H6V4H7V5H6V6H5V5ZM7,19v1H6v1H5V20H4V19H5V18H6v1Z" />,
);

export const PixelFullscreen = pixelIcon(
  "PixelFullscreen",
  <>
    <polygon points="9 1 9 3 3 3 3 9 1 9 1 2 2 2 2 1 9 1" />
    <polygon points="9 21 9 23 2 23 2 22 1 22 1 15 3 15 3 21 9 21" />
    <polygon points="23 15 23 22 22 22 22 23 15 23 15 21 21 21 21 15 23 15" />
    <polygon points="23 2 23 9 21 9 21 3 15 3 15 1 22 1 22 2 23 2" />
  </>,
  <>
    <polygon points="9 20 9 23 2 23 2 22 1 22 1 15 4 15 4 20 9 20" />
    <polygon points="9 1 9 4 4 4 4 9 1 9 1 2 2 2 2 1 9 1" />
    <polygon points="23 15 23 22 22 22 22 23 15 23 15 20 20 20 20 15 23 15" />
    <polygon points="23 2 23 9 20 9 20 4 15 4 15 1 22 1 22 2 23 2" />
  </>,
);

export const PixelFolderOpen = pixelIcon(
  "PixelFolderOpen",
  <>
    <path d="m6,10v2h-1v2h-1v2h-1v2h-1v3h1v1h15v-1h1v-3h1v-2h1v-2h1v-2h1v-2H6Zm14,4h-1v2h-1v2h-1v2H4v-2h1v-2h1v-2h1v-2h13v2Z" />
    <polygon points="20 5 20 9 18 9 18 6 9 6 9 5 8 5 8 4 3 4 3 14 2 14 2 16 1 16 1 3 2 3 2 2 9 2 9 3 10 3 10 4 19 4 19 5 20 5" />
  </>,
  <>
    <polygon points="2 16 1 16 1 3 2 3 2 2 9 2 9 3 10 3 10 4 19 4 19 5 20 5 20 9 5 9 5 10 4 10 4 12 3 12 3 14 2 14 2 16" />
    <polygon points="23 10 23 12 22 12 22 14 21 14 21 16 20 16 20 18 19 18 19 21 18 21 18 22 3 22 3 21 2 21 2 18 3 18 3 16 4 16 4 14 5 14 5 12 6 12 6 10 23 10" />
  </>,
);

export const PixelDotsHorizontalRounded = pixelIcon(
  "PixelDotsHorizontalRounded",
  <>
    <polygon points="14 11 14 13 13 13 13 14 11 14 11 13 10 13 10 11 11 11 11 10 13 10 13 11 14 11" />
    <polygon points="19 11 19 13 18 13 18 14 16 14 16 13 15 13 15 11 16 11 16 10 18 10 18 11 19 11" />
    <polygon points="9 11 9 13 8 13 8 14 6 14 6 13 5 13 5 11 6 11 6 10 8 10 8 11 9 11" />
    <path d="m22,9v-2h-1v-2h-1v-1h-1v-1h-2v-1h-2v-1h-6v1h-2v1h-2v1h-1v1h-1v2h-1v2h-1v6h1v2h1v2h1v1h1v1h2v1h2v1h6v-1h2v-1h2v-1h1v-1h1v-2h1v-2h1v-6h-1Zm-2,6v2h-1v2h-2v1h-2v1h-6v-1h-2v-1h-2v-2h-1v-2h-1v-6h1v-2h1v-2h2v-1h2v-1h6v1h2v1h2v2h1v2h1v6h-1Z" />
  </>,
  <path d="m22,9v-2h-1v-2h-1v-1h-1v-1h-2v-1h-2v-1h-6v1h-2v1h-2v1h-1v1h-1v2h-1v2h-1v6h1v2h1v2h1v1h1v1h2v1h2v1h6v-1h2v-1h2v-1h1v-1h1v-2h1v-2h1v-6h-1Zm-9,1v1h1v2h-1v1h-2v-1h-1v-2h1v-1h2Zm-8,1h1v-1h2v1h1v2h-1v1h-2v-1h-1v-2Zm14,2h-1v1h-2v-1h-1v-2h1v-1h2v1h1v2Z" />,
);

export const PixelDotsHorizontal = pixelIcon(
  "PixelDotsHorizontal",
  <>
    <path d="m6,10h-1v-1h-2v1h-1v1h-1v2h1v1h1v1h2v-1h1v-1h1v-2h-1v-1Zm-1,3h-2v-2h2v2Z" />
    <path d="m14,10h-1v-1h-2v1h-1v1h-1v2h1v1h1v1h2v-1h1v-1h1v-2h-1v-1Zm-1,3h-2v-2h2v2Z" />
    <path d="m22,11v-1h-1v-1h-2v1h-1v1h-1v2h1v1h1v1h2v-1h1v-1h1v-2h-1Zm-3,2v-2h2v2h-2Z" />
  </>,
  <>
    <polygon points="14 11 15 11 15 13 14 13 14 14 13 14 13 15 11 15 11 14 10 14 10 13 9 13 9 11 10 11 10 10 11 10 11 9 13 9 13 10 14 10 14 11" />
    <polygon points="6 11 7 11 7 13 6 13 6 14 5 14 5 15 3 15 3 14 2 14 2 13 1 13 1 11 2 11 2 10 3 10 3 9 5 9 5 10 6 10 6 11" />
    <polygon points="23 11 23 13 22 13 22 14 21 14 21 15 19 15 19 14 18 14 18 13 17 13 17 11 18 11 18 10 19 10 19 9 21 9 21 10 22 10 22 11 23 11" />
  </>,
);

export const PixelDashboard = pixelIcon(
  "PixelDashboard",
  <>
    <path d="m10,13H2v1h-1v8h1v1h8v-1h1v-8h-1v-1Zm-1,8H3v-6h6v6Z" />
    <path d="m10,2v-1H2v1h-1v8h1v1h8v-1h1V2h-1Zm-7,7V3h6v6H3Z" />
    <path d="m22,13h-8v1h-1v8h1v1h8v-1h1v-8h-1v-1Zm-1,8h-6v-6h6v6Z" />
    <path d="m22,2v-1h-8v1h-1v8h1v1h8v-1h1V2h-1Zm-1,7h-6V3h6v6Z" />
  </>,
  <>
    <polygon points="10 14 11 14 11 22 10 22 10 23 2 23 2 22 1 22 1 14 2 14 2 13 10 13 10 14" />
    <polygon points="10 2 11 2 11 10 10 10 10 11 2 11 2 10 1 10 1 2 2 2 2 1 10 1 10 2" />
    <polygon points="22 14 23 14 23 22 22 22 22 23 14 23 14 22 13 22 13 14 14 14 14 13 22 13 22 14" />
    <polygon points="23 2 23 10 22 10 22 11 14 11 14 10 13 10 13 2 14 2 14 1 22 1 22 2 23 2" />
  </>,
);

export const PixelCog = pixelIcon(
  "PixelCog",
  <>
    <path d="m21,10v-1h-1v-2h1v-2h-1v-1h-1v-1h-2v1h-2v-1h-1V1h-4v2h-1v1h-2v-1h-2v1h-1v1h-1v2h1v2h-1v1H1v4h2v1h1v2h-1v2h1v1h1v1h2v-1h2v1h1v2h4v-2h1v-1h2v1h2v-1h1v-1h1v-2h-1v-2h1v-1h2v-4h-2Zm0,3h-1v1h-1v1h-1v2h1v2h-2v-1h-2v1h-1v1h-1v1h-2v-1h-1v-1h-1v-1h-2v1h-2v-2h1v-2h-1v-1h-1v-1h-1v-2h1v-1h1v-1h1v-2h-1v-2h2v1h2v-1h1v-1h1v-1h2v1h1v1h1v1h2v-1h2v2h-1v2h1v1h1v1h1v2Z" />
    <path d="m16,10v-1h-1v-1h-1v-1h-4v1h-1v1h-1v1h-1v4h1v1h1v1h1v1h4v-1h1v-1h1v-1h1v-4h-1Zm-1,4h-1v1h-4v-1h-1v-4h1v-1h4v1h1v4Z" />
  </>,
  <path d="m21,10v-1h-1v-2h1v-2h-1v-1h-1v-1h-2v1h-2v-1h-1V1h-4v2h-1v1h-2v-1h-2v1h-1v1h-1v2h1v2h-1v1H1v4h2v1h1v2h-1v2h1v1h1v1h2v-1h2v1h1v2h4v-2h1v-1h2v1h2v-1h1v-1h1v-2h-1v-2h1v-1h2v-4h-2Zm-11,0v-1h4v1h1v4h-1v1h-4v-1h-1v-4h1Z" />,
);

export const PixelCheckSquare = pixelIcon(
  "PixelCheckSquare",
  <>
    <polygon points="19 9 19 10 18 10 18 11 17 11 17 12 16 12 16 13 15 13 15 14 14 14 14 15 13 15 13 16 12 16 12 17 10 17 10 16 9 16 9 15 8 15 8 14 7 14 7 13 6 13 6 12 5 12 5 11 6 11 6 10 7 10 7 9 8 9 8 10 9 10 9 11 10 11 10 12 12 12 12 11 13 11 13 10 14 10 14 9 15 9 15 8 16 8 16 7 17 7 17 8 18 8 18 9 19 9" />
    <path d="m22,2v-1H2v1h-1v20h1v1h20v-1h1V2h-1Zm-1,19H3V3h18v18Z" />
  </>,
  <path d="m22,2v-1H2v1h-1v20h1v1h20v-1h1V2h-1ZM5,11h1v-1h1v-1h1v1h1v1h1v1h2v-1h1v-1h1v-1h1v-1h1v-1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-2v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1Z" />,
);

export const PixelCheckCircle = pixelIcon(
  "PixelCheckCircle",
  <>
    <polygon points="19 9 19 10 18 10 18 11 17 11 17 12 16 12 16 13 15 13 15 14 14 14 14 15 13 15 13 16 12 16 12 17 10 17 10 16 9 16 9 15 8 15 8 14 7 14 7 13 6 13 6 12 7 12 7 11 8 11 8 12 9 12 9 13 10 13 10 14 12 14 12 13 13 13 13 12 14 12 14 11 15 11 15 10 16 10 16 9 17 9 17 8 18 8 18 9 19 9" />
    <path d="m22,9v-2h-1v-2h-1v-1h-1v-1h-2v-1h-2v-1h-6v1h-2v1h-2v1h-1v1h-1v2h-1v2h-1v6h1v2h1v2h1v1h1v1h2v1h2v1h6v-1h2v-1h2v-1h1v-1h1v-2h1v-2h1v-6h-1Zm-2,6v2h-1v2h-2v1h-2v1h-6v-1h-2v-1h-2v-2h-1v-2h-1v-6h1v-2h1v-2h2v-1h2v-1h6v1h2v1h2v2h1v2h1v6h-1Z" />
  </>,
  <path d="m22,9v-2h-1v-2h-1v-1h-1v-1h-2v-1h-2v-1h-6v1h-2v1h-2v1h-1v1h-1v2h-1v2h-1v6h1v2h1v2h1v1h1v1h2v1h2v1h6v-1h2v-1h2v-1h1v-1h1v-2h1v-2h1v-6h-1Zm-4,3h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-2v-1h-1v-1h-1v-1h-1v-1h-1v-2h1v-1h2v1h1v1h2v-1h1v-1h1v-1h1v-1h1v-1h2v1h1v2h-1v1Z" />,
);

export const PixelCheck = pixelIcon(
  "PixelCheck",
  <polygon points="22 4 22 6 21 6 21 7 20 7 20 8 19 8 19 9 18 9 18 10 17 10 17 11 16 11 16 12 15 12 15 13 14 13 14 14 13 14 13 15 12 15 12 16 11 16 11 17 10 17 10 18 8 18 8 17 7 17 7 16 6 16 6 15 5 15 5 14 4 14 4 13 3 13 3 12 2 12 2 10 4 10 4 11 5 11 5 12 6 12 6 13 7 13 7 14 8 14 8 15 10 15 10 14 11 14 11 13 12 13 12 12 13 12 13 11 14 11 14 10 15 10 15 9 16 9 16 8 17 8 17 7 18 7 18 6 19 6 19 5 20 5 20 4 22 4" />,
  <polygon points="23 5 23 6 22 6 22 7 21 7 21 8 20 8 20 9 19 9 19 10 18 10 18 11 17 11 17 12 16 12 16 13 15 13 15 14 14 14 14 15 13 15 13 16 12 16 12 17 11 17 11 18 10 18 10 19 8 19 8 18 7 18 7 17 6 17 6 16 5 16 5 15 4 15 4 14 3 14 3 13 2 13 2 12 1 12 1 11 2 11 2 10 3 10 3 9 4 9 4 10 5 10 5 11 6 11 6 12 7 12 7 13 8 13 8 14 10 14 10 13 11 13 11 12 12 12 12 11 13 11 13 10 14 10 14 9 15 9 15 8 16 8 16 7 17 7 17 6 18 6 18 5 19 5 19 4 20 4 20 3 21 3 21 4 22 4 22 5 23 5" />,
);

export const PixelBold = pixelIcon(
  "PixelBold",
  <path d="m19,13v-1h-2v-1h1v-1h1v-6h-1v-1h-1v-1h-1v-1H5v1h-1v20h1v1h12v-1h1v-1h1v-1h1v-7h-1ZM6,3h10v1h1v6H6V3Zm12,17h-1v1H6v-9h10v1h1v1h1v6Z" />,
  <path d="m19,13v-1h-2v-1h1v-1h1v-6h-1v-1h-1v-1h-1v-1H5v1h-1v20h1v1h12v-1h1v-1h1v-1h1v-7h-1Zm-3,6v1H7v-7h9v1h1v5h-1Zm0-14v4h-1v1H7v-6h8v1h1Z" />,
);

// Sidebar / panel toggle. Not in the HackerNoon set -- hand-authored here on
// the same 24-unit grid with the same 1-unit stroke as the library's own
// square glyphs (compare `PixelCheckSquare`, whose outer frame path this
// reuses verbatim).
//
// The rail is on the LEFT because the panel it collapses -- the Room's
// toolbar -- floats against the plane's left edge, so the glyph is a picture
// of that panel rather than a generic one. Flip the rail if it is ever used
// for a right-hand panel.
//
// One glyph for both directions on purpose: this is a toggle, not a
// direction. A chevron has to flip and then has to be right about which way
// it points; a panel does not.
export const PixelSidebar = pixelIcon(
  "PixelSidebar",
  <>
    <path d="m22,2v-1H2v1h-1v20h1v1h20v-1h1V2h-1Zm-1,19H3V3h18v18Z" />
    <path d="M9,3h1v18h-1V3Z" />
  </>,
  <>
    <path d="m22,2v-1H2v1h-1v20h1v1h20v-1h1V2h-1Zm-1,19H3V3h18v18Z" />
    <path d="M3,3h6v18H3V3Z" />
  </>,
);

// Expand-to-full. Not in the HackerNoon set -- hand-authored on the same
// 24-unit grid, as four corner brackets. Corners rather than the more common
// pair of diagonal arrows: a diagonal is the one line a 1-unit pixel stroke
// cannot draw cleanly, and it would come apart into a dotted staircase at
// icon size (the same failure the pointer-hint arrowheads hit).
export const PixelExpand = pixelIcon(
  "PixelExpand",
  <>
    <rect x="3" y="3" width="7" height="1" />
    <rect x="3" y="4" width="1" height="6" />
    <rect x="14" y="3" width="7" height="1" />
    <rect x="20" y="4" width="1" height="6" />
    <rect x="3" y="14" width="1" height="7" />
    <rect x="4" y="20" width="6" height="1" />
    <rect x="20" y="14" width="1" height="7" />
    <rect x="14" y="20" width="6" height="1" />
  </>,
  <>
    <rect x="3" y="3" width="8" height="2" />
    <rect x="3" y="5" width="2" height="6" />
    <rect x="13" y="3" width="8" height="2" />
    <rect x="19" y="5" width="2" height="6" />
    <rect x="3" y="13" width="2" height="8" />
    <rect x="5" y="19" width="6" height="2" />
    <rect x="19" y="13" width="2" height="8" />
    <rect x="13" y="19" width="6" height="2" />
  </>,
);
