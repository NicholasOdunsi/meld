import type { Provider, RoomActivity, RoomActivityState } from "@meld/contracts";
import type { ProjectActivity } from "./rollup";

export type NeedsYouAction = "Answer" | "Review" | "Fix";

const PROVIDER_NAMES: Record<Provider, string> = { claude: "Claude", codex: "Codex", deepseek: "DeepSeek" };
const providerName = (provider: Provider | null) => (provider ? PROVIDER_NAMES[provider] : "your AI");

export function describeNeedsYou(room: RoomActivity): { title: string; action: NeedsYouAction } {
  if (room.reason === "asked") {
    const titles = {
      prd_generate: "Write the PRD?",
      prd_revise: "Update the PRD?",
      user_flow_generate: "Map the user flow?",
      decision_capture: "Capture a decision?",
    } as const;
    return { title: room.proposalKind ? titles[room.proposalKind] : "Orion has a question", action: "Answer" };
  }
  if (room.reason === "stuck") {
    switch (room.taskStatus) {
      case "needs_reauthentication":
        return { title: `Sign in to ${providerName(room.provider)} again`, action: "Fix" };
      case "usage_limit_reached":
        return { title: `${providerName(room.provider)} usage limit reached`, action: "Fix" };
      case "needs_review":
        return { title: "A result needs a look", action: "Review" };
      default:
        return { title: "Something went wrong", action: "Fix" };
    }
  }
  switch (room.taskKind) {
    case "design_screen_generate":
      return { title: "New screens are ready", action: "Review" };
    case "user_flow_generate":
      return { title: "User flow is ready", action: "Review" };
    case "prd_generate":
    case "prd_revise":
    case "prd_section_revise":
      return { title: "PRD is ready", action: "Review" };
    default:
      return { title: "Orion replied", action: "Review" };
  }
}

export function describeHatLabel(name: string, room: RoomActivity | null, state: RoomActivityState): string {
  if (state === "working") return `${name}: working`;
  if (state === "needs_you" && room) return `${name} needs you · ${describeNeedsYou(room).title}`;
  return name;
}

export function describeProjectStatus(
  project: ProjectActivity,
  lastActive: string | null,
  formatRelative: (iso: string) => string,
): string {
  if (project.state === "working" && project.room) return `Working on ${project.room.roomName}…`;
  if (project.state === "needs_you" && project.room) return describeNeedsYou(project.room).title;
  return lastActive ? `Last active ${formatRelative(lastActive)}` : "No activity yet";
}
