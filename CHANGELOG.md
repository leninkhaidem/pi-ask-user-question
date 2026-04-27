# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2025-04-28

### Added

- Viewport-aware scrolling for the ask_user dialog. When content (question, context, options) exceeds the terminal height, the box now internally scrolls instead of overflowing.
- Sticky header (`╭─ ask_user ─╮`) and footer (hints + `╰─╯`) remain visible while the content area scrolls.
- Scroll indicators: `▲ N more lines above` / `▼ N more lines below` shown inside the border when content overflows.
- Auto-scroll follows the selected option as you navigate with ↑↓ arrows.
- Multiple scroll keybindings:
  - **Ctrl+↑ / Ctrl+↓** — scroll one line at a time
  - **Ctrl+U / Ctrl+D** — scroll half page (vim-style)
  - **Page Up / Page Down** — scroll half page
- Dynamic hints: footer shows `Ctrl+↑↓ scroll` when content overflows.
- In freeform mode, viewport auto-scrolls to the bottom to keep the editor visible.

### Fixed

- Terminal flickering / rapid scrolling when the ask_user dialog was taller than the terminal (especially in narrow terminals or split panes). Output is now capped to terminal height.
- Inability to see question and context in small terminal panes. Content is now scrollable with keyboard shortcuts.

## [0.1.2] - 2025-04-27

### Fixed

- Literal `\n` sequences displayed instead of actual newlines in context, question, and option text. LLMs sometimes double-escape newlines in JSON tool call arguments; the extension now normalizes these to real newlines before rendering.

## [0.1.1] - 2025-04-27

### Fixed

- Duplicate "Type my own" option when LLM includes it in options and `allowFreeform` is true (the default). The extension now strips freeform-like options ("Type my own", "Type something") from the provided list when `allowFreeform` is enabled, since the extension appends its own.

## [0.1.0] - 2025-04-27

### Added

- Initial release of `pi-ask-user-question` extension
- Bottom-anchored `ask_user` tool — replaces the editor area instead of using a floating overlay
- Claude Code-style UI with `╭╮│╰╯` box border and `❯` cursor navigation
- Markdown context rendering via pi-tui's `Markdown` component with `getMarkdownTheme()`
- Numbered options with arrow key selection and Enter to confirm
- "Type my own" freeform option with inline editor (Esc to go back)
- Multi-select mode with `[✓]`/`[ ]` checkboxes and Space to toggle
- Option descriptions rendered on indented lines below each option
- Custom `renderCall` and `renderResult` for styled conversation display
- Expanded view showing question, context, and option selections with `●`/`○` markers
- RPC/headless fallback via `select()`/`input()` dialogs
- Non-interactive mode fallback with descriptive error message
- Abort signal and timeout support for auto-dismiss
- Streaming progress update ("Waiting for user input...") during tool execution
- Bundled `ask-user` decision-gating skill with structured handshake protocol
- Skill reference spec at `skills/ask-user/references/ask-user-skill-extension-spec.md`
- `promptSnippet` and `promptGuidelines` for system prompt integration

[0.1.3]: https://github.com/leninkhaidem/pi-ask-user-question/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/leninkhaidem/pi-ask-user-question/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/leninkhaidem/pi-ask-user-question/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/leninkhaidem/pi-ask-user-question/releases/tag/v0.1.0
