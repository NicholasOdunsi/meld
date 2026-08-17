import type { SVGProps } from "react";

export type MeldBotVariant = "meld" | "product" | "research" | "design";
export type MeldBotAppearance = "full" | "head";
export type MeldBotEyeOffset = -1 | 0 | 1;

const PALETTE: Record<
  MeldBotVariant,
  { body: string; detail: string }
> = {
  meld: {
    body: "var(--color-on-dark)",
    detail: "var(--color-on-light)",
  },
  product: {
    body: "var(--color-icon-pink)",
    detail: "var(--color-on-dark)",
  },
  research: {
    body: "var(--color-icon-teal)",
    detail: "var(--color-on-dark)",
  },
  // The Canvas rail's Agents icon (design-surface agent) -- distinct from
  // product/research so all three read apart at a glance in the same spot.
  design: {
    body: "var(--color-icon-purple)",
    detail: "var(--color-on-dark)",
  },
};

export type MeldBotProps = SVGProps<SVGSVGElement> & {
  variant?: MeldBotVariant;
  appearance?: MeldBotAppearance;
  eyeOffset?: MeldBotEyeOffset;
};

export function MeldBot({
  variant = "meld",
  appearance = "full",
  eyeOffset = 0,
  width = "100%",
  height = "100%",
  ...svgProps
}: MeldBotProps) {
  const palette = PALETTE[variant];
  const isFullBody = appearance === "full";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={isFullBody ? "0 0 36 36" : "4 0 28 24"}
      width={width}
      height={height}
      fill="none"
      shapeRendering="crispEdges"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      data-variant={variant}
      data-appearance={appearance}
      {...svgProps}
    >
      <g data-part="antenna" data-testid="meld-bot-antenna">
        <path
          data-testid="meld-bot-body-tone"
          fill={palette.body}
          d="M17 2h2v4h-2z"
        />
        <path
          data-testid="meld-bot-detail-tone"
          fill={palette.detail}
          d="M16 0h4v3h-4z"
        />
      </g>
      <g data-part="head" data-testid="meld-bot-head">
        <path
          data-testid="meld-bot-body-tone"
          fill={palette.body}
          d="M8 5h20v2h3v13h-3v3H8v-3H5V7h3V5Z"
        />
        <path
          data-testid="meld-bot-detail-tone"
          fill={palette.detail}
          d="M10 11h5v4h-5zM21 11h5v4h-5zM14 18h8v2h-8z"
        />
        <g
          data-testid="meld-bot-eyes"
          transform={`translate(${eyeOffset} 0)`}
        >
          <path
            data-testid="meld-bot-body-tone"
            fill={palette.body}
            d="M12 12h2v2h-2zM22 12h2v2h-2z"
          />
        </g>
      </g>
      {isFullBody ? (
        <>
          <g data-part="torso" data-testid="meld-bot-torso">
            <path
              data-testid="meld-bot-body-tone"
              fill={palette.body}
              d="M12 23h12v2h2v7H10v-7h2v-2Z"
            />
            <path
              data-testid="meld-bot-detail-tone"
              fill={palette.detail}
              d="M14 25h8v5h-2v-2h-1v2h-2v-2h-1v2h-2v-5Z"
            />
          </g>
          <g data-part="left-arm" data-testid="meld-bot-left-arm">
            <path
              data-testid="meld-bot-body-tone"
              fill={palette.body}
              d="M7 24h4v7H9v2H5v-4h2v-5Z"
            />
          </g>
          <g data-part="right-arm" data-testid="meld-bot-right-arm">
            <path
              data-testid="meld-bot-body-tone"
              fill={palette.body}
              d="M25 24h4v5h2v4h-4v-2h-2v-7Z"
            />
          </g>
          <g data-part="left-leg" data-testid="meld-bot-left-leg">
            <path
              data-testid="meld-bot-body-tone"
              fill={palette.body}
              d="M11 32h6v2h-1v2H9v-2h2v-2Z"
            />
            <path
              data-testid="meld-bot-detail-tone"
              fill={palette.detail}
              d="M9 34h7v2H9z"
            />
          </g>
          <g data-part="right-leg" data-testid="meld-bot-right-leg">
            <path
              data-testid="meld-bot-body-tone"
              fill={palette.body}
              d="M19 32h6v2h2v2h-7v-2h-1v-2Z"
            />
            <path
              data-testid="meld-bot-detail-tone"
              fill={palette.detail}
              d="M20 34h7v2h-7z"
            />
          </g>
        </>
      ) : null}
    </svg>
  );
}
