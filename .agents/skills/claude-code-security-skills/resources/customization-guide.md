# Customization Guide

This guide explains how to extend the security audit's scan categories and filtering rules for specific projects, technologies, and compliance requirements.

---

## Overview

The security review has two customization points:

1. **Custom Scan Instructions** — Add additional vulnerability categories to check
2. **Custom Filtering Instructions** — Override or extend false positive filtering rules

---

## 1. Custom Scan Instructions

### Purpose

Add organization-specific or technology-specific vulnerability categories that the default audit does not cover.

### Format

Use the same format as the default categories — a bold header followed by bullet points:

```
**Category Name:**
- Specific vulnerability or pattern to check
- Another specific issue to look for
- Detailed description of what constitutes this vulnerability
```

### Examples

#### Compliance Checks

```
**Compliance-Specific Checks:**
- GDPR Article 17 "Right to Erasure" implementation gaps
- HIPAA PHI encryption at rest violations
- PCI DSS credit card data retention beyond allowed periods
- SOC2 audit trail tampering or deletion capabilities
- CCPA data portability API vulnerabilities
```

#### Financial Services

```
**Financial Services Security:**
- Transaction replay attacks in payment processing
- Double-spending vulnerabilities in ledger systems
- Interest calculation manipulation through timing attacks
- Regulatory reporting data tampering
- Know Your Customer (KYC) bypass mechanisms
```

#### E-commerce

```
**E-commerce Specific:**
- Shopping cart manipulation for price changes
- Inventory race conditions allowing overselling
- Coupon/discount stacking exploits
- Affiliate tracking manipulation
- Review system authentication bypass
```

#### GraphQL

```
**GraphQL Security:**
- Query depth attacks allowing unbounded recursion
- Field-level authorization bypass
- Introspection data leakage in production
```

### How It Works

Custom scan instructions are appended **after** the default "Data Exposure" category. This means:
- All default categories are still checked
- Your custom categories **extend** (not replace) the default scan
- The same HIGH/MEDIUM/LOW severity guidelines apply

---

## 2. Custom Filtering Instructions

### Purpose

Replace or extend the default false positive filtering rules to match your specific environment, infrastructure, and threat model.

### Format

The file should contain three sections:

#### Section 1: HARD EXCLUSIONS

```
HARD EXCLUSIONS - Automatically exclude findings matching these patterns:
1. All DOS/resource exhaustion - we have k8s resource limits and autoscaling
2. Missing rate limiting - handled by our API gateway
3. Tabnabbing vulnerabilities - acceptable risk per our threat model
4. Test files (ending in _test.go, _test.js, or in __tests__ directories)
...
```

#### Section 2: SIGNAL QUALITY CRITERIA

```
SIGNAL QUALITY CRITERIA - For remaining findings, assess:
1. Can an unauthenticated external attacker exploit this?
2. Is there actual data exfiltration or system compromise potential?
3. Is this exploitable in our production Kubernetes environment?
4. Does this bypass our API gateway security controls?
```

#### Section 3: PRECEDENTS

```
PRECEDENTS -
1. We use AWS Cognito for all authentication - auth bypass must defeat Cognito
2. All APIs require valid JWT tokens validated at the gateway level
3. SQL injection is only valid if using raw queries (we use Prisma ORM everywhere)
4. All internal services communicate over mTLS within the k8s cluster
5. Secrets are in AWS Secrets Manager or k8s secrets, never in code
...
```

### How It Works

When custom filtering instructions are provided, they **completely replace** the default filtering rules in `filtering-rules.md`. The hard exclusion patterns (regex-based) in `hard-exclusion-patterns.md` are always applied regardless.

---

## Best Practices

### For Custom Scan Instructions
1. **Avoid Duplicates**: Check the default categories first
2. **Be Specific**: Provide clear descriptions of what constitutes each vulnerability
3. **Include Context**: Explain why something is a vulnerability in your environment
4. **Provide Examples**: Where possible, describe specific attack scenarios
5. **Keep It Focused**: Only add categories relevant to your codebase

### For Custom Filtering Instructions
1. **Start with defaults**: Begin with the default instructions and modify based on false positives you encounter
2. **Be specific**: Include details about your security architecture (e.g., "We use AWS Cognito for all authentication")
3. **Document assumptions**: Explain why certain patterns are excluded (e.g., "k8s resource limits prevent DOS")
4. **Version control**: Track changes to your filtering instructions alongside your code
5. **Team review**: Have your security team review and approve the filtering instructions
