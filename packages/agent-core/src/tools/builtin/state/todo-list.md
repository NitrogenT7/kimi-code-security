Use this tool to maintain a structured question list as you investigate a problem. Unlike a traditional task-oriented TODO list, each item is a **question** that needs to be answered, tracked with hypotheses, evidence, blockers, and confidence.

**When to use:**
- Multi-step investigations where each sub-problem is a question to answer
- Security audits: tracking questions like "Can primitive A be reached from external input?"
- Tracking evidence collected across the investigation
- After receiving new instructions, break down the unknowns into questions
- Before starting, mark exactly one question as `investigating`
- Mark a question `resolved` immediately after you can answer it with sufficient evidence

**When NOT to use:**
- Single-shot answers that complete in one or two tool calls
- Trivial requests where tracking adds no clarity
- Purely conversational or informational replies
- Simple procedural steps (use Goal mode instead)

**Question statuses:**
- `pending` — question identified but not yet investigated
- `investigating` — actively collecting evidence
- `resolved` — question answered with conclusion + evidence
- `inconclusive` — cannot be answered (dead end, blocked by external factors)

**Evidence item statuses:**
- `checking` — currently verifying this piece of evidence
- `confirmed` — evidence verified, supports the hypothesis
- `refuted` — evidence contradicts the hypothesis

**Avoid churn:**
- Do not re-call this tool when nothing meaningful has changed — update only after real progress.
- When unsure of the current state, call query mode first (omit `todos`) to check the list before deciding what to update.
- If no available tool can move any investigation forward, tell the user where you are stuck instead of repeatedly re-ordering the same questions.

**How to use:**
- Call with `todos: [...]` to replace the full list.
- Call with no arguments to retrieve the current list without changing it.
- Call with `todos: []` to clear the list.
- Use `id` (UUID) to reference questions for parent-child relationships (max 2 levels: parent → child).
- When marking a question `resolved`, you **must** include `conclusion` and at least one `evidence` item.
- Mark questions `inconclusive` if investigation shows the question cannot be answered.
- Keep confidence (`low`/`medium`/`high`) and depth (`quick`/`deep`) updated.
- When investigation reveals a sub-question, create a child question with `parentId` set to the parent's `id`.
- Never mark a question `resolved` if it has open child questions that are not `resolved` or `inconclusive`.
