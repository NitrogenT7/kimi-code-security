Set the status of the current goal, or rewrite a lightweight goal into the four-element commander's-intent format. This is how you resume, end, yield, or structure an autonomous goal.

## Status transitions

- `active` — resume a paused or blocked goal when the user explicitly asks you to work on that goal.
- `complete` — the objective is satisfied and any stated validation has passed. The goal ends and a completion summary is recorded.
- `blocked` — an external condition or required user input prevents progress, or the objective cannot be completed as stated. The goal stops but can be resumed later.
- `paused` — set the goal aside for now (e.g. to hand control back to the user). It can be resumed later.

## Rewriting a lightweight goal (first turn only)

When the user created the goal with a short `/goal <text>` command, you may rewrite it into a structured four-element format during the first turn (`turnsUsed <= 1`):

```
[Purpose]
<Key Tasks>
[End State]
[Constraints]
```

- **Purpose**: why this goal matters — the direction.
- **Key Tasks**: what must be accomplished, without prescribing exact steps.
- **End State**: the observable, verifiable conditions that mean success.
- **Constraints**: what must not be done or sacrificed (red lines, hard limits).

When rewriting, also set `purpose` to the Purpose text and `completionCriterion` to the End State text. Do not change the user's original intent; only structure it. After the first turn, content rewriting is rejected.

If the goal is active and you do not call this, the goal keeps running: after your turn ends you will be prompted to continue. Call `complete` only when all required work is done, any stated validation has passed, and there is no useful next action. Do not call `complete` after only producing a plan, summary, first pass, or partial result. If you call `blocked`, you will be prompted to explain the blocker in your next message. This tool only records the status.
