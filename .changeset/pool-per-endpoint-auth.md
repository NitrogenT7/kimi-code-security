---
"@moonshot-ai/agent-core": patch
"@moonshot-ai/agent-core-v2": patch
"@moonshot-ai/kimi-code": patch
---

Fix provider-pool failover for OAuth-backed endpoints: request auth is now resolved per endpoint instead of per alias, so a pool mixing an OAuth provider with a static-key provider no longer sends the primary's OAuth token to the fallback endpoint (or dies with the primary's OAuth failure before reaching it), and coded OAuth errors (`provider.auth_error`, `auth.login_required`) now correctly trigger auth failover to the next endpoint.
