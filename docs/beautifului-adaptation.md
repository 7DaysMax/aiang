# Beautiful UI product adaptation checklist

This is the acceptance list for the 20 components published at `beautifului.dev`. A component is counted only when the real product imports the registry implementation, supplies real application data, and exposes a reachable interaction. Gallery defaults do not count.

| # | Official component | Product surface | Real data / action | Acceptance |
|---|---|---|---|---|
| 1 | Loading State | Live transcript processing row | Agent run state | Active |
| 2 | Thinking | Assistant reasoning disclosure | Incremental reasoning entries | Active |
| 3 | Streaming Text | Assistant answer | Real incremental markdown, copy, retry, sources | Active |
| 4 | Approval Card | Agent questions / approval | Tool questions and submitted answers | Active |
| 5 | Tool Chips | Tool-call groups | Tool kind, payload, result, errors and file diffs | Active |
| 6 | Task Rows | Agent task plan | `TodoWrite` tasks and status | Active |
| 7 | Chat | Transcript/composer dock shell | Current chat and send lifecycle | Active |
| 8 | Prompt Bar | Main composer | Provider, model, effort, permissions, skills, attachments and send | Active |
| 9 | Recommendation Card | Provider settings | Installed provider catalogue and default-provider write | Active |
| 10 | Context Cards | Composer context meter | Current used/max context tokens | Active |
| 11 | Diff Table | Proposed edit summary | Current changed files, review/open/discard | Active |
| 12 | Records Table | Git/snapshot panel table view | Current changed files and stage/open actions | Active |
| 13 | Filter Table | Todo table view | Current task status and active form | Active |
| 14 | Sidebar Nav | Application sidebar shell | Projects, chats, routing, search and resize | Active |
| 15 | Search | Command-help dialog | Real virtual commands; selection inserts into composer | Active |
| 16 | Flowchart | Todo workflow view | Current ordered task plan; draggable nodes | Active |
| 17 | Insight Cards | Conversation overview panel | Context, token, request, model and balance metrics | Active |
| 18 | Code Block | Markdown/tool content | Real code, filename, language, copy and streaming state | Active |
| 19 | Fine-tune Card | Provider defaults | Current engine mode and reasoning effort writes | Active |
| 20 | Selection Actions | Transcript text selection | Explain/improve/shorten/send into composer | Active |

## Cross-surface acceptance

- No registry component may run its demo timer or fake sample data in a product surface.
- All popovers and menus must have an opaque theme surface.
- Default transcript views stay compact; table/flow views are user-selected.
- Desktop and 390px-width layouts must not overflow the viewport.
- Light and dark themes must retain readable contrast.
- Production build and focused interaction tests must pass before this checklist is reported complete.

## Verification evidence

- Browser interaction pass: chat, command search, provider recommendation/fine-tuning, context tooltip, insight overview, Git records table, model/effort controls and the capability `+` menu.
- Responsive pass: 1280×720 and 390×844; document width stayed equal to viewport width. Laptop and mobile right panels render through a body portal so transformed workspace ancestors cannot push them off-screen.
- Theme pass: explicit Light and Dark modes both rendered their semantic foreground/background tokens; the original System preference was restored afterward.
- Automated pass: 209 focused client, provider-catalog, Codex app-server and settings tests; 0 failures and 688 assertions.
- Build pass: the production Vite client build completed successfully; `git diff --check` reported no whitespace errors.
