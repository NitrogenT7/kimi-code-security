---
"@moonshot-ai/kimi-code": minor
---

Goal completion now checks the TodoList for open questions before accepting. When the model marks a goal complete while pending or investigating questions remain, completion is rejected with the specific list (up to 5 retries).
