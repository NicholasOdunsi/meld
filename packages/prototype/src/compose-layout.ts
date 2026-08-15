import type { ResolvedScreenAction } from "./screen-action-resolve";
import type { DesignScreenPayload } from "./screen-payload";

export type PrototypeLayout = {
  id: string;
  shellMarkup: string;
  shellStyles: string;
  actions: ResolvedScreenAction[];
};

const SLOT = /<([a-zA-Z][\w-]*)((?:[^>]*?)\bdata-meld-slot\b(?:[^>]*?))>\s*<\/\1>/g;

export function injectSlot(shellMarkup: string, content: string) {
  const matches = shellMarkup.match(SLOT);
  if (!matches || matches.length !== 1) return { markup: shellMarkup, ok: false };
  const markup = shellMarkup.replace(SLOT, (_m, tag, attrs) => `<${tag}${attrs}>${content}</${tag}>`);
  return { markup, ok: true };
}

export function namespaceLayoutActionId(actionId: string): string {
  return `layout__${actionId}`;
}

// Rewrites data-meld-action="X" -> data-meld-action="layout__X" for each layout
// action id, so a content action can never shadow a nav link in the route table.
function namespaceShellActions(markup: string, actions: ResolvedScreenAction[]): string {
  let out = markup;
  for (const a of actions) {
    out = out.split(`data-meld-action="${a.id}"`).join(`data-meld-action="${namespaceLayoutActionId(a.id)}"`);
  }
  return out;
}

export function composeScreen(
  screen: DesignScreenPayload & { id: string; name: string; layout?: PrototypeLayout | null },
) {
  const routes: Record<string, string | null> = {};
  for (const a of screen.actions) routes[a.id] = a.targetScreenId ?? null;

  if (!screen.layout) {
    return { markup: screen.markup, contentStyles: screen.styles, layoutStyles: null as { id: string; css: string } | null, routes };
  }

  const layout = screen.layout;
  const injected = injectSlot(layout.shellMarkup, screen.markup);
  // Missing/duplicate slot: fall back to standalone content, drop the shell.
  const markup = injected.ok
    ? namespaceShellActions(injected.markup, layout.actions)
    : screen.markup;

  if (injected.ok) {
    for (const a of layout.actions) routes[namespaceLayoutActionId(a.id)] = a.targetScreenId ?? null;
  }

  return {
    markup,
    contentStyles: screen.styles,
    layoutStyles: injected.ok ? { id: layout.id, css: layout.shellStyles } : null,
    routes,
  };
}
