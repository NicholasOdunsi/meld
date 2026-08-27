"use client";

import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  assembleValidatedPrototype,
  findScreenSafetyViolations,
} from "@meld/prototype";
import type { DesignProfile, Provider } from "@meld/contracts";
import { startComponentBuild } from "../component-build";

export type DesignSystemViewData = {
  profile: DesignProfile;
  tokenCss: string;
  componentCss: string;
} | null;

const CONTENT_MAX_WIDTH = "calc(var(--spacing-12) * 20)";
// Matches the home page's background override
// (apps/web/src/app/(app)/[workspaceId]/page.tsx).
const CONTENT_BACKGROUND = "var(--color-background-body)";
const SWATCH_SIZE = "var(--spacing-12)";
const PREVIEW_HEIGHT = "calc(var(--spacing-12) * 4)";

type NamedPx = { name: string; px: number };
type ProfileComponent = DesignProfile["components"][number];

// Wraps a single component's `html`/`css` as a one-screen prototype so it can
// render through the exact same sandboxed-iframe pipeline as a built canvas
// screen (buildFramePreviewDoc / assembleValidatedPrototype), rather than a
// bespoke second renderer. Returns null for a component with no `html`
// (nothing generated yet) or one whose markup trips the screen-safety gate --
// either way, the caller falls back to a non-live label instead of crashing
// the whole page over one bad component.
//
// The component's OWN css goes in as design-system css, never as screen
// styles. Assembly runs screen styles through `enforceDesignSystem`, whose R1
// rule strips background, border, border-radius, box-shadow, color,
// font-size, font-weight and padding from any rule naming a `.ds-` class --
// which is every rule a component writes about itself. Passed as screen
// styles, `.ds-experience-card { background; border-radius; box-shadow;
// padding; display: flex }` arrived at the iframe as `display: flex` alone.
// That is the pass working exactly as designed: it exists to stop a SCREEN
// restyling the design system. A component's own css IS the design system, so
// it belongs on the side of that line the pass protects, not the side it
// polices.
function buildComponentPreviewDoc(
  component: ProfileComponent,
  tokenCss: string,
  componentCss: string,
): string | null {
  if (!component.html) return null;
  // Moving the css off `styles` also moves it out of assembly's own safety
  // scan, so it is scanned here instead -- the gate this preview had before
  // is kept, byte for byte, rather than quietly traded away for the fix
  // above.
  if (
    findScreenSafetyViolations({
      markup: component.html,
      styles: component.css ?? "",
      script: null,
      actions: [],
    }).length > 0
  ) {
    return null;
  }
  try {
    return assembleValidatedPrototype({
      screens: [
        {
          id: component.name,
          name: component.name,
          markup: component.html,
          styles: "",
          script: null,
          actions: [],
          layout: null,
        },
      ],
      startScreenId: component.name,
      tokenCss,
      // Appended rather than relied upon: `componentCss` is the compiled
      // stylesheet, which normally already carries this component's rules,
      // but it can legitimately omit them -- `compileComponentCss` stops at
      // the 48 KiB total cap. Appending makes the preview show what this
      // component actually says about itself either way, and a duplicate of
      // an identical rule changes nothing.
      componentCss: [componentCss, component.css ?? ""]
        .filter((part) => part.length > 0)
        .join("\n"),
    });
  } catch {
    return null;
  }
}

function ColorSwatch({ color }: { color: DesignProfile["colors"][number] }) {
  return (
    <VStack gap={2} data-testid="color-swatch">
      <VStack
        aria-hidden="true"
        style={{
          backgroundColor: color.value,
          borderRadius: "var(--radius-element)",
          border: "var(--border-width) solid var(--color-border)",
          width: SWATCH_SIZE,
          height: SWATCH_SIZE,
        }}
      />
      <Text type="label" size="sm">
        {color.name}
      </Text>
      <Text type="supporting" color="secondary" size="sm">
        {color.value}
      </Text>
    </VStack>
  );
}

function TokenRow({ token, unit }: { token: NamedPx; unit: string }) {
  return (
    <HStack hAlign="between" vAlign="center" data-testid="token-row">
      <Text type="label" size="sm">
        {token.name}
      </Text>
      <Text type="supporting" color="secondary" size="sm">
        {token.px}
        {unit}
      </Text>
    </HStack>
  );
}

function TokenSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <VStack gap={4}>
      <Heading level={2}>{title}</Heading>
      {children}
    </VStack>
  );
}

function ComponentPreviewCard({
  component,
  tokenCss,
  componentCss,
}: {
  component: ProfileComponent;
  tokenCss: string;
  componentCss: string;
}) {
  const doc = buildComponentPreviewDoc(component, tokenCss, componentCss);

  return (
    <Card variant="default" padding={4}>
      <VStack gap={3}>
        <VStack gap={1}>
          <Text type="label" size="sm">
            {component.name}
          </Text>
          <Text type="supporting" color="secondary" size="sm">
            .ds-{component.name}
          </Text>
        </VStack>
        {doc !== null ? (
          <VStack
            gap={0}
            style={{
              backgroundColor: "var(--color-background-body)",
              borderRadius: "var(--radius-element)",
              border: "var(--border-width) solid var(--color-border)",
              overflow: "hidden",
              height: PREVIEW_HEIGHT,
            }}
          >
            <iframe
              title={`${component.name} preview`}
              sandbox=""
              srcDoc={doc}
              style={{ width: "100%", height: "100%", border: "0" }}
            />
          </VStack>
        ) : (
          <HStack>
            <Badge variant="neutral" label="Described, not generated" />
          </HStack>
        )}
      </VStack>
    </Card>
  );
}

type BuildState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "started" }
  | { status: "error"; message: string };

// Shown above the Components section only while at least one component is
// still prose-only. `roomId` is resolved by the page (the Design System page
// itself is workspace-scoped, but starting a build pass needs a room) --
// without one there is nowhere to run the pass, so the button does not
// render at all rather than rendering disabled with no explanation.
//
// `provider` is the caller's own ready provider (resolveAgentReadiness, the
// same resolution the composer's picker uses), not a hardcoded choice --
// queue_design_component_build_batch inserts tasks directly into ai_tasks,
// bypassing create_ai_task's device/provider compatibility check, so a
// provider this button merely guessed at could queue a task the caller's
// device can never run (fix round 1, review finding 1). The RPC itself now
// re-resolves the provider from the caller's own device pairing regardless
// of what is passed (202608270005), so this is not the only guard against
// that -- but the button should not offer a choice it already knows is
// fictional, which is also why the button does not render at all without a
// ready provider (see DesignSystemView below).
function BuildComponentsButton({
  roomId,
  provider,
  remainingCount,
}: {
  roomId: string;
  provider: Provider;
  remainingCount: number;
}) {
  const [state, setState] = useState<BuildState>({ status: "idle" });

  const handleClick = () => {
    setState({ status: "pending" });
    void startComponentBuild(roomId, provider).then((result) => {
      setState(
        result.status === "started"
          ? { status: "started" }
          : { status: "error", message: result.message },
      );
    });
  };

  return (
    <VStack gap={2}>
      <HStack>
        <Button
          label={`Build ${remainingCount} remaining components`}
          variant="primary"
          isDisabled={state.status === "pending" || state.status === "started"}
          onClick={handleClick}
        />
      </HStack>
      {state.status === "started" ? (
        <Text type="supporting" color="secondary">
          Building the rest of your components. Check back soon.
        </Text>
      ) : null}
      {state.status === "error" ? (
        <Text type="supporting" color="secondary">
          {state.message}
        </Text>
      ) : null}
    </VStack>
  );
}

export function DesignSystemView({
  data,
  roomId = null,
  provider = null,
}: {
  data: DesignSystemViewData;
  roomId?: string | null;
  provider?: Provider | null;
}) {
  if (data === null) {
    return (
      <VStack width="100%" height="100%" padding={6} hAlign="center" vAlign="center">
        <EmptyState
          title="No design system yet"
          description="Upload a design system in a room to see its tokens and components here."
        />
      </VStack>
    );
  }

  const { profile, tokenCss, componentCss } = data;
  const remainingComponentCount = profile.components.filter(
    (component) => !component.html,
  ).length;

  return (
    <Layout
      height="fill"
      contentWidth={CONTENT_MAX_WIDTH}
      style={{ backgroundColor: CONTENT_BACKGROUND }}
    >
      <LayoutContent
        padding={10}
        style={{
          backgroundColor: CONTENT_BACKGROUND,
          paddingInlineStart: "var(--spacing-12)",
          paddingInlineEnd: "var(--spacing-12)",
        }}
      >
        <VStack gap={10} width="100%" style={{ paddingBlockStart: "var(--spacing-10)" }}>
          <Heading level={1}>Design System</Heading>

          <TokenSection title="Colors">
            {profile.colors.length > 0 ? (
              <Grid columns={{ minWidth: 120, max: 8 }} gap={4}>
                {profile.colors.map((color) => (
                  <ColorSwatch key={color.name} color={color} />
                ))}
              </Grid>
            ) : (
              <Text type="supporting" color="secondary">
                No colors distilled yet.
              </Text>
            )}
          </TokenSection>

          <TokenSection title="Type scale">
            {profile.typeScale.length > 0 ? (
              <VStack gap={2}>
                {profile.typeScale.map((step) => (
                  <TokenRow key={step.name} token={step} unit="px" />
                ))}
              </VStack>
            ) : (
              <Text type="supporting" color="secondary">
                No type scale distilled yet.
              </Text>
            )}
          </TokenSection>

          <TokenSection title="Spacing">
            {profile.spacing.length > 0 ? (
              <VStack gap={2}>
                {profile.spacing.map((step) => (
                  <TokenRow key={step.name} token={step} unit="px" />
                ))}
              </VStack>
            ) : (
              <Text type="supporting" color="secondary">
                No spacing scale distilled yet.
              </Text>
            )}
          </TokenSection>

          <TokenSection title="Radii">
            {profile.radii.length > 0 ? (
              <VStack gap={2}>
                {profile.radii.map((radius) => (
                  <TokenRow key={radius.name} token={radius} unit="px" />
                ))}
              </VStack>
            ) : (
              <Text type="supporting" color="secondary">
                No radii distilled yet.
              </Text>
            )}
          </TokenSection>

          {remainingComponentCount > 0 && roomId !== null && provider !== null ? (
            <BuildComponentsButton
              roomId={roomId}
              provider={provider}
              remainingCount={remainingComponentCount}
            />
          ) : null}

          <TokenSection title="Components">
            {profile.components.length > 0 ? (
              <Grid columns={{ minWidth: 240, max: 3 }} gap={4}>
                {profile.components.map((component) => (
                  <ComponentPreviewCard
                    key={component.name}
                    component={component}
                    tokenCss={tokenCss}
                    componentCss={componentCss}
                  />
                ))}
              </Grid>
            ) : (
              <Text type="supporting" color="secondary">
                No components distilled yet.
              </Text>
            )}
          </TokenSection>
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
