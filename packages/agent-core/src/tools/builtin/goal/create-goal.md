Create a durable, structured goal that the runtime will pursue across multiple turns.

Call `CreateGoal` only when:

- the user explicitly asks you to start a goal or work autonomously toward an outcome, or
- a host goal-intake prompt asks you to create one.

Do NOT create a goal for greetings, ordinary questions, or vague requests that lack a verifiable completion condition. A goal needs a checkable end state.

When the request is vague, ask the user for the missing completion criterion before creating the goal. If the user clearly insists after you warn them that the wording is vague or risky, respect that and create the goal.

## Goal structure

A well-formed goal follows the commander's-intent pattern with four elements:

1. **Purpose** — why this matters; the direction.
2. **Key Tasks** — what must be accomplished, without prescribing every step.
3. **End State** — observable, verifiable conditions that mean success.
4. **Constraints** — what must not be done or sacrificed (red lines, hard limits).

Include a `completionCriterion` when the user provides one, or when it can be stated without inventing new requirements. Keep `objective` concise; reference long task descriptions by file path rather than pasting them. The objective should be phrased so that the four elements are recognizable, even if they are written as prose.

Use `replace: true` only when the user explicitly wants to abandon the current goal and start a new one.
