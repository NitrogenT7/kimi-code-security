---
"@moonshot-ai/kimi-code": patch
---

Skip the update check, prompt, and background auto-update when the CLI runs as a forked package (the host package.json name is not the official package), so forks never nag about or clobber the official install.
