---
"@moonshot-ai/kimi-code": minor
---

Add the experimental `mid-turn-model-switch` flag: when enabled, a `/model` selection made while a turn is streaming applies from the next LLM request instead of waiting for the turn to finish. Enable via `KIMI_CODE_EXPERIMENTAL_MID_TURN_MODEL_SWITCH=1` or the `[experimental]` config section. Note: mid-turn switches invalidate the context cache.
