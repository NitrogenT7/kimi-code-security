---
"@moonshot-ai/kimi-code-sdk": patch
---

Fix stopBackgroundTask on the v2 engine stopping every background task of the agent instead of only the requested one, and return full skill metadata (path, source, type) from listSkills instead of just name and description.
