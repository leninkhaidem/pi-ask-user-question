<p align="center">
  <img src=".github/assets/pi-ask-user-question-banner.svg" alt="pi-ask-user-question — bottom-anchored questions for pi-coding-agent" width="100%">
</p>

# pi-ask-user-question

<p align="center">
  <a href="https://github.com/leninkhaidem/pi-ask-user-question/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/leninkhaidem/pi-ask-user-question?label=release&amp;sort=semver"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="TypeScript ESM" src="https://img.shields.io/badge/TypeScript-ESM-3178c6.svg">
  <img alt="pi extension" src="https://img.shields.io/badge/pi-extension-7c3aed.svg">
</p>

A Claude Code-style `ask_user` tool for [pi-coding-agent](https://github.com/badlogic/pi-mono) with bottom-anchored prompts, markdown context, numbered choices, freeform input, and graceful headless fallback.

Use it when an agent needs one explicit user decision without breaking the terminal flow: the question replaces the editor area, keeps context readable, and returns structured selection/freeform details to the session.

> **Acknowledgement:** This extension was inspired by and builds upon the ideas from [pi-ask-user](https://github.com/edlsh/pi-ask-user) by [Enzo Lucchesi](https://github.com/edlsh). The original extension introduced the interactive `ask_user` tool pattern for pi with features like searchable split-pane selection, multi-select, and overlay mode. This project reimagines the UI with a simpler, bottom-anchored approach closer to Claude Code's style.

## Design

```text
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
│  ❯ ↳ Type my own                                             │
│                                                              │
│  Enter to type your own · Esc cancel                         │
╰──────────────────────────────────────────────────────────────╯
```

## Features

- **Bottom-anchored UI** — replaces the input editor instead of floating over the conversation.
- **Markdown context** — renders the context block with code blocks, bold text, lists, and other markdown-friendly formatting.
- **Numbered options with `❯` navigation** — arrow-key selection in a single-column list with optional descriptions.
- **Always-available freeform input** — `Type my own` opens an inline editor and is never returned as a fake option selection.
- **Multi-select mode** — optional checkbox-style selection with <kbd>Space</kbd> to toggle.
- **Recommended option marker** — set `recommended: true` on one option to show an inline recommendation.
- **Custom call/result rendering** — pi conversation output shows compact tool call and response summaries.
- **RPC/headless fallback** — degrades to basic `select()`/`input()` dialogs when the custom TUI path is unavailable.
- **Bundled skill** — includes a decision-gating skill for high-stakes and ambiguous choices.

## Quickstart

Install from GitHub:

```bash
pi install git:github.com/leninkhaidem/pi-ask-user-question
```

Or install from a local clone:

```bash
git clone https://github.com/leninkhaidem/pi-ask-user-question.git
pi install ./pi-ask-user-question
```

> **Note:** If you have `pi-ask-user` installed, uninstall it first to avoid tool name conflicts:
>
> ```bash
> pi uninstall npm:pi-ask-user
> ```

Ask a focused question with two to five options:

```json
{
  "question": "Which deploy target for the first release?",
  "context": "Staging has relaxed rate limits; production has strict SLAs.",
  "options": [
    {
      "title": "Staging first",
      "description": "Lower risk, validate before production",
      "recommended": true
    },
    {
      "title": "Direct to production",
      "description": "Faster but riskier"
    }
  ]
}
```

## Requirements

This repository is a pi package. Its runtime integration is declared in `package.json`:

- `pi.extensions`: `./index.ts`
- `pi.skills`: `./skills`
- Peer dependencies: `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, and `@sinclair/typebox`

No project-local build script is required by this repo; pi loads the TypeScript extension entrypoint from the package.

## Tool reference

### Tool name

```text
ask_user
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `question` | `string` | *required* | The question to ask the user |
| `context` | `string?` | — | Brief markdown summary shown above the options; target ≤6 lines / ≤600 chars, hard cap 16 lines / 1200 chars |
| `options` | `(string \| {title, description?, recommended?})[]?` | `[]` | Multiple-choice options; prefer 2–5 for finite choices |
| `allowMultiple` | `boolean?` | `false` | Enable multi-select mode |
| `allowComment` | `boolean?` | `false` | Reserved/accepted for optional comment collection; the custom UI currently centers on selection and freeform answers |

### Result details

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

## Behavior notes

- `Type my own` is always available as a UI action for freeform input. User-supplied `Type my own` / `Type something` options are stripped so they cannot be returned as selections.
- `context` is validated before rendering. Long explanations should be written in the visible assistant response; the `context` field should stay brief and decision-focused.
- Only one option should set `recommended: true`; the tool returns an error if more than one recommendation is provided.
- `timeout` has been removed from the public schema. Legacy callers may still pass it, but `ask_user` waits indefinitely until the user answers or cancels.
- With no options, the tool opens directly in freeform mode with a multi-line editor.

## Bundled skill

Ships `skills/ask-user/SKILL.md` — a decision-gating skill that mandates `ask_user` before high-stakes architectural decisions, irreversible changes, or ambiguous requirements. The skill enforces a structured decision handshake:

1. Gather evidence and summarize context.
2. Ask one focused question via `ask_user`.
3. Wait for explicit user choice.
4. Confirm the decision, then proceed.

## Differences from pi-ask-user

| Feature | pi-ask-user | pi-ask-user-question |
|---------|-------------|---------------------|
| Layout | Overlay (floating, centered) | Bottom-anchored (replaces editor) |
| Options | Split-pane with detail preview | Single-column with descriptions |
| Search | Fuzzy filter on options | Not included |
| Comment toggle | `Ctrl+G` toggle + editor | Reserved parameter, not yet implemented |
| Freeform input | Configurable | Always available |
| Codebase | ~1550 lines + helper file | ~730 lines, single file |

## Versioning

Releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and are documented in [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).
