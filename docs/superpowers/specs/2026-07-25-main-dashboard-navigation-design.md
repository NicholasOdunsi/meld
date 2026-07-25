# Main Dashboard Navigation

## Goal

Replace the temporary organization navigation with a Slack-inspired dashboard
shell that makes the current workspace, primary destinations, Discovery Rooms,
and Feature Rooms continuously visible.

## Scope

This first dashboard pass builds the persistent navigation foundation. It
removes the room-local navigation rail that would duplicate the new persistent
Discovery Rooms section, but does not redesign the conversation, inspector,
members, onboarding, or Discovery Rooms overview content.

Search and Mentions are visible but disabled because those product systems do
not exist yet. Feature Rooms receive a dedicated section but no fabricated
records or manual creation behavior; the product lifecycle creates them from an
accepted PRD.

## Desktop layout

The application frame has three horizontal regions:

1. A narrow, permanently collapsed workspace rail.
2. A standard resizable Astryx `SideNav`.
3. The existing page content.

The workspace rail shows the selected organization's uploaded logo as an
icon-only navigation item and a second icon-only item for creating another
workspace. The logo uses the public `organization-logos` asset URL and falls
back to the Boxicons `Buildings` icon when no usable logo is available.
Creating a workspace opens the existing `/onboarding` flow.

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

The room groups begin below the primary navigation with an extra token-based
section break. Discovery Rooms uses the Boxicons `MessageBubbleDots` icon and
Feature Rooms uses the Boxicons `Rocket` icon in their headers.

The Discovery Rooms section has a compact plus action. The action links to the
existing Discovery Rooms overview, where the real room-creation form already
lives. The action retains Astryx's smallest supported button target while its
plus glyph uses the smaller `xsm` icon size.

Every persisted Discovery Room appears as an Astryx nested sidebar item beneath
the Discovery Rooms parent. Native nesting shifts the room content inward while
preserving a full-width hover and selected background. Discovery Room children
use the Boxicons `LightBulb` icon; future Feature Room children use `DoorOpen`.
The section-level `MessageBubbleDots` and `Rocket` icons remain unchanged.

Child room rows use the compact SideNav size and the secondary text and icon
tokens while idle so long room lists do not compete with primary navigation.
The selected room restores primary text and icon contrast and uses the normal
Astryx selected background. Selection continues to match the current pathname.
The Discovery list grows directly from `listDiscoveryRooms`, so newly created
rooms refresh the server layout after navigation and appear immediately without
duplicate navigation state.

The Feature Rooms section mirrors the visual hierarchy of Discovery Rooms. Its
plus action is disabled and explains that Feature Rooms come from accepted
PRDs. No empty fake room row is shown.

## Components and styling

- Astryx `AppShell` remains the outer application frame.
- Astryx `SideNav`, `SideNavHeading`, `SideNavSection`, `SideNavItem`,
  `IconButton`, `HStack`, `VStack`, `Text`, `Divider`, and `Icon` provide all
  structure and interaction. A vertical divider separates the workspace rail
  from the main sidebar.
- Boxicons supplies `Home`, `Search`, `At`, `Cog`, `LightBulb`, `DoorOpen`,
  `Rocket`, `Plus`, `MessageBubbleDots`, and `Buildings`.
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
membership before rendering the shell. After authorization it loads the
organization name and logo path plus Discovery Rooms for that organization. It
turns a stored production logo path into its public storage URL and passes
serializable organization and room data to a client navigation component.

The fake E2E workspace path uses the same component and data shape as production
so the browser test exercises the real shell.

## Testing

- A component test asserts the organization heading, primary destinations,
  disabled Search and Mentions items, Discovery Room links, selected room state,
  organization logo, icon-bearing room headers, compact plus glyphs,
  create-workspace link, and Feature Rooms section.
- The onboarding E2E test asserts the shell after the setup interstitial and
  the Discovery Room E2E test verifies a created room appears in persistent
  navigation.
- Run web tests, typecheck, lint, Astryx conventions, the production build, and
  the onboarding Playwright test.
