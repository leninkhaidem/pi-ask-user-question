/**
 * pi-ask-user-question — Claude Code-style ask_user tool
 *
 * Bottom-anchored (replaces editor), single-column layout:
 *   ╭─ ask_user ──────────────────────────────────────────────╮
 *   │                                                         │
 *   │  **Context rendered as markdown**                       │
 *   │                                                         │
 *   │  ───────────────────────────────────────────────────── │
 *   │    1. Option one                                        │
 *   │    2. Option two                                        │
 *   │  ❯ 3. Type my own                                      │
 *   │                                                         │
 *   │  ↑↓ to select · Enter to confirm · Esc to cancel       │
 *   ╰─────────────────────────────────────────────────────────╯
 */

import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
   type Component,
   Editor,
   type EditorTheme,
   Key,
   type KeybindingsManager,
   Markdown,
   type MarkdownTheme,
   matchesKey,
   Text,
   type TUI,
   truncateToWidth,
   wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

// ─── Types ───────────────────────────────────────────────────────────────────

interface QuestionOption {
   title: string;
   description?: string;
}

type OptionInput = string | QuestionOption;

interface AskParams {
   question: string;
   context?: string;
   options?: OptionInput[];
   allowMultiple?: boolean;
   allowFreeform?: boolean;
   allowComment?: boolean;
   timeout?: number;
}

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeOptions(raw: OptionInput[]): QuestionOption[] {
   return raw
      .map((o) => (typeof o === "string" ? { title: o } : o))
      .filter((o): o is QuestionOption => !!o?.title);
}

function formatResponseSummary(r: AskResponse): string {
   if (r.kind === "freeform") return r.text;
   const sel = r.selections.join(", ");
   return r.comment ? `${sel} — ${r.comment}` : sel;
}

function formatOptionsForPlainText(options: QuestionOption[]): string {
   return options
      .map((o, i) => {
         const desc = o.description ? ` — ${o.description}` : "";
         return `${i + 1}. ${o.title}${desc}`;
      })
      .join("\n");
}

// ─── Box border components ───────────────────────────────────────────────────

const BORDER_LEFT = "│ ";
const BORDER_RIGHT = " │";
const BORDER_OVERHEAD = BORDER_LEFT.length + BORDER_RIGHT.length;

function renderBoxTop(width: number, title: string, borderColor: (s: string) => string, titleColor: (s: string) => string): string {
   const inner = Math.max(0, width - 2);
   if (inner < title.length + 4) return borderColor(`╭${"─".repeat(inner)}╮`);
   const label = ` ${title} `;
   const remaining = inner - 1 - label.length;
   return borderColor("╭─") + titleColor(label) + borderColor("─".repeat(Math.max(0, remaining)) + "╮");
}

function renderBoxBottom(width: number, borderColor: (s: string) => string): string {
   const inner = Math.max(0, width - 2);
   return borderColor(`╰${"─".repeat(inner)}╯`);
}

function wrapInBorder(line: string, innerWidth: number, borderColor: (s: string) => string): string {
   const padded = truncateToWidth(line, innerWidth, "", true);
   return `${borderColor(BORDER_LEFT)}${padded}${borderColor(BORDER_RIGHT)}`;
}

// ─── AskComponent ────────────────────────────────────────────────────────────

type Mode = "select" | "freeform";

class AskComponent implements Component {
   private question: string;
   private context?: string;
   private options: QuestionOption[];
   private allowFreeform: boolean;
   private allowMultiple: boolean;
   private allowComment: boolean;
   private tui: TUI;
   private theme: Theme;
   private keybindings: KeybindingsManager;
   private done: (result: AskResponse | null) => void;

   private mode: Mode = "select";
   private selectedIndex = 0;
   private checked = new Set<number>();
   private editor: Editor;
   private editorDraft = "";

   private cachedWidth?: number;
   private cachedLines?: string[];

   // Focusable support — propagate to Editor for IME cursor positioning
   private _focused = false;
   get focused(): boolean { return this._focused; }
   set focused(value: boolean) {
      this._focused = value;
      if (this.mode === "freeform") (this.editor as any).focused = value;
   }

   constructor(
      question: string,
      context: string | undefined,
      options: QuestionOption[],
      allowFreeform: boolean,
      allowMultiple: boolean,
      allowComment: boolean,
      tui: TUI,
      theme: Theme,
      keybindings: KeybindingsManager,
      done: (result: AskResponse | null) => void,
   ) {
      this.question = question;
      this.context = context;
      this.options = options;
      this.allowFreeform = allowFreeform;
      this.allowMultiple = allowMultiple;
      this.allowComment = allowComment;
      this.tui = tui;
      this.theme = theme;
      this.keybindings = keybindings;
      this.done = done;

      const editorTheme: EditorTheme = {
         borderColor: (s: string) => theme.fg("accent", s),
         selectList: {
            selectedPrefix: (t: string) => theme.fg("accent", t),
            selectedText: (t: string) => theme.fg("accent", t),
            description: (t: string) => theme.fg("muted", t),
            scrollInfo: (t: string) => theme.fg("dim", t),
            noMatch: (t: string) => theme.fg("warning", t),
         },
      };
      this.editor = new Editor(tui, editorTheme);
      this.editor.onSubmit = (text: string) => {
         const trimmed = text.trim();
         if (trimmed) {
            this.done({ kind: "freeform", text: trimmed });
         } else {
            // Empty submit → go back to select mode
            this.switchToSelect();
         }
      };
   }

   // ── Item count helpers ──

   private get totalItems(): number {
      return this.options.length + (this.allowFreeform ? 1 : 0);
   }

   private isFreeformRow(index: number): boolean {
      return this.allowFreeform && index === this.options.length;
   }

   // ── Mode switching ──

   private switchToFreeform(): void {
      this.mode = "freeform";
      this.editor.setText(this.editorDraft);
      (this.editor as any).focused = this._focused;
      this.invalidate();
      this.tui.requestRender();
   }

   private switchToSelect(): void {
      // Save draft
      const getText = (this.editor as any).getText;
      if (typeof getText === "function") {
         this.editorDraft = String(getText.call(this.editor) ?? "");
      }
      this.mode = "select";
      this.invalidate();
      this.tui.requestRender();
   }

   // ── Input handling ──

   handleInput(data: string): void {
      if (this.mode === "freeform") {
         this.handleFreeformInput(data);
         return;
      }
      this.handleSelectInput(data);
   }

   private handleSelectInput(data: string): void {
      // Cancel
      if (matchesKey(data, Key.escape) || this.keybindings.matches(data, "tui.select.cancel")) {
         this.done(null);
         return;
      }

      const count = this.totalItems;
      if (count === 0) {
         this.done(null);
         return;
      }

      // Navigate
      if (matchesKey(data, Key.up) || matchesKey(data, Key.shift("tab"))) {
         this.selectedIndex = this.selectedIndex === 0 ? count - 1 : this.selectedIndex - 1;
         this.invalidate();
         this.tui.requestRender();
         return;
      }
      if (matchesKey(data, Key.down) || matchesKey(data, Key.tab)) {
         this.selectedIndex = this.selectedIndex === count - 1 ? 0 : this.selectedIndex + 1;
         this.invalidate();
         this.tui.requestRender();
         return;
      }

      // Multi-select: toggle with space
      if (this.allowMultiple && matchesKey(data, Key.space)) {
         if (!this.isFreeformRow(this.selectedIndex)) {
            if (this.checked.has(this.selectedIndex)) this.checked.delete(this.selectedIndex);
            else this.checked.add(this.selectedIndex);
            this.invalidate();
            this.tui.requestRender();
         }
         return;
      }

      // Confirm
      if (matchesKey(data, Key.enter) || this.keybindings.matches(data, "tui.select.confirm")) {
         if (this.isFreeformRow(this.selectedIndex)) {
            this.switchToFreeform();
            return;
         }

         if (this.allowMultiple) {
            // Submit checked items, or the currently highlighted one
            const selections = Array.from(this.checked)
               .sort((a, b) => a - b)
               .map((i) => this.options[i]?.title)
               .filter((t): t is string => !!t);
            if (selections.length === 0) {
               const fallback = this.options[this.selectedIndex]?.title;
               if (fallback) selections.push(fallback);
            }
            if (selections.length > 0) {
               this.done({ kind: "selection", selections });
            }
         } else {
            const selected = this.options[this.selectedIndex]?.title;
            if (selected) {
               this.done({ kind: "selection", selections: [selected] });
            }
         }
         return;
      }
   }

   private handleFreeformInput(data: string): void {
      if (matchesKey(data, Key.escape)) {
         this.switchToSelect();
         return;
      }
      this.editor.handleInput(data);
      this.invalidate();
      this.tui.requestRender();
   }

   // ── Rendering ──

   invalidate(): void {
      this.cachedWidth = undefined;
      this.cachedLines = undefined;
   }

   render(width: number): string[] {
      if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

      const theme = this.theme;
      const borderColor = (s: string) => theme.fg("accent", s);
      const titleColor = (s: string) => theme.fg("dim", theme.bold(s));
      const innerWidth = Math.max(1, width - BORDER_OVERHEAD);
      const lines: string[] = [];

      // ── Box top ──
      lines.push(renderBoxTop(width, "ask_user", borderColor, titleColor));

      // ── Question ──
      lines.push(wrapInBorder("", innerWidth, borderColor));
      for (const wl of wrapTextWithAnsi(theme.bold(this.question), Math.max(10, innerWidth - 2))) {
         lines.push(wrapInBorder(` ${wl}`, innerWidth, borderColor));
      }

      // ── Context (markdown) ──
      if (this.context) {
         lines.push(wrapInBorder("", innerWidth, borderColor));

         let mdTheme: MarkdownTheme | undefined;
         try { mdTheme = getMarkdownTheme(); } catch { /* noop */ }

         let contextLines: string[];
         if (mdTheme) {
            const md = new Markdown(this.context, 0, 0, mdTheme);
            contextLines = md.render(Math.max(10, innerWidth - 2));
         } else {
            contextLines = wrapTextWithAnsi(this.context, Math.max(10, innerWidth - 2));
         }

         for (const cl of contextLines) {
            lines.push(wrapInBorder(` ${cl}`, innerWidth, borderColor));
         }
      }

      // ── Separator ──
      lines.push(wrapInBorder(
         " " + theme.fg("dim", "─".repeat(Math.max(0, innerWidth - 2))),
         innerWidth,
         borderColor,
      ));

      // ── Options ──
      const count = this.totalItems;
      // Clamp selected index
      if (count > 0) {
         this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, count - 1));
      }

      for (let i = 0; i < this.options.length; i++) {
         const opt = this.options[i]!;
         const isSelected = i === this.selectedIndex;
         const pointer = isSelected ? theme.fg("accent", "❯") : " ";
         const num = `${i + 1}.`;

         if (this.allowMultiple) {
            const checkbox = this.checked.has(i) ? theme.fg("success", "[✓]") : theme.fg("dim", "[ ]");
            const titleText = isSelected
               ? theme.fg("accent", theme.bold(opt.title))
               : theme.fg("text", opt.title);
            const line = `${pointer} ${theme.fg("dim", num)} ${checkbox} ${titleText}`;
            lines.push(wrapInBorder(line, innerWidth, borderColor));
         } else {
            const titleText = isSelected
               ? theme.fg("accent", theme.bold(opt.title))
               : theme.fg("text", opt.title);
            const line = `${pointer} ${theme.fg("dim", num)} ${titleText}`;
            lines.push(wrapInBorder(line, innerWidth, borderColor));
         }

         // Description on next line(s)
         if (opt.description) {
            const indent = "      ";
            for (const dl of wrapTextWithAnsi(opt.description, Math.max(10, innerWidth - indent.length - 1))) {
               lines.push(wrapInBorder(`${indent}${theme.fg("muted", dl)}`, innerWidth, borderColor));
            }
         }
      }

      // ── Freeform option ──
      if (this.allowFreeform) {
         const freeIdx = this.options.length;
         const isSelected = freeIdx === this.selectedIndex;
         const pointer = isSelected ? theme.fg("accent", "❯") : " ";
         const num = `${freeIdx + 1}.`;
         const label = isSelected
            ? theme.fg("accent", theme.bold("Type my own"))
            : theme.fg("text", "Type my own");
         lines.push(wrapInBorder(`${pointer} ${theme.fg("dim", num)} ${label}`, innerWidth, borderColor));
      }

      // ── Freeform editor (when in freeform mode) ──
      if (this.mode === "freeform") {
         lines.push(wrapInBorder("", innerWidth, borderColor));
         lines.push(wrapInBorder(` ${theme.fg("accent", "Your response:")}`, innerWidth, borderColor));
         const editorLines = this.editor.render(Math.max(10, innerWidth - 2));
         for (const el of editorLines) {
            lines.push(wrapInBorder(` ${el}`, innerWidth, borderColor));
         }
      }

      // ── Hints ──
      lines.push(wrapInBorder("", innerWidth, borderColor));
      const hints = this.mode === "freeform"
         ? theme.fg("dim", "Enter to submit · Esc to go back")
         : this.allowMultiple
            ? theme.fg("dim", "↑↓ to select · Space to toggle · Enter to confirm · Esc to cancel")
            : theme.fg("dim", "↑↓ to select · Enter to confirm · Esc to cancel");
      lines.push(wrapInBorder(` ${hints}`, innerWidth, borderColor));

      // ── Box bottom ──
      lines.push(renderBoxBottom(width, borderColor));

      this.cachedWidth = width;
      this.cachedLines = lines;
      return lines;
   }
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
   pi.registerTool({
      name: "ask_user",
      label: "Ask User",
      description:
         "Ask the user a question with optional multiple-choice answers. Use this to gather information interactively. Ask exactly one focused question per call. Before calling, gather context with tools (read/web/ref) and pass a short summary via the context field.",
      promptSnippet:
         "Ask the user one focused question with optional multiple-choice answers to gather information interactively",
      promptGuidelines: [
         "Before calling ask_user, gather context with tools (read/web/ref) and pass a short summary via the context field.",
         "Use ask_user when the user's intent is ambiguous, when a decision requires explicit user input, or when multiple valid options exist.",
         "Ask exactly one focused question per ask_user call.",
         "Do not combine multiple numbered, multipart, or unrelated questions into one ask_user prompt.",
      ],
      parameters: Type.Object({
         question: Type.String({ description: "The question to ask the user" }),
         context: Type.Optional(
            Type.String({ description: "Relevant context to show before the question (summary of findings)" }),
         ),
         options: Type.Optional(
            Type.Array(
               Type.Union([
                  Type.String({ description: "Short title for this option" }),
                  Type.Object({
                     title: Type.String({ description: "Short title for this option" }),
                     description: Type.Optional(
                        Type.String({ description: "Longer description explaining this option" }),
                     ),
                  }),
               ]),
               { description: "List of options for the user to choose from" },
            ),
         ),
         allowMultiple: Type.Optional(
            Type.Boolean({ description: "Allow selecting multiple options. Default: false" }),
         ),
         allowFreeform: Type.Optional(
            Type.Boolean({ description: "Add a freeform text option. Default: true" }),
         ),
         allowComment: Type.Optional(
            Type.Boolean({
               description: "Collect an optional comment after selecting one or more options. Default: false",
            }),
         ),
         timeout: Type.Optional(
            Type.Number({
               description: "Auto-dismiss after N milliseconds. Returns null (cancelled) when expired.",
            }),
         ),
      }),

      async execute(_toolCallId, params, signal, onUpdate, ctx) {
         if (signal?.aborted) {
            return {
               content: [{ type: "text", text: "Cancelled" }],
               details: {
                  question: params.question,
                  options: [],
                  response: null,
                  cancelled: true,
               } as AskToolDetails,
            };
         }

         const {
            question,
            context,
            options: rawOptions = [],
            allowMultiple = false,
            allowFreeform = true,
            allowComment = false,
            timeout,
         } = params as AskParams;
         const options = normalizeOptions(rawOptions);
         const normalizedContext = context?.trim() || undefined;

         // ── Non-interactive fallback ──
         if (!ctx.hasUI || !ctx.ui) {
            const optionText = options.length > 0 ? `\n\nOptions:\n${formatOptionsForPlainText(options)}` : "";
            const freeformHint = allowFreeform ? "\n\nYou can also answer freely." : "";
            const contextText = normalizedContext ? `\n\nContext:\n${normalizedContext}` : "";
            return {
               content: [
                  {
                     type: "text",
                     text: `Ask requires interactive mode. Please answer:\n\n${question}${contextText}${optionText}${freeformHint}`,
                  },
               ],
               isError: true,
               details: {
                  question,
                  context: normalizedContext,
                  options,
                  response: null,
                  cancelled: true,
               } as AskToolDetails,
            };
         }

         // ── No options → direct text input ──
         if (options.length === 0) {
            const prompt = normalizedContext ? `${question}\n\nContext:\n${normalizedContext}` : question;
            const answer = await ctx.ui.input(prompt, "Type your answer...", timeout ? { timeout } : undefined);
            const trimmed = answer?.trim();
            if (!trimmed) {
               return {
                  content: [{ type: "text", text: "User cancelled the question" }],
                  details: {
                     question,
                     context: normalizedContext,
                     options,
                     response: null,
                     cancelled: true,
                  } as AskToolDetails,
               };
            }
            const response: AskResponse = { kind: "freeform", text: trimmed };
            return {
               content: [{ type: "text", text: `User answered: ${trimmed}` }],
               details: {
                  question,
                  context: normalizedContext,
                  options,
                  response,
                  cancelled: false,
               } as AskToolDetails,
            };
         }

         // ── Streaming progress ──
         onUpdate?.({
            content: [{ type: "text", text: "Waiting for user input..." }],
            details: { question, context: normalizedContext, options, response: null, cancelled: false },
         });

         // ── Custom UI (replaces editor — bottom-anchored) ──
         let result: AskResponse | null;
         try {
            const customResult = await ctx.ui.custom<AskResponse | null>(
               (tui, theme, keybindings, done) => {
                  // Wire up abort signal
                  if (signal) {
                     signal.addEventListener("abort", () => done(null), { once: true });
                  }
                  // Wire up timeout
                  if (timeout && timeout > 0) {
                     setTimeout(() => done(null), timeout);
                  }

                  return new AskComponent(
                     question,
                     normalizedContext,
                     options,
                     allowFreeform,
                     allowMultiple,
                     allowComment,
                     tui,
                     theme,
                     keybindings,
                     done,
                  );
               },
               // No overlay — replaces editor, sits at bottom
            );

            if (customResult !== undefined) {
               result = customResult;
            } else {
               // RPC/headless fallback — use basic dialog
               const selectOptions = options.map((o) => o.title);
               if (allowFreeform) selectOptions.push("Type my own");
               const prompt = normalizedContext ? `${question}\n\nContext:\n${normalizedContext}` : question;
               const selected = (await ctx.ui.select(prompt, selectOptions, timeout ? { timeout } : undefined)) as
                  | string
                  | undefined;
               if (!selected) {
                  result = null;
               } else if (selected === "Type my own") {
                  const answer = await ctx.ui.input(prompt, "Type your answer...", timeout ? { timeout } : undefined);
                  const trimmed = answer?.trim();
                  result = trimmed ? { kind: "freeform", text: trimmed } : null;
               } else {
                  result = { kind: "selection", selections: [selected] };
               }
            }
         } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
               content: [{ type: "text", text: `Ask tool failed: ${message}` }],
               isError: true,
               details: { error: message },
            };
         }

         // ── Build result ──
         if (!result) {
            return {
               content: [{ type: "text", text: "User cancelled the question" }],
               details: {
                  question,
                  context: normalizedContext,
                  options,
                  response: null,
                  cancelled: true,
               } as AskToolDetails,
            };
         }

         return {
            content: [{ type: "text", text: `User answered: ${formatResponseSummary(result)}` }],
            details: {
               question,
               context: normalizedContext,
               options,
               response: result,
               cancelled: false,
            } as AskToolDetails,
         };
      },

      // ── Custom rendering ──

      renderCall(args, theme) {
         const q = (args.question as string) || "";
         const rawOpts = Array.isArray(args.options) ? args.options : [];
         let text = theme.fg("toolTitle", theme.bold("ask_user "));
         text += theme.fg("muted", q);
         if (rawOpts.length > 0) {
            const labels = rawOpts.map((o: unknown) =>
               typeof o === "string" ? o : (o as QuestionOption)?.title ?? "",
            );
            text += "\n" + theme.fg("dim", `  ${rawOpts.length} option(s): ${labels.join(", ")}`);
         }
         if (args.allowMultiple) text += theme.fg("dim", " [multi-select]");
         return new Text(text, 0, 0);
      },

      renderResult(result, options, theme) {
         const details = result.details as (AskToolDetails & { error?: string }) | undefined;

         if (details?.error) {
            return new Text(theme.fg("error", `✗ ${details.error}`), 0, 0);
         }

         if (options.isPartial) {
            const waitingText =
               result.content
                  ?.filter((p: { type?: string }) => p?.type === "text")
                  .map((p: { text?: string }) => p.text ?? "")
                  .join("\n")
                  .trim() || "Waiting for user input...";
            return new Text(theme.fg("muted", waitingText), 0, 0);
         }

         if (!details || details.cancelled || !details.response) {
            return new Text(theme.fg("warning", "Cancelled"), 0, 0);
         }

         const response = details.response;
         let text = theme.fg("success", "✓ ");
         if (response.kind === "freeform") {
            text += theme.fg("muted", "(wrote) ");
         }
         text += theme.fg("accent", formatResponseSummary(response));

         if (options.expanded) {
            text += "\n" + theme.fg("dim", `Q: ${details.question}`);
            if (details.context) {
               text += "\n" + theme.fg("dim", details.context);
            }
            if (response.kind === "selection" && details.options.length > 0) {
               const selectedSet = new Set(response.selections);
               text += "\n" + theme.fg("dim", "Options:");
               for (const opt of details.options) {
                  const desc = opt.description ? ` — ${opt.description}` : "";
                  const marker = selectedSet.has(opt.title) ? theme.fg("success", "●") : theme.fg("dim", "○");
                  text += `\n  ${marker} ${theme.fg("dim", opt.title)}${theme.fg("dim", desc)}`;
               }
               if (response.comment) {
                  text += `\n${theme.fg("dim", "Comment:")} ${theme.fg("dim", response.comment)}`;
               }
            }
         }

         return new Text(text, 0, 0);
      },
   });
}
