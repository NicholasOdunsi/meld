import Link from "next/link";
import { MeldTicket } from "@/ui/meld/ticket";
import { MeldTicketRow } from "@/ui/meld/ticket-row";
import { MeldAgentSprite } from "@/ui/meld/agent-sprite";
import { MeldCenteredActions } from "@/ui/meld/stack";
import type { AttentionItem } from "../attention/types";
import { toPendingKind } from "../pending";
import { formatRelativeTime } from "../relative-time";

// Four rows is what fits above the sprites without the ticket scrolling.
const VISIBLE_ROWS = 4;

const DEFAULT_ACTION_LABEL = "OPEN";

export type PendingTicketProps = {
  items: AttentionItem[];
  /** "Now" for age formatting and the printed date. Injected so tests are stable. */
  printedOn: Date;
  isAgentWorking?: boolean;
};

function sourceLine(item: AttentionItem): string {
  const parts = [item.projectName, item.roomName].filter(Boolean);
  return parts.join(" · ").toUpperCase();
}

function printedDate(now: Date): string {
  return now
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    })
    .toUpperCase();
}

export function PendingTicket({
  items,
  printedOn,
  isAgentWorking = false,
}: PendingTicketProps) {
  const visible = items.slice(0, VISIBLE_ROWS);
  const overflow = items.length - visible.length;

  return (
    <MeldTicket
      title="PENDING"
      count={items.length}
      subtitle={`MELD STUDIO · ${printedDate(printedOn)}`}
      footer={
        <MeldCenteredActions>
          <MeldAgentSprite
            agent="pm"
            state={items.length > 0 ? "waiting" : "idle"}
            label={items.length > 0 ? "PM · WAITING" : "PM · IDLE"}
          />
          <MeldAgentSprite
            agent="design"
            state={isAgentWorking ? "working" : "idle"}
            label={isAgentWorking ? "DESIGN · DRAWING" : "DESIGN · IDLE"}
          />
        </MeldCenteredActions>
      }
    >
      {visible.length === 0 ? "NOTHING PENDING" : null}
      {visible.map((item) => (
        <MeldTicketRow
          key={item.id}
          kind={toPendingKind(item.kind)}
          source={sourceLine(item)}
          age={formatRelativeTime(item.occurredAt, printedOn)}
          ask={item.title}
        >
          <Link href={item.href}>
            {item.actionLabel ?? DEFAULT_ACTION_LABEL}
          </Link>
        </MeldTicketRow>
      ))}
      {overflow > 0 ? `↓ ${overflow} MORE` : null}
    </MeldTicket>
  );
}
