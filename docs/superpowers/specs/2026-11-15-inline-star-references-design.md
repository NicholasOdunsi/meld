# Inline Star references, screen groups, one Orion — design

Date: 2026-11-15 · Status: approved by the owner in conversation ("yeah implement")
Supersedes Piece 1 of `2026-11-15-star-routing-and-done-rows-design.md` (the Done row). Piece 2 (routing) of that spec is still to come.

## In plain language

The one-line Done row did not look good. Instead:

1. **Stars become small inline links in Orion's reply**, like links in a Claude chat: a status icon plus the Star's name, in the same line as the reply text. Click one to open that Star. The "1 reply · Done" line under the reply goes away (the count belongs in the Star panel).
2. **Three or more screens at once become one group card**: a stack of small pictures, "5 screens · 4 done · 1 still drawing". Tapping it opens a short list; tapping an item opens that screen. One or two screens keep their own picture card, as today.
3. **One Orion everywhere.** The old website pages still say "Product Agent", "Design Agent" and "Research Agent". Those names are replaced by "Orion". The right agent still picks the work up behind the scenes; only what the user reads changes.

## Decisions made with the owner

- Inline links (option A) for one or two pieces of work; a group for three or more.
- The Done-row collapse is removed: the conversation stays whole.
- A running Star shows a quiet live line ("Laying out the account card…") only while it runs. This already exists as the activity line; it is unchanged.
- `@design agent` keeps working but is no longer mentioned in the interface.

## Behaviour

**Inline Star link (Mac app).** For an Orion message that started a Star, the Star appears as an inline link after the message text, in the same text flow. Icon and colour by status: working = dotted circle, blue; needs you = exclamation, orange; stuck = octagon, red; done = checkmark, green. The link text is the Star's title. Activating it opens the Star panel (same action as before). Text stays selectable.

**Screen group (Mac app).** Screens are clustered in time order: a screen joins the previous cluster when it was created within 120 seconds of the previous screen and no human message was sent between them. A cluster of 3 or more becomes one group item; a smaller cluster keeps one picture card per screen. The group card shows up to five small pictures (the cached card pictures; a neutral tile while one is not ready), "N screens", and a one-line summary built from counts of done, still drawing and failed screens. Tapping opens a popover list; each row opens that screen on the Canvas; a screen still drawing is not clickable.

**One Orion (website).** Every user-visible *label, message, toast and error* that says "Product Agent", "Research Agent" or "Design Agent" in `apps/web/src` becomes "Orion", with the grammar adjusted (for example "The Product Agent couldn't reply" becomes "Orion couldn't reply"). The exact list and wording are in the plan. The Mac app already says "Orion".

**Deliberately not changed in this pass:** the agent names that the web room composer uses as `@` mention handles (`DISCOVERY_AGENTS`, `PRODUCT_AGENT_MENTION`, the composer's suggestion chips, the mention-stripping in `conversation.tsx`, and the setup hint that tells people to mention the Product Agent). Those names are how a person summons an agent on the old website room page, so renaming them is a behaviour change, not a label change. Retiring that picker belongs with the routing piece, where Orion chooses the agent itself. Internal names (`agentKind`, `product_agent`, task kinds, code comments, test fakes) are also untouched.

## Known limits

- The link sits after the reply text, not mid-sentence: Orion cannot reference a Star that does not exist yet when it writes. Mid-sentence placement needs Orion to tag references, which can come later.
- The working icon in an inline link is static (inline text cannot animate); the live activity line carries the motion.
- A reply shows one Star link: one message belonging to two Stars needs the routing piece (Piece 2 of the earlier spec).
- Grouping applies to screens only; Stars do not come in batches today.

## Out of scope

Routing (continue or new), moving messages between Stars, Constellation changes, any web chat redesign, changing internal agent kinds.

## Build order

1. Mac: remove the Done row; add the group logic and card; add inline Star links (plan `2026-11-15-inline-star-references.md`).
2. Website: rename the agent names (plan `2026-11-15-one-orion-labels.md`).
3. Later: routing.

## Verification

Core logic has unit tests (grouping rules, Star link round trip, Done Stars keep their messages). The Mac views are checked by build and by the owner on screen; agents have no display. The website rename is covered by updated tests plus a grep that no user-visible old name remains.
