import Link from "next/link";
import { MeldDeckFrame } from "@/ui/meld/deck-frame";
import { MeldRegion } from "@/ui/meld/region";
import { MeldLabel } from "@/ui/meld/stack";
import { MeldWatermark } from "@/ui/meld/watermark";
import type { AttentionItem } from "../attention/types";
import { DeckPrompt } from "./deck-prompt";
import { PendingTicket } from "./pending-ticket";
import { ProjectColumn, type DeckProject } from "./project-column";
import { ShortcutLine } from "./shortcut-line";
import styles from "./deck.module.css";

export type DeckProps = {
  workspaceId: string;
  workspaceName: string;
  projects: DeckProject[];
  items: AttentionItem[];
  /** "Now" for age formatting and the printed date. Injected so tests are stable. */
  printedOn: Date;
  /** True only while a real agent run is in flight -- never a guess. */
  isAgentWorking?: boolean;
};

/**
 * The workspace landing surface: the pending ticket on the left, the project
 * column on the right, the prompt across the foot, all on the dot-field plane.
 *
 * It renders *without* the sidebar shell, which is why the shell lives in the
 * sub-route layouts rather than at `[workspaceId]/layout.tsx`. The page that
 * mounts this runs `requireWorkspaceAccess` itself.
 *
 * `DeckShortcuts` is deliberately absent here: `⌘N` opens the create-project
 * dialog, whose state `ProjectColumn` owns, so the bindings are mounted there.
 */
export function Deck({
  workspaceId,
  workspaceName,
  projects,
  items,
  printedOn,
  isAgentWorking = false,
}: DeckProps) {
  return (
    <MeldDeckFrame>
      <MeldRegion className={styles.deck}>
        <MeldRegion className={styles.watermark}>
          <MeldWatermark workspaceName={workspaceName} />
        </MeldRegion>
        <MeldRegion className={styles.strip}>
          <MeldLabel>{workspaceName}</MeldLabel>
          {/* Without the sidebar the deck is otherwise a dead end: these are
              the only way out of it. "Archive" from the design is deliberately
              absent -- no such route exists, and a link that 404s is worse
              than no link. */}
          <MeldRegion className={styles.stripLinks}>
            <Link
              className={styles.stripLink}
              href={`/${workspaceId}/design-system`}
            >
              Design system
            </Link>
            <Link
              className={styles.stripLink}
              href={`/${workspaceId}/settings/members`}
            >
              Settings
            </Link>
          </MeldRegion>
        </MeldRegion>
        <MeldRegion className={styles.lead}>
          <PendingTicket
            items={items}
            printedOn={printedOn}
            isAgentWorking={isAgentWorking}
          />
        </MeldRegion>
        <MeldRegion className={styles.trail}>
          <ProjectColumn
            workspaceId={workspaceId}
            projects={projects}
            printedOn={printedOn}
          />
        </MeldRegion>
        <MeldRegion className={styles.foot}>
          <MeldRegion className={styles.prompt}>
            <DeckPrompt />
          </MeldRegion>
          <ShortcutLine />
        </MeldRegion>
      </MeldRegion>
    </MeldDeckFrame>
  );
}
