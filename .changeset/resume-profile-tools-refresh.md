---
"@moonshot-ai/kimi-code": patch
---

Fix resumed sessions keeping the active tool list frozen at session-creation time, so tools added by an upgrade (such as Notepad) become available without starting a new session.
