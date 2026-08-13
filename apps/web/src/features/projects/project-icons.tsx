import type { BoxIconProps } from "@boxicons/react";
import {
  PixelAnalytics,
  PixelBadgeCheck,
  PixelBank,
  PixelBookmark,
  PixelBriefcase,
  PixelCalendar,
  PixelChartLine,
  PixelClipboard,
  PixelCoins,
  PixelCreditCard,
  PixelCrown,
  PixelFlag,
  PixelFolder,
  PixelGlobe,
  PixelGraduationCap,
  PixelHandshake,
  PixelLightBulb,
  PixelMegaphone,
  PixelMerge,
  PixelPaintBrush,
  PixelReceipt,
  PixelSeedlings,
  PixelShield,
  PixelShop,
  PixelSitemap,
  PixelStar,
  PixelTag,
  PixelTrending,
  PixelTrophy,
  PixelWallet,
} from "@/ui/pixel-icons";
import type { ComponentType } from "react";
import type { ProjectColor, ProjectIcon } from "./schemas";

// The single place a Project icon key resolves to the glyph it renders --
// consumed by the icon picker in CreateProjectDialog and by the sidebar row
// in ProjectRoomNavigation, so the two never drift out of sync. Typed against
// boxicons' own prop shape (not astryx's generic IconType) so `pack`/`fill`
// stay type-checked at every call site -- the pixel glyphs in `@/ui/pixel-icons`
// accept the same shape for exactly this reason.
//
// Six keys (rocket/target/heart/compass/puzzle/gift/camera -- the ones with
// no literal glyph, or whose closest literal substitute didn't read as a
// workspace/business icon) render a business-flavoured stand-in instead:
// see the "Business-flavoured substitutes" section of `@/ui/pixel-icons` for
// what backs each one. The stored `ProjectIcon` key is unchanged (it's
// persisted), only its glyph and picker label move -- see
// PROJECT_ICON_LABELS below for the label each now carries.
export const PROJECT_ICON_COMPONENTS: Record<
  ProjectIcon,
  ComponentType<BoxIconProps>
> = {
  folder: PixelFolder,
  rocket: PixelTrending,
  target: PixelBadgeCheck,
  "light-bulb": PixelLightBulb,
  flag: PixelFlag,
  star: PixelStar,
  heart: PixelHandshake,
  briefcase: PixelBriefcase,
  "bar-chart": PixelChartLine,
  calendar: PixelCalendar,
  bookmark: PixelBookmark,
  trophy: PixelTrophy,
  shield: PixelShield,
  compass: PixelSitemap,
  puzzle: PixelMerge,
  megaphone: PixelMegaphone,
  gift: PixelTag,
  camera: PixelClipboard,
  palette: PixelPaintBrush,
  globe: PixelGlobe,
  bank: PixelBank,
  coins: PixelCoins,
  "credit-card": PixelCreditCard,
  wallet: PixelWallet,
  crown: PixelCrown,
  "graduation-cap": PixelGraduationCap,
  analytics: PixelAnalytics,
  receipt: PixelReceipt,
  shop: PixelShop,
  seedlings: PixelSeedlings,
};

// Human-readable label per icon, used as the picker option's accessible
// name -- kept in sync with what PROJECT_ICON_COMPONENTS actually renders
// (the label announces the glyph shown, not the underlying stored key).
export const PROJECT_ICON_LABELS: Record<ProjectIcon, string> = {
  folder: "Folder",
  rocket: "Growth",
  target: "Approved",
  "light-bulb": "Light bulb",
  flag: "Flag",
  star: "Star",
  heart: "Partnership",
  briefcase: "Briefcase",
  "bar-chart": "Bar chart",
  calendar: "Calendar",
  bookmark: "Bookmark",
  trophy: "Trophy",
  shield: "Shield",
  compass: "Roadmap",
  puzzle: "Integration",
  megaphone: "Megaphone",
  gift: "Pricing",
  camera: "Notes",
  palette: "Palette",
  globe: "Globe",
  bank: "Bank",
  coins: "Coins",
  "credit-card": "Credit card",
  wallet: "Wallet",
  crown: "Crown",
  "graduation-cap": "Graduation cap",
  analytics: "Analytics",
  receipt: "Receipt",
  shop: "Shop",
  seedlings: "Seedlings",
};

// The single place a Project colour key resolves to the CSS var it renders
// with -- the design system's non-semantic `--color-icon-*` swatches, not
// arbitrary hex, so every project colour stays theme-aware (light/dark).
export const PROJECT_COLOR_VARS: Record<ProjectColor, string> = {
  blue: "var(--color-icon-blue)",
  cyan: "var(--color-icon-cyan)",
  gray: "var(--color-icon-gray)",
  green: "var(--color-icon-green)",
  orange: "var(--color-icon-orange)",
  pink: "var(--color-icon-pink)",
  purple: "var(--color-icon-purple)",
  red: "var(--color-icon-red)",
  teal: "var(--color-icon-teal)",
  yellow: "var(--color-icon-yellow)",
};

// Human-readable label per colour, used as the picker swatch's accessible
// name.
export const PROJECT_COLOR_LABELS: Record<ProjectColor, string> = {
  blue: "Blue",
  cyan: "Cyan",
  gray: "Gray",
  green: "Green",
  orange: "Orange",
  pink: "Pink",
  purple: "Purple",
  red: "Red",
  teal: "Teal",
  yellow: "Yellow",
};
