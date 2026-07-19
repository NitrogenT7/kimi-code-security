Set the status of the current goal, or rewrite a lightweight goal into the four-element commander's-intent format. This is how you resume, complete, block, or structure an autonomous goal.

## Status transitions

- `active` — resume a paused or blocked goal when the user explicitly asks you to work on that goal.
- `complete` — the objective is satisfied and any stated validation has passed. The goal ends and a completion summary is recorded. Before using this, verify the current state against the actual objective and every explicit requirement. Treat weak or indirect evidence as not complete. Do not use `complete` merely because a budget is nearly exhausted or you want to stop.
- `blocked` — a genuine impasse prevents useful progress: an external condition, required user input, missing credentials or permissions, a persistent technical failure, or an impossible, unsafe, or contradictory objective. For non-terminal blockers, do not use `blocked` the first time you hit the blocker. The same blocking condition must repeat for at least 3 consecutive goal turns before you call `blocked`, counting the original/user-triggered turn and automatic continuations. If a previously blocked goal is resumed, treat the resumed run as a fresh blocked audit. If the objective itself is impossible, unsafe, or contradictory, call `blocked` in the same turn instead of running more goal turns. Do not use `blocked` because the work is large, hard, slow, uncertain, incomplete, still needs validation, would benefit from clarification, or needs more goal turns. Once the 3-turn threshold is met and you cannot make meaningful progress without user input or an external-state change, call `blocked` instead of leaving the goal active.

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

Most active goal turns should not call this tool. If you complete one useful slice of work and material work remains, end the turn normally without calling UpdateGoal; the runtime will prompt you to continue in the next goal turn. Call `complete` only when all required work is done, any stated validation has passed, and there is no useful next action. Do not call `complete` after only producing a plan, summary, first pass, or partial result. Call `blocked` only after the blocked audit threshold is met. If you call `blocked`, you will be prompted to explain the blocker in your next message. Setting the status is the machine-readable signal; the completion summary or blocker explanation is yours to write in the following message.
