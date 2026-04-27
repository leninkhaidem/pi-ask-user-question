# pi-ask-user-question

A clean, Claude Code-style `ask_user` tool for [pi-coding-agent](https://github.com/badlogic/pi-mono).

**Bottom-anchored** (replaces the editor area — no floating overlay), single-column layout with markdown context rendering and `❯` cursor navigation.

> **Acknowledgement:** This extension was inspired by and builds upon the ideas from [pi-ask-user](https://github.com/edlsh/pi-ask-user) by [Enzo Lucchesi](https://github.com/edlsh). The original extension introduced the interactive `ask_user` tool pattern for pi with features like searchable split-pane selection, multi-select, and overlay mode. This project reimagines the UI with a simpler, bottom-anchored approach closer to Claude Code's style.

## Design

```
╭─ ask_user ──────────────────────────────────────────────────╮
│                                                              │
│  Which caching strategy should we use?                       │
│                                                              │
│  Redis is fastest but adds infra complexity; in-memory       │
│  cache is simpler but not shared across instances.           │
│                                                              │
│  ────────────────────────────────────────────────────────── │
│    1. In-memory cache                                        │
│       Simpler rollout, weaker horizontal consistency         │
│    2. Redis cache                                            │
│       Better consistency and scalability, more ops overhead   │
│  ❯ 3. Type my own                                            │
│                                                              │
│  ↑↓ to select · Enter to confirm · Esc to cancel             │
╰──────────────────────────────────────────────────────────────╯
```

## Features

- **Bottom-anchored** — replaces the input editor, no floating overlay
- **Markdown context** — renders the context block with full markdown support (code blocks, bold, lists, etc.)
- **`❯` cursor navigation** — clean numbered options with arrow key selection
- **Freeform input** — "Type my own" option opens an inline editor
- **Multi-select** — optional checkbox-style selection with `Space` to toggle
- **Custom rendering** — styled tool call and result display in the conversation
- **RPC/headless fallback** — degrades gracefully to `select()`/`input()` dialogs
- **Timeout support** — auto-dismiss after N milliseconds
- **Bundled skill** — decision-gating skill for high-stakes and ambiguous choices

## Install

```bash
pi install git:github.com/leninkhaidem/pi-ask-user-question
```

Or install from a local clone:

```bash
git clone https://github.com/leninkhaidem/pi-ask-user-question.git
pi install ./pi-ask-user-question
```

> **Note:** If you have `pi-ask-user` installed, uninstall it first to avoid tool name conflicts:
> ```bash
> pi uninstall npm:pi-ask-user
> ```

## Tool name

```
ask_user
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `question` | `string` | *required* | The question to ask the user |
| `context` | `string?` | — | Relevant context (rendered as markdown) |
| `options` | `(string \| {title, description?})[]?` | `[]` | Multiple-choice options |
| `allowMultiple` | `boolean?` | `false` | Enable multi-select mode |
| `allowFreeform` | `boolean?` | `true` | Add a "Type my own" freeform option |
| `allowComment` | `boolean?` | `false` | Reserved for optional comment collection |
| `timeout` | `number?` | — | Auto-dismiss after N ms, returns null |

## Example usage

```json
{
  "question": "Which deploy target for the first release?",
  "context": "We have staging and production environments. Staging has relaxed rate limits, production has strict SLAs.",
  "options": [
    { "title": "Staging first", "description": "Lower risk, validate before production" },
    { "title": "Direct to production", "description": "Faster but riskier" }
  ],
  "allowFreeform": true
}
```

## Result details

All tool results include a structured `details` object for rendering and session state reconstruction:

```typescript
type AskResponse =
  | { kind: "selection"; selections: string[]; comment?: string }
  | { kind: "freeform"; text: string };

interface AskToolDetails {
  question: string;
  context?: string;
  options: QuestionOption[];
  response: AskResponse | null;
  cancelled: boolean;
}
```

## Bundled skill

Ships `skills/ask-user/SKILL.md` — a decision-gating skill that mandates `ask_user` before high-stakes architectural decisions, irreversible changes, or ambiguous requirements. The skill enforces a structured "decision handshake" flow:

1. Gather evidence and summarize context
2. Ask one focused question via `ask_user`
3. Wait for explicit user choice
4. Confirm the decision, then proceed

## Differences from pi-ask-user

| Feature | pi-ask-user | pi-ask-user-question |
|---------|-------------|---------------------|
| Layout | Overlay (floating, centered) | Bottom-anchored (replaces editor) |
| Options | Split-pane with detail preview | Single-column with descriptions |
| Search | Fuzzy filter on options | Not included |
| Comment toggle | `Ctrl+G` toggle + editor | Reserved parameter, not yet implemented |
| Codebase | ~1550 lines + helper file | ~730 lines, single file |

## License

MIT
