Use this tool to maintain a structured question list as you investigate a problem. Unlike a traditional task-oriented TODO list, each item is a **question** that needs to be answered, tracked with hypotheses, evidence, blockers, and confidence.

**Item schema** — every item MUST include:
```
{
  "type": "question",
  "id": "<uuid-or-short-unique-id>",
  "question": "<the question to answer>",
  "status": "pending" | "investigating" | "resolved" | "inconclusive",
  "confidence": "low" | "medium" | "high",
  "depth": "quick" | "deep",
  "hypothesis": "<optional initial guess>",
  "conclusion": "<required when status is resolved>",
  "evidence": [
    { "status": "confirmed" | "refuted" | "checking", "description": "<what was found>" }
  ],
  "blockers": ["<open issues>"],
  "parentId": "<optional parent question id, max 2 levels>",
  "subQuestions": ["<child question ids>"]
}
```

**Full tool call example:**
```
TodoList({
  todos: [
    {
      type: "question",
      id: "q1",
      question: "Can primitive A be reached from external input?",
      status: "investigating",
      confidence: "medium",
      depth: "deep",
      hypothesis: "Probably through Activity B",
      evidence: [
        { status: "checking", description: "Activity B → C.java:142" },
        { status: "confirmed", description: "C.java:142 has no sanitizer" }
      ],
      blockers: ["Need to verify on Android 14+"],
      subQuestions: ["q1a"]
    },
    {
      type: "question",
      id: "q1a",
      question: "Is Activity B exported in AndroidManifest?",
      parentId: "q1",
      status: "resolved",
      confidence: "high",
      depth: "quick",
      conclusion: "Yes, exported=true confirmed",
      evidence: [
        { status: "confirmed", description: "AndroidManifest.xml L42: exported=true" }
      ],
      blockers: [],
      subQuestions: []
    },
    {
      type: "question",
      id: "q2",
      question: "Does the APK contain any native .so libraries?",
      status: "pending",
      confidence: "low",
      depth: "quick",
      evidence: [],
      blockers: [],
      subQuestions: []
    }
  ]
})

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

**Note:** This tool uses **full replacement semantics** — calling with `todos: [...]` *replaces the entire list*. You MUST include every item you want to keep; items omitted from the array are removed. To update a single item, include all items with the changed one updated. This is NOT a patch/merge operation.

**Avoid churn:**
- Do not re-call this tool when nothing meaningful has changed — update only after real progress.
- When unsure of the current state, call query mode first (omit `todos`) to check the list before deciding what to update.
- If no available tool can move any investigation forward, tell the user where you are stuck instead of repeatedly re-ordering the same questions.

**How to use:**
- Call with `todos: [...]` to replace the full list.
- **To update a single item:** first call *without* args to get the current list, then modify the item you need and call with the full `todos` array containing all items.
- Call with no arguments to retrieve the current list without changing it.
- Call with `todos: []` to clear the list.
- Use `id` (UUID) to reference questions for parent-child relationships (max 2 levels: parent → child).
- When marking a question `resolved`, you **must** include `conclusion` and at least one `evidence` item.
- Mark questions `inconclusive` if investigation shows the question cannot be answered.
- Keep confidence (`low`/`medium`/`high`) and depth (`quick`/`deep`) updated.
- When investigation reveals a sub-question, create a child question with `parentId` set to the parent's `id`.
- Never mark a question `resolved` if it has open child questions that are not `resolved` or `inconclusive`.
- **Resolved/inconclusive items are hidden from the default query view** — they are archived. Only pending and investigating items appear. Query without args to see the active list.
```
