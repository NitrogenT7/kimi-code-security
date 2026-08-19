---
"@moonshot-ai/kimi-code": minor
---

Add a `"*"` wildcard entry to `[subagent.routing]` as the fallback model for subagents whose profile has no dedicated routing entry. Set `"*" = "model-id"` under `[subagent.routing]` to route all unrouted subagents.
