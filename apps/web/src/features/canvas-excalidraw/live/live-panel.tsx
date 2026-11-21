"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { LayoutPanel } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { VStack } from "@astryxdesign/core/VStack";
import { MousePointerClick, Redo2, Undo2 } from "lucide-react";
import type { ScreenSource } from "@meld/screen-runtime/source";
import type { LiveIssue } from "./live-state";

export type LivePanelTab = "code" | "tweak";
export const LIVE_PANEL_TABS: readonly { value: LivePanelTab; label: string }[] = [{ value: "tweak", label: "Tweak" }, { value: "code", label: "Code" }];
export const LIVE_PANEL_WIDTH = 280;

export type LivePanelHistory = { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void };

export type LivePanelInteract = { pressed: boolean; onToggle: () => void };

export function LivePanel({ title, tab, onTabChange, onClose, tabs = LIVE_PANEL_TABS, history, interact, onKeyDown, children }: {
  title: string;
  tab: LivePanelTab;
  onTabChange: (tab: LivePanelTab) => void;
  onClose: () => void;
  tabs?: readonly { value: LivePanelTab; label: string }[];
  history?: LivePanelHistory;
  // Interact hands clicks to the awake screen instead of selecting inside it.
  interact?: LivePanelInteract;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  children: ReactNode;
}) {
  return (
    <LayoutPanel width={LIVE_PANEL_WIDTH} hasDivider padding={3} label="Live screen">
      <VStack gap={3} data-testid="live-panel" onKeyDown={onKeyDown}>
        <HStack gap={2} align="center" justify="between">
          <Text type="label">{title}</Text>
          <HStack gap={1} align="center">
            {interact ? (
              <ToggleButton label="Interact" tooltip="Try the screen: clicks work normally" size="sm" icon={<MousePointerClick />} isIconOnly isPressed={interact.pressed} onPressedChange={() => interact.onToggle()} />
            ) : null}
            {history ? (
              <>
                <IconButton label="Undo" tooltip="Undo" variant="ghost" size="sm" icon={<Undo2 />} isDisabled={!history.canUndo} onClick={history.onUndo} />
                <IconButton label="Redo" tooltip="Redo" variant="ghost" size="sm" icon={<Redo2 />} isDisabled={!history.canRedo} onClick={history.onRedo} />
              </>
            ) : null}
            <Button label="Close" size="sm" variant="ghost" onClick={onClose} />
          </HStack>
        </HStack>
        {tabs.length > 1 ? (
          <TabList value={tab} onChange={(value) => onTabChange(value as LivePanelTab)} size="sm" hasDivider>
            {tabs.map((item) => <Tab key={item.value} value={item.value} label={item.label} />)}
          </TabList>
        ) : null}
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
