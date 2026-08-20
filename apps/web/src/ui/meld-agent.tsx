import type { AgentKind } from "@meld/contracts";
import type { ImgHTMLAttributes } from "react";

export type MeldAgentVariant = "meld" | AgentKind;
export type MeldAgentAppearance = "full" | "head";
export type MeldAgentSprite = keyof typeof MELD_AGENT_ASSETS;

export const MELD_AGENT_ASSETS = {
  "central-teal": "/agents/central-teal.svg",
  "pink-stretch": "/agents/pink-stretch.svg",
  "blue-lanky": "/agents/blue-lanky.svg",
  "lime-squat": "/agents/lime-squat.svg",
  "purple-pocket": "/agents/purple-pocket.svg",
  "orange-sit": "/agents/orange-sit.svg",
  "pink-curly": "/agents/pink-curly.svg",
  "orange-perch": "/agents/orange-perch.svg",
} as const;

const DEFAULT_SPRITE: Record<MeldAgentVariant, MeldAgentSprite> = {
  meld: "central-teal",
  product: "pink-stretch",
  research: "lime-squat",
  design: "purple-pocket",
};

export type MeldAgentProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "alt" | "src"
> & {
  variant?: MeldAgentVariant;
  sprite?: MeldAgentSprite;
  appearance?: MeldAgentAppearance;
  eyeOffset?: -1 | 0 | 1;
};

/**
 * Asset-backed pixel mascot. The `sprite` escape hatch keeps the full cast
 * available while role surfaces use a stable default character.
 */
export function MeldAgent({
  variant = "meld",
  sprite,
  appearance = "full",
  eyeOffset = 0,
  width = "100%",
  height = "100%",
  style,
  ...imageProps
}: MeldAgentProps) {
  const selectedSprite = sprite ?? DEFAULT_SPRITE[variant];
  const horizontalOffset =
    eyeOffset === 0
      ? undefined
      : eyeOffset > 0
        ? "var(--spacing-0-5)"
        : "calc(var(--spacing-0-5) * -1)";

  return (
    // SVG sprites need arbitrary intrinsic sizes in compact markers and the
    // composer peek, so next/image's fixed-dimension contract is not a fit.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...imageProps}
      src={MELD_AGENT_ASSETS[selectedSprite]}
      alt=""
      aria-hidden="true"
      width={width}
      height={height}
      data-variant={variant}
      data-appearance={appearance}
      data-sprite={selectedSprite}
      data-eye-offset={eyeOffset}
      style={{
        imageRendering: "pixelated",
        objectFit: "contain",
        transform: horizontalOffset
          ? `translateX(${horizontalOffset})`
          : undefined,
        ...style,
      }}
    />
  );
}
