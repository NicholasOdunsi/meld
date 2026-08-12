import type { BoxIconProps } from "@boxicons/react";
import { BarChart } from "@boxicons/react/BarChart";
import { Bookmark } from "@boxicons/react/Bookmark";
import { Briefcase } from "@boxicons/react/Briefcase";
import { Calendar } from "@boxicons/react/Calendar";
import { Camera } from "@boxicons/react/Camera";
import { Compass } from "@boxicons/react/Compass";
import { Flag } from "@boxicons/react/Flag";
import { Folder } from "@boxicons/react/Folder";
import { Gift } from "@boxicons/react/Gift";
import { Globe } from "@boxicons/react/Globe";
import { Heart } from "@boxicons/react/Heart";
import { LightBulb } from "@boxicons/react/LightBulb";
import { Megaphone } from "@boxicons/react/Megaphone";
import { Palette } from "@boxicons/react/Palette";
import { Puzzle } from "@boxicons/react/Puzzle";
import { Rocket } from "@boxicons/react/Rocket";
import { Shield } from "@boxicons/react/Shield";
import { Star } from "@boxicons/react/Star";
import { Target } from "@boxicons/react/Target";
import { Trophy } from "@boxicons/react/Trophy";
import type { ComponentType } from "react";
import type { ProjectColor, ProjectIcon } from "./schemas";

// The single place a Project icon key resolves to the glyph it renders --
// consumed by the icon picker in CreateProjectDialog and by the sidebar row
// in ProjectRoomNavigation, so the two never drift out of sync. Typed against
// boxicons' own prop shape (not astryx's generic IconType) so `pack`/`fill`
// stay type-checked at every call site.
export const PROJECT_ICON_COMPONENTS: Record<
  ProjectIcon,
  ComponentType<BoxIconProps>
> = {
  folder: Folder,
  rocket: Rocket,
  target: Target,
  "light-bulb": LightBulb,
  flag: Flag,
  star: Star,
  heart: Heart,
  briefcase: Briefcase,
  "bar-chart": BarChart,
  calendar: Calendar,
  bookmark: Bookmark,
  trophy: Trophy,
  shield: Shield,
  compass: Compass,
  puzzle: Puzzle,
  megaphone: Megaphone,
  gift: Gift,
  camera: Camera,
  palette: Palette,
  globe: Globe,
};

// Human-readable label per icon, used as the picker option's accessible name.
export const PROJECT_ICON_LABELS: Record<ProjectIcon, string> = {
  folder: "Folder",
  rocket: "Rocket",
  target: "Target",
  "light-bulb": "Light bulb",
  flag: "Flag",
  star: "Star",
  heart: "Heart",
  briefcase: "Briefcase",
  "bar-chart": "Bar chart",
  calendar: "Calendar",
  bookmark: "Bookmark",
  trophy: "Trophy",
  shield: "Shield",
  compass: "Compass",
  puzzle: "Puzzle",
  megaphone: "Megaphone",
  gift: "Gift",
  camera: "Camera",
  palette: "Palette",
  globe: "Globe",
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
