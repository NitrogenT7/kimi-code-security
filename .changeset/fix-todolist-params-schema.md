---
"@moonshot-ai/agent-core": patch
"@moonshot-ai/kimi-code": patch
---

Fix the TodoList tool advertising an item-less parameter schema, which let providers misguide the model into submitting plain strings that were then rejected.
