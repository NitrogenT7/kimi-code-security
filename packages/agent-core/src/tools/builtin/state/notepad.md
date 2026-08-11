Use this tool to read and write your notepad — a free-form text buffer that only you (the agent) own. It is your persistent memory across context compaction: the notepad's content is stored outside the conversation context, survives compaction unchanged, and is re-attached to the compaction summary so you can see it again after the context is trimmed.

**When to use:**
- Record precise details the compaction summary cannot be trusted to keep: exact commands, file paths and line numbers, payload fragments, endpoint shapes, config values, environment quirks.
- Keep a running log of what you tried and learned ("X failed because Y"), interim hypotheses, and open loops that do not fit a structured question.
- Leave notes to your future, post-compaction self about decisions made and why.

**When NOT to use:**
- Tracking investigation questions with evidence and confidence → use `TodoList`, it has the structured schema for that.
- Writing an implementation plan awaiting user approval → use the plan file via plan mode.
- Long-form content that belongs in the project (docs, code, reports) → write a real file with `Write`. The notepad is short-term working memory for you, not project output; keep it concise.

**Full replacement semantics for `content`:** passing `content` replaces the entire notepad. To modify or delete a section, read the current content, then rewrite the whole thing with your edits applied. Passing an empty string clears the notepad. Use `append` for purely additive notes so you do not have to re-transcribe existing content (and risk dropping parts of it).

**Query mode:** call with no arguments to read the current content. After a context compaction, the notepad content is included in the compaction summary; treat the summary copy as a snapshot and query this tool for the live content when in doubt.

**The user can see and edit the notepad** via the `/notepad` command — never store secrets or anything the user should not see, and respect user edits as authoritative.
