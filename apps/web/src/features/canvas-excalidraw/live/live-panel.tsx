"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { HStack } from "@astryxdesign/core/HStack";
import { LayoutPanel } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { VStack } from "@astryxdesign/core/VStack";
import type { ScreenSource } from "@meld/screen-runtime/source";
import type { LiveIssue } from "./live-state";

export type LivePanelTab = "code" | "tweak";
export const LIVE_PANEL_TABS: readonly { value: LivePanelTab; label: string }[] = [{ value: "tweak", label: "Tweak" }, { value: "code", label: "Code" }];
export const LIVE_PANEL_WIDTH = 280;

export function LivePanel({ title, tab, onTabChange, onClose, tabs = LIVE_PANEL_TABS, onKeyDown, disabledTabs, children }: {
  title: string;
  tab: LivePanelTab;
  onTabChange: (tab: LivePanelTab) => void;
  onClose: () => void;
  tabs?: readonly { value: LivePanelTab; label: string }[];
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  // Tabs that cannot be chosen right now, with the reason shown as their tooltip.
  disabledTabs?: Partial<Record<LivePanelTab, string>>;
  children: ReactNode;
}) {
  return (
    <LayoutPanel width={LIVE_PANEL_WIDTH} hasDivider padding={3} label="Live screen">
      <VStack gap={3} data-testid="live-panel" onKeyDown={onKeyDown}>
        <HStack gap={2} align="center" justify="between">
          <Text type="label">{title}</Text>
          <HStack gap={1} align="center">
            <Button label="Close" size="sm" variant="ghost" onClick={onClose} />
          </HStack>
        </HStack>
        {tabs.length > 1 ? (
          <TabList value={tab} onChange={(value) => { if (!disabledTabs?.[value as LivePanelTab]) onTabChange(value as LivePanelTab); }} size="sm" hasDivider>
            {tabs.map((item) => {
              const reason = item.value === tab ? undefined : disabledTabs?.[item.value];
              return reason ? (
                <Tooltip key={item.value} content={reason}>
                  <Tab value={item.value} label={item.label} aria-disabled="true" />
                </Tooltip>
              ) : <Tab key={item.value} value={item.value} label={item.label} />;
            })}
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
