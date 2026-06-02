---
"@moonshot-ai/agent-core": minor
"@moonshot-ai/kimi-code-sdk": minor
"@moonshot-ai/kimi-code": minor
---

Add experimental goal mode for longer tasks that need more than one turn. Turn it on with `KIMI_CODE_EXPERIMENTAL_GOAL_COMMAND=1` before you start Kimi.

Use `/goal <objective>` in the TUI when you want Kimi to keep working on one task across turns. For example:

```text
/goal Fix the failing checkout test
```

Kimi shows the goal in the TUI and keeps progress visible while it works. Use `/goal status`, `/goal pause`, `/goal resume`, `/goal cancel`, and `/goal replace <objective>` to manage the goal. This feature is still experimental. Try it and tell us what would make it more useful.
