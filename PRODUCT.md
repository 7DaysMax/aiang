# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers using a local or desktop coding agent to work inside real projects, inspect agent activity, and keep control over model, permissions, tools, files, Git, and terminals.

## Product Purpose

Youmi is a coding-agent workspace. It lets a developer open a project, converse with an agent, observe reasoning and tool activity, review file changes, answer approval questions, and continue work without leaving the workspace.

## Positioning

One project UI can run multiple agent engines—including Youmi, Codex, Claude, Cursor, DeepSeek, Reasonix, and Pi—while keeping a shared transcript, project context, Git workflow, and tool visibility.

## Operating Context

The product is used during active software development. Primary surfaces are the project/chat sidebar, transcript, composer, model and reasoning controls, tool and task output, file/diff review, terminal, browser, settings, and provider authentication.

## Capabilities and Constraints

- Preserve real provider, model, reasoning-effort, permission, attachment, skill, collaboration, Git, terminal, and browser behavior.
- Streaming output must represent the provider's real incremental output; the UI must not replay accumulated text as a second fake stream.
- Agent activity must remain compact, inspectable, and collapsible.
- The interface must work at desktop and narrow mobile-web widths and support the existing light and dark themes.
- Demo data from third-party UI components must never replace real project or agent data.

## Brand Commitments

- Product name: Youmi / Youmi Aiagent.
- Beautiful UI is the binding component and visual-system source for the agent interface.
- All Beautiful UI registry components must be adapted to reachable product scenarios; parallel hand-built visual duplicates are not allowed.

## Evidence on Hand

- Product and engine documentation: `README.md`.
- Existing working application and business behavior: `src/client`, `src/server`, and `src/shared`.
- Beautiful UI registry components: `src/components/primitives` and `src/components/atoms`.
- Extracted Beautiful UI design map: `beautifului.dev.md` and `beautifului.dev.json`.
- No fabricated customer claims, performance claims, or testimonials are available.

## Product Principles

- Show what the agent is doing without making the transcript longer than the work itself.
- Keep real developer controls visible and predictable.
- Prefer one shared visual language over similar-looking duplicate components.
- Preserve user control for approvals, permissions, model choice, and code changes.
