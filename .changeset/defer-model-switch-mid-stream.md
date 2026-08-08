---
"@moonshot-ai/kimi-code": patch
---

Defer `/model` switches confirmed while streaming instead of rejecting them: the new model (and thinking effort) is applied at the next turn boundary, before any queued message is dispatched, so the next message starts on the new model. The latest selection wins when several are made during one stream.
