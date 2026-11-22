"use client";

import { type KeyboardEvent, type ReactNode } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { HStack } from "@astryxdesign/core/HStack";
import { LayoutPanel } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { X } from "lucide-react";
import type { ScreenSource } from "@meld/screen-runtime/source";
import { ICON_SIZE, PANEL_LAYOUT } from "./inspector-theme";
import type { LiveIssue } from "./live-state";

export type LivePanelTab = "code" | "tweak";
export const LIVE_PANEL_TABS: readonly { value: LivePanelTab; label: string }[] = [{ value: "tweak", label: "Tweak" }, { value: "code", label: "Code" }];
export const LIVE_PANEL_WIDTH = PANEL_LAYOUT.width;

// The inspector's side panel shell (the owner-approved custom surface, styled only by inspector-theme.ts):
// a fixed-width column that scrolls, with the Tweak | Code control on the left of the header and Close on the right.
export function LivePanel({ tab, onTabChange, onClose, tabs = LIVE_PANEL_TABS, onKeyDown, disabledTabs, children }: {
  tab: LivePanelTab;
  onTabChange: (tab: LivePanelTab) => void;
  onClose: () => void;
  // Only for a panel with a single view: with one tab there is nothing to choose, so the control is hidden.
  tabs?: readonly { value: LivePanelTab; label: string }[];
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  // Tabs that cannot be chosen right now, with the reason shown as their tooltip (title), which is also their accessible description.
  disabledTabs?: Partial<Record<LivePanelTab, string>>;
  children: ReactNode;
}) {
  // The current tab is never disabled.
  const reasonFor = (value: LivePanelTab) => (value === tab ? undefined : disabledTabs?.[value]);
  function moveTab(event: KeyboardEvent<HTMLElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const enabled = tabs.filter((item) => !reasonFor(item.value));
    const index = enabled.findIndex((item) => item.value === tab);
    const next = enabled[(index + step + enabled.length) % enabled.length];
    if (!next || next.value === tab) return;
    event.preventDefault();
    onTabChange(next.value);
    event.currentTarget.querySelector<HTMLElement>(`[data-tab="${next.value}"]`)?.focus();
  }
  return (
    <LayoutPanel width={LIVE_PANEL_WIDTH} padding={0} isScrollable={false} label="Live screen">
      <VStack gap={0} className="orion-panel orion-i-scope" data-testid="live-panel" onKeyDown={onKeyDown}>
        <header className="orion-panel__top">
          {tabs.length > 1 ? (
            <HStack role="tablist" aria-label="Panel view" className="orion-seg" onKeyDown={moveTab}>
              {tabs.map((item) => {
                const reason = reasonFor(item.value);
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="tab"
                    data-tab={item.value}
                    className="orion-seg__tab"
                    aria-selected={item.value === tab}
                    aria-disabled={reason ? "true" : undefined}
                    title={reason}
                    tabIndex={item.value === tab || reason ? 0 : -1}
                    onClick={() => { if (!reason) onTabChange(item.value); }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </HStack>
          ) : null}
          <button type="button" className="orion-i-iconbtn" aria-label="Close" onClick={onClose}>
            <X size={ICON_SIZE.close} aria-hidden />
          </button>
        </header>
        {children}
      </VStack>
    </LayoutPanel>
  );
}

export function codeLanguageFor(path: string): "javascript" | "html" | "css" | "plaintext" {
  if (/\.(tsx?|jsx?)$/.test(path)) return "javascript";
  if (/\.html?$/.test(path)) return "html";
  if (path.endsWith(".css")) return "css";
  return "plaintext";
}

// Plan 2's Code tab: what went wrong, and the source to read and copy.
export function LiveCodeView({ source, issues }: { source: ScreenSource | null; issues: readonly LiveIssue[] }) {
  return (
    <VStack gap={3}>
      {issues.length ? (
        <VStack gap={1}>
          <Banner status="error" title={issues.length === 1 ? "This screen has a problem" : `This screen has ${issues.length} problems`} />
          <List density="compact">
            {issues.map((issue, index) => (
              <ListItem key={`${index}-${issue.message}`} label={issue.message} description={issue.file ?? undefined} />
            ))}
          </List>
        </VStack>
      ) : null}
      {source ? Object.entries(source.files).map(([path, code]) => (
        <CodeBlock key={path} title={path} code={code} language={codeLanguageFor(path)} size="sm" width="100%" isWrapped maxHeight="60vh" />
      )) : <Text type="supporting">The code for this screen isn&apos;t available.</Text>}
    </VStack>
  );
}
