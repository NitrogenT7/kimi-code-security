# Code Security Review Skill

A reusable AI code security review skill derived from [anthropics/claude-code-security-review](https://github.com/anthropics/claude-code-security-review).

The original project is a GitHub Action that uses Claude Code to perform security audits on Pull Requests. This skill extracts and reorganizes its core prompts, filtering rules, and methodology into a standalone, tool-agnostic format suitable for use in GitHub Copilot, Claude Code, or any AI-assisted code review workflow.

## Structure

```
claude-code-security-skills/
├── README.md                                # This file
├── SKILL.md                                 # Skill entry point and usage guide
└── resources/
    ├── audit-prompt.md                      # Security audit prompt template
    ├── filtering-rules.md                   # False positive filtering rules (19 exclusions + 17 precedents)
    ├── hard-exclusion-patterns.md           # Regex-based auto-exclusion patterns
    └── customization-guide.md              # Guide to extend scan/filter rules
```

## License

MIT — see the original repository for details.
