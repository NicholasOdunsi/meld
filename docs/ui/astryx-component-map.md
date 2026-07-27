# Astryx Component Map

This map establishes the Astryx starting point and container policy for each
Meld product surface. Page implementations should inspect the referenced
template and every component they use with the Astryx CLI before composing UI.

| Product surface | Astryx starting point | Container policy |
|---|---|---|
| Application frame | `AppShell` + `SideNav` + `Layout` | Side nav `256`; content flex; optional inspector `380` |
| Home / starting points | `ClickableCard` | Two entry cards; icon over label |
| Discovery conversation | `ai-chat` template + chat-message blocks | Message stream and rows; never cards |
| Attachment composer | `ChatComposerDrawerAttachments` | Tokens and thumbnail row |
| PRD review | `editor` template + `LayoutPanel` | Continuous document with revision inspector |
| Discovery/Feature lists | `List`/`Item` or `Table` | Edge-to-edge dense rows |
| Connector/task state | `StatusDot` with visible text | Status dot, never decorative badge |
| Metadata and removable context | `Token` | Short labels; badge only for counts |
| Forms/settings | `Section` + form components | Cards only for coherent settings groups |
| Errors and persistent warnings | `Banner` | Visible until resolved or dismissed |
| Save/transition confirmation | `useToast` | Non-blocking confirmation only |

The home starting points are a deliberate exception to the "cards only for
coherent settings groups" container policy. Home presents a choice between two
paths, which is the one job cards do better than dense rows. This exception is
limited to the two entry cards; every list on home uses `List`/`Item`.

## Responsive contract

```text
> 1024: SideNav 256 | content | optional inspector 380
<= 1024: inspector overlays content
<= 768: SideNav collapses into AppShell mobile navigation
```

`AppFrame` owns the single root `AppShell`. Later pages compose Astryx
components within that frame and must not introduce another `AppShell`.
