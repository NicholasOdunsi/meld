# Main Dashboard Navigation

## Goal

Replace the temporary organization navigation with a Slack-inspired dashboard
shell that makes the current workspace, primary destinations, Discovery Rooms,
and Feature Rooms continuously visible.

## Scope

This first dashboard pass builds the persistent navigation foundation. It does
not redesign the main Discovery Room, conversation, inspector, members, or
onboarding content.

Search and Mentions are visible but disabled because those product systems do
not exist yet. Feature Rooms receive a dedicated section but no fabricated
records or manual creation behavior; the product lifecycle creates them from an
accepted PRD.

## Desktop layout

The application frame has three horizontal regions:

1. A narrow, permanently collapsed workspace rail.
2. A standard resizable Astryx `SideNav`.
3. The existing page content.

The workspace rail shows the selected organization as an icon-only navigation
item and a second icon-only item for creating another workspace. Creating a
workspace opens the existing `/onboarding` flow.

The wider sidebar shows the organization name in its header. Its first section
contains:

- Home
- Search
- Mentions
- Settings

Home links to the organization’s Discovery Rooms overview, which remains the
current application landing page. Settings links to members. Search and
Mentions are disabled.

## Room navigation

The Discovery Rooms section has a compact plus action. The action links to the
existing Discovery Rooms overview, where the real room-creation form already
lives.

Every persisted Discovery Room appears as a compact sidebar item using the
Boxicons `Hashtag` icon. The selected room is highlighted by matching the
current pathname. The list grows directly from `listDiscoveryRooms`, so newly
created rooms appear on the next server refresh without duplicate navigation
state.

The Feature Rooms section mirrors the visual hierarchy of Discovery Rooms. Its
plus action is disabled and explains that Feature Rooms come from accepted
PRDs. No empty fake room row is shown.

## Components and styling

- Astryx `AppShell` remains the outer application frame.
- Astryx `SideNav`, `SideNavHeading`, `SideNavSection`, `SideNavItem`,
  `IconButton`, `HStack`, and `Icon` provide all structure and interaction.
- Boxicons supplies `Home`, `Search`, `At`, `Cog`, `Hashtag`, `Rocket`, `Plus`,
  and `Buildings`.
- Boxicon SVG components are passed through Astryx `Icon` or SideNav icon props
  so sizing, color, selection, and accessibility remain design-system driven.
- No raw layout elements, stylesheet, utility classes, hardcoded colors, or
  hardcoded pixel styles are introduced.

## Responsive behavior

The two navigation rails are composed inside the existing `AppShell` side-nav
slot. On desktop they remain side by side. On narrow screens the existing
AppShell mobile-navigation behavior owns their presentation; the main content
continues to use its existing responsive contracts.

## Data and authorization

The organization layout continues to authenticate the user and verify
membership before rendering the shell. After authorization it loads Discovery
Rooms for that organization and passes serializable organization and room data
to a client navigation component.

The fake E2E workspace path uses the same component and data shape as production
so the browser test exercises the real shell.

## Testing

- A component test asserts the organization heading, primary destinations,
  disabled Search and Mentions items, Discovery Room links, selected room state,
  create-workspace link, and Feature Rooms section.
- The onboarding E2E test asserts the shell after the setup interstitial and
  verifies a created Discovery Room appears in persistent navigation.
- Run web tests, typecheck, lint, Astryx conventions, the production build, and
  the onboarding Playwright test.
