import { PixelArrowUp, PixelFlag } from "@/ui/pixel-icons";
import styles from "./todo-widget.module.css";

export type MeldTodoPriority = "none" | "low" | "medium" | "high";

export const MELD_TODO_PRIORITIES: MeldTodoPriority[] = [
  "none",
  "low",
  "medium",
  "high",
];

const PRIORITY_LABELS: Record<MeldTodoPriority, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export type MeldTodoItem = {
  id: string;
  text: string;
  priority: MeldTodoPriority;
  /** An item already underway reads as a half-filled ring, not an empty one. */
  isInProgress?: boolean;
};

export type MeldTodoGroup = {
  label: string;
  items: MeldTodoItem[];
};

export type MeldTodoWidgetProps = {
  title: string;
  groups: MeldTodoGroup[];
  /** Composer text. Controlled by the caller, which owns the storage. */
  draft: string;
  onDraftChange: (draft: string) => void;
  onSubmit: () => void;
  priority: MeldTodoPriority;
  onPriorityChange: (priority: MeldTodoPriority) => void;
  /** Advances an item: waiting -> underway -> done (and gone). */
  onAdvance: (id: string) => void;
  prompt?: string;
};

function activeCount(groups: MeldTodoGroup[]): number {
  return groups.reduce((total, group) => total + group.items.length, 0);
}

/**
 * The to-do panel on the deck.
 *
 * **It always renders, empty or not.** The composer is the point: an empty list
 * is where someone starts typing, so hiding the widget would hide the only way
 * in. With nothing to do it shows the header, the composer and the chips, and
 * simply has no rows beneath them.
 *
 * Presentational: every piece of state and all persistence belong to the
 * caller, so this stays a primitive that a test can drive directly.
 */
export function MeldTodoWidget({
  title,
  groups,
  draft,
  onDraftChange,
  onSubmit,
  priority,
  onPriorityChange,
  onAdvance,
  prompt = "What needs doing?",
}: MeldTodoWidgetProps) {
  const count = activeCount(groups);

  return (
    <div className={styles.widget} data-testid="todo-widget">
      <div className={styles.head}>
        <span className={styles.title}>{title}</span>
        {count > 0 ? (
          <span className={styles.count}>{`· ${count} Active Tasks`}</span>
        ) : null}
      </div>

      <div className={styles.tabs}>
        <span className={styles.tab} data-selected="true">
          Tasks
        </span>
        <span className={styles.tab}>Backlog</span>
      </div>

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input
          className={styles.input}
          value={draft}
          placeholder={prompt}
          aria-label={prompt}
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <button
          className={styles.send}
          type="submit"
          aria-label="Add task"
          disabled={draft.trim().length === 0}
        >
          <PixelArrowUp aria-hidden />
        </button>
      </form>

      <div className={styles.chips}>
        {MELD_TODO_PRIORITIES.map((value) => (
          <button
            key={value}
            type="button"
            className={styles.chip}
            data-priority={value}
            aria-pressed={value === priority}
            onClick={() => onPriorityChange(value)}
          >
            <PixelFlag aria-hidden />
            {PRIORITY_LABELS[value]}
          </button>
        ))}
      </div>

      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <div className={styles.group} key={group.label}>
            <div className={styles.groupHead}>
              {`${group.label} · ${group.items.length}`}
            </div>
            {group.items.map((item) => (
              <div className={styles.row} key={item.id}>
                <button
                  type="button"
                  className={styles.ring}
                  data-priority={item.priority}
                  data-progress={item.isInProgress ? "true" : "false"}
                  aria-label={
                    item.isInProgress
                      ? `Complete ${item.text}`
                      : `Start ${item.text}`
                  }
                  onClick={() => onAdvance(item.id)}
                />
                <span className={styles.text}>{item.text}</span>
                <span className={styles.more} aria-hidden>
                  …
                </span>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
