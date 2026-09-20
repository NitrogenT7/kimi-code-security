Triage a security-audit finding with the Jev decision model before spending effort on it.

Use this tool right after a subagent (or you) produces a candidate finding — before active verification and before it enters the report. It answers, with calibrated probabilities:

- **concrete / evidence_supports** — is the claim reproducible and does the cited evidence actually demonstrate it?
- **guardrail_ok** — can this be verified read-only, within the verify-don't-destroy rule? A low score means do NOT attempt live verification; keep it analysis-only.
- **severity** — info / low / medium / high / critical, if confirmed.
- **before_verify** (only when `verify_intent` is true) — is the immediate next step strictly read-only?

The result is advisory: `proceed: true` means the finding is worth passive verification; `proceed: false` means gather stronger evidence first. If Jev is not configured, the tool returns a fallback note and you triage the finding yourself. Always keep the final judgment yours — Jev scores the claim, you own the report.
