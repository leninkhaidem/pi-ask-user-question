---
name: ask-user
description: >
  Use before high-stakes or ambiguous decisions, especially when
  calling ask_user. Do not use for formatting-only edits or
  already-decided choices.
metadata:
  short-description: Decision gate for ambiguity and high-stakes choices
---

# Ask User Decision Gate

Use this skill to get explicit user alignment before consequential choices.
It is about decision control, not general conversation.

## Always
- Gather evidence before asking; do not ask blind.
- Trigger on architecture/schema/API/security/destructive or preference-dependent choices.
- Put the explanation in visible chat text first; keep `context` short.
- For finite choices, use 2–5 options when possible.
- If recommending one choice, set `recommended: true` on at most one option.
- Ask one focused question per `ask_user` call.

## Load if needed
- Need fuller trigger matrix, retry examples, or payload samples → `references/ask-user-skill-extension-spec.md`

## Do
1. Classify the boundary as `clear`, `ambiguous`, `high_stakes`, or `both`.
2. Read enough code/docs/logs to understand the decision.
3. Summarize the decision in chat text, then call `ask_user`.
4. Build the payload with a brief `context`, 2–5 options when practical, and no more than one `recommended: true` flag.
5. If the answer is unclear or cancelled, make one narrower retry.
6. If still unresolved after the retry, stop instead of looping.

## Stop if
- The exact trade-off is still unclear after evidence gathering.
- The decision would require a long context dump.
- More than one option would be marked recommended.
- The boundary remains ambiguous after the allowed retry.

## Output
Return a short decision note with: boundary, evidence, question asked, option set, retry status, and next step.
