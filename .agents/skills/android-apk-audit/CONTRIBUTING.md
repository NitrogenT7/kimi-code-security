# Contributing to Android APK Security Audit Skill

Thank you for your interest in contributing! This skill grows stronger with community contributions. Whether you fix bugs, add Frida scripts, improve documentation, or suggest features — every contribution matters.

## Quick Links

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Contribution Types](#contribution-types)
- [Development Setup](#development-setup)
- [Frida Script Guidelines](#frida-script-guidelines)
- [Documentation Guidelines](#documentation-guidelines)
- [Pull Request Process](#pull-request-process)
- [Security Reporting](#security-reporting)

---

## Code of Conduct

By participating, you agree to maintain a respectful and inclusive environment. We do not tolerate harassment, discrimination, or toxic behavior. All contributors are expected to be constructive, respectful, and professional.

**Our standards:**
- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community and skill quality
- Show empathy towards other contributors

## Getting Started

### 1. Fork the Repository

```bash
git clone https://github.com/DragonJAR/Android-Pentesting-Skill
cd Android-Pentesting-Skill
git remote add upstream https://github.com/DragonJAR/Android-Pentesting-Skill
git fetch upstream
```

### 2. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# OR for bug fixes:
git checkout -b fix/issue-you-are-fixing
# OR for documentation:
git checkout -b docs/improvement-description
```

### 3. Make Your Changes

Work on your changes, following the guidelines in this document.

### 4. Commit with Clear Messages

```bash
git add .
git commit -m "feat(frida): add new SSL pinning bypass for target X"
git commit -m "fix(manifest): correct exported component detection logic"
git commit -m "docs: add guide for React Native security analysis"
```

## Contribution Types

### 🐛 Bug Fixes

- **Fixing incorrect detection patterns** — If a regex or heuristic produces false positives/negatives
- **Tool compatibility** — Updates needed for new tool versions (APKTool, JADX, Frida, etc.)
- **Documentation errors** — Typos, broken links, outdated instructions
- **Script improvements** — Frida scripts that don't work as documented

### ✨ New Frida Scripts

We welcome new Frida scripts that:
- Bypass common protections (SSL pinning, root detection, RASP, biometrics)
- Intercept interesting data flows (crypto operations, network traffic, IPC)
- Support new frameworks or obfuscation techniques
- Provide debugging capabilities for Android security testing

### 📚 Documentation

- New reference guides for frameworks, techniques, or tools
- Improved explanations of existing content
- Translation to other languages (currently EN/ES)
- MASTG mapping updates, CVSS scoring clarifications

### 💡 Feature Requests

- New detection patterns for vulnerabilities
- Integration with additional tools
- Automation improvements
- Reporting enhancements

## Development Setup

### Prerequisites

Ensure you have the following installed:
- `git`
- `apktool` 3.0.1+
- `jadx` 1.5.5+
- `frida-tools` 17.9+
- `apkid` 3.0.0+
- Android SDK Platform Tools 36+

### Verify Your Setup

```bash
# Run the preflight check
./scripts/preflight-check.sh

# Or use the Python version for detailed JSON output
python3 scripts/preflight-check.py
```

### Testing Your Changes

#### Frida Scripts

Test each Frida script on a known target:

```bash
# Start Frida server on your Android device/emulator
adb shell frida-server -l 0.0.0.0

# Test your script
frida -U -f com.target.app -l assets/frida-scripts/your-script.js
```

**Checklist before submitting:**
- [ ] Script works on a clean Android 14+ environment
- [ ] Script handles errors gracefully (no unhandled exceptions)
- [ ] Script can be detached and re-attached without crashes
- [ ] Output is informative and parseable
- [ ] No hardcoded paths — works with any package name

#### Documentation

- [ ] Content is accurate and verifiable
- [ ] Code blocks are syntactically correct
- [ ] Links point to existing resources
- [ ] Follows the existing documentation style

#### SKILL.md Changes

If you modify the main skill file:
- [ ] Changes are backward compatible
- [ ] New tools are documented in prerequisites
- [ ] Phase workflows remain logically consistent
- [ ] New findings align with CVSS 4.0 methodology

## Frida Script Guidelines

### File Structure

Place scripts in `assets/frida-scripts/` with a descriptive name:

```
assets/frida-scripts/
├── ssl-pinning-bypass.js      # Core bypasses
├── root-detection-bypass.js   # Root/bootloader checks
├── rasp-bypass.js             # Runtime app self-protection
├── webview-monitor.js         # Monitoring scripts
└── custom-*-hook.js          # Framework-specific hooks
```

### Script Template

```javascript
/**
 * Script: <script-name>.js
 * Purpose: <one-line description>
 * Target: <Android version/framework if specific>
 * Author: <your name>
 * Requirements: <any special requirements>
 * Version: 1.0
 */

'use strict';

if (Java.available) {
    Java.perform(function() {
        // Implementation
    });
} else {
    console.log('[!] Java runtime not available');
}
```

### Code Style

- **Strict mode** — Always use `'use strict';`
- **Descriptive naming** — `sslPinningBypass` not `bypass`
- **Comments** — Explain WHY, not just WHAT
- **Error handling** — Wrap in try/catch, log failures clearly
- **No hardcoded values** — Use constants or config at top of script
- **Module pattern** — Export a clear API if reusable as library

### Script Documentation

Each script should have a corresponding entry in `references/frida-scripts-index.md`:

```markdown
### Script Name

**Purpose:** What the script does

**Usage:**
```bash
frida -U -f com.target.app -l assets/frida-scripts/script.js
```

**Requirements:**
- Frida server 16+
- Android 11+ (if version-specific)

**Output:** Description of console output/logs generated
```

## Documentation Guidelines

### File Structure

```
references/
├── new-topic-guide.md         # Security guides
├── framework-analysis.md      # Framework-specific docs
└── tool-integration.md        # Tool usage guides
```

### Frontmatter

Start each doc with metadata:

```markdown
---
title: "Guide Title"
description: "Brief description for SEO/discoverability"
date: 2025-01-15
tags:
  - android
  - security
  - specific-topic
---
```

### Style Guide

- **Use active voice** — "The script intercepts" not "The script is intercepting"
- **Imperative mood** — "Run the command" not "Running the command"
- **Code blocks** — Always specify language for syntax highlighting
- **Screenshots** — Use sparingly; prefer textual descriptions
- **Cross-references** — Link to related docs: `[See also: Framework Analysis](../references/framework-analysis.md)`

## Pull Request Process

### Before Submitting

1. **Sync with upstream** — Rebase on latest main
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run preflight check**
   ```bash
   ./scripts/preflight-check.sh
   ```

3. **Self-review your code** — Does it follow guidelines above?

4. **Test thoroughly** — Document how you tested

### PR Description Template

```markdown
## Summary
Brief description of what this PR does

## Motivation
Why is this change needed? What problem does it solve?

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing
How was this tested? What targets were used?

## Screenshots/Evidence
(if applicable)

## Checklist
- [ ] Script/feature works as documented
- [ ] No breaking changes to existing functionality
- [ ] Documentation updated (if applicable)
- [ ] Follows code style guidelines
```

### Review Timeline

- Initial review: 3-5 business days
- Expect 1-2 rounds of feedback
- Be responsive to review comments

### What Gets Merged

We merge contributions that:
- Work correctly and don't break existing functionality
- Follow the style and quality standards in this guide
- Include appropriate tests/documentation
- Have clear commit messages

## Security Reporting

### Reporting Bugs in the Skill Itself

If you find a security vulnerability in this skill (not in target APKs):

1. **DO NOT create a public GitHub issue**
2. Email: security@dragonjar.org
3. Include:
   - Description of the issue
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We follow responsible disclosure — we ask for 90 days before public disclosure.

### Reporting Vulnerabilities in Target APKs

This skill is for auditing APKs you have legal permission to test. Do not use this skill for unauthorized security testing.

## Questions?

- **GitHub Discussions** — For general questions and feature discussions
- **Issues** — For bug reports and concrete feature requests

---

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.

---

**Last updated:** April 2025
