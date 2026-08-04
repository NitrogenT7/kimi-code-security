---
"@moonshot-ai/agent-core": minor
"@moonshot-ai/agent-core-v2": minor
"@moonshot-ai/kimi-code": minor
---

Allow routing each subagent to a specific model: the Agent and AgentSwarm tools accept an optional `model` argument, profiles can declare a default model, and a `subagent.routing` config table maps profile names to model aliases. Without any of these, subagents keep inheriting the caller model. Pass `model` to Agent/AgentSwarm, or set `[subagent.routing]` in config.toml.
