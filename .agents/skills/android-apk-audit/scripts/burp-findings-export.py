#!/usr/bin/env python3
"""
Burp Suite Findings Export Script

Exports Android pentest findings to Burp Suite Professional compatible JSON format
and SARIF format for CI/CD integration.

Usage:
    python3 burp-findings-export.py --input findings.json --output burp-issues.json
    python3 burp-findings-export.py --input findings.json --output report.sarif --format sarif
"""

import argparse
import json
import sys
import os
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional


class BurpFindingsExporter:
    """Export pentest findings to Burp Suite compatible formats."""

    SEVERITY_MAP = {
        "Critical": "Critical",
        "High": "High",
        "Medium": "Medium",
        "Low": "Low",
        "Informational": "Info",
        "Info": "Info",
    }

    CONFIDENCE_MAP = {
        "Confirmed": "Certain",
        "Likely": "Tentative",
        "Possible": "Tentative",
    }

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.warnings = []

    def log(self, message: str) -> None:
        if self.verbose:
            print(f"[DEBUG] {message}", file=sys.stderr)

    def warn(self, message: str) -> None:
        self.warnings.append(message)
        print(f"[WARNING] {message}", file=sys.stderr)

    def load_findings(self, input_path: str) -> List[Dict[str, Any]]:
        """Load findings from JSON file."""
        self.log(f"Loading findings from: {input_path}")

        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input file not found: {input_path}")

        with open(input_path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                return []

            data = json.loads(content)

        if isinstance(data, dict) and "findings" in data:
            return data["findings"]
        elif isinstance(data, list):
            return data
        elif isinstance(data, dict) and "issues" in data:
            return data["issues"]
        else:
            raise ValueError(f"Unexpected JSON structure in {input_path}")

    def normalize_finding(self, finding: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize finding to standard format."""
        normalized = {
            "id": finding.get("id", finding.get("name", "UNKNOWN")),
            "title": finding.get("title", finding.get("name", "Untitled Finding")),
            "severity": finding.get("severity", "Medium"),
            "confidence": finding.get("confidence", "Likely"),
            "description": finding.get("description", ""),
            "cwe_id": finding.get("cwe_id", finding.get("cwe", "")),
            "cvss_4_0_score": finding.get("cvss_4_0_score", ""),
            "owasp_category": finding.get("owasp_category", ""),
            "proof_of_concept": finding.get("proof_of_concept", ""),
            "remediation": finding.get("remediation", ""),
            "host": finding.get("host", "android-app"),
            "path": finding.get("path", "/"),
            "references": finding.get("references", []),
            "source": finding.get("source", "manual-pentest"),
        }

        if "issue_background" in finding:
            normalized["description"] = finding["issue_background"]
        if "remediation_background" in finding:
            normalized["remediation"] = finding["remediation_background"]

        return normalized

    def to_burp_format(self, findings: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Convert findings to Burp Suite Professional JSON format."""
        self.log(f"Converting {len(findings)} findings to Burp format")

        burp_issues = []
        for finding in findings:
            normalized = self.normalize_finding(finding)

            burp_issue = {
                "name": normalized["title"],
                "severity": self.SEVERITY_MAP.get(normalized["severity"], "Medium"),
                "confidence": self.CONFIDENCE_MAP.get(
                    normalized["confidence"], "Tentative"
                ),
                "host": normalized["host"],
                "path": normalized["path"],
                "issue_background": self._build_issue_background(normalized),
                "remediation_background": self._build_remediation(normalized),
                "references": self._build_references(normalized),
                "vulnerability_ids": self._build_vulnerability_ids(normalized),
            }

            if normalized["cvss_4_0_score"]:
                burp_issue["cvss3_score"] = self._extract_cvss_score(
                    normalized["cvss_4_0_score"]
                )

            burp_issues.append(burp_issue)

        return {
            "issues": burp_issues,
            "tool": "dragonjar-android-apk-audit/1.5.0",
            "version": "1.0.0",
            "export_time": datetime.now(timezone.utc).isoformat(),
            "total_issues": len(burp_issues),
            "warnings": self.warnings if self.warnings else None,
        }

    def _build_issue_background(self, finding: Dict[str, Any]) -> str:
        """Build detailed issue background."""
        parts = []

        if finding.get("owasp_category"):
            parts.append(f"OWASP Category: {finding['owasp_category']}")

        if finding.get("cwe_id"):
            parts.append(f"CWE: {finding['cwe_id']}")

        if finding.get("description"):
            parts.append(f"\nDescription: {finding['description']}")

        if finding.get("proof_of_concept"):
            parts.append(f"\nProof of Concept:\n{finding['proof_of_concept']}")

        if finding.get("source"):
            parts.append(f"\nSource: {finding['source']}")

        return "\n".join(parts).strip()

    def _build_remediation(self, finding: Dict[str, Any]) -> str:
        """Build remediation background."""
        remediation = finding.get("remediation", "")
        if not remediation:
            remediation = "No specific remediation provided."

        cvss = finding.get("cvss_4_0_score", "")
        if cvss:
            remediation = f"CVSS 4.0 Score: {cvss}\n\n{remediation}"

        return remediation

    def _build_references(self, finding: Dict[str, Any]) -> List[str]:
        """Build reference list."""
        refs = finding.get("references", [])
        if not isinstance(refs, list):
            refs = [refs] if refs else []

        cwe_id = finding.get("cwe_id", "")
        if cwe_id and cwe_id.startswith("CWE-"):
            cwe_num = cwe_id.replace("CWE-", "")
            refs.append(f"https://cwe.mitre.org/data/definitions/{cwe_num}.html")

        owasp = finding.get("owasp_category", "")
        if owasp:
            refs.append(f"https://owasp.org/www-project-mobile-top-10/")

        return refs

    def _build_vulnerability_ids(self, finding: Dict[str, Any]) -> List[str]:
        """Build vulnerability ID list."""
        ids = []
        if finding.get("id"):
            ids.append(finding["id"])
        if finding.get("cwe_id"):
            ids.append(finding["cwe_id"])
        return ids

    def _extract_cvss_score(self, cvss_string: str) -> Optional[float]:
        """Extract numeric score from CVSS string."""
        try:
            if "(" in cvss_string:
                score = cvss_string.split("(")[1].split(")")[0]
                return float(score)
            parts = cvss_string.split()
            for part in parts:
                if part.replace(".", "").isdigit():
                    return float(part)
        except (ValueError, IndexError):
            pass
        return None

    def to_sarif_format(self, findings: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Convert findings to SARIF format for CI/CD integration."""
        self.log(f"Converting {len(findings)} findings to SARIF format")

        results = []
        for idx, finding in enumerate(findings):
            normalized = self.normalize_finding(finding)

            result = {
                "id": f"DRAG{idx + 1:04d}",
                "ruleId": normalized.get("cwe_id", f"DRAG{idx + 1:04d}"),
                "shortDescription": {"text": normalized["title"]},
                "level": self._sarif_severity(normalized["severity"]),
                "message": {"text": normalized["description"]},
                "locations": [
                    {
                        "physicalLocation": {
                            "artifactLocation": {
                                "uri": f"android-app/{normalized['host']}"
                            },
                            "region": {
                                "startLine": 1,
                                "contextRegion": {
                                    "snippet": {
                                        "text": normalized.get(
                                            "proof_of_concept",
                                            normalized.get("description", ""),
                                        )[:500]
                                    }
                                },
                            },
                        }
                    }
                ],
                "properties": {
                    "owasp_category": normalized.get("owasp_category", ""),
                    "source": normalized.get("source", "manual-pentest"),
                    "cvss_4_0": normalized.get("cvss_4_0_score", ""),
                    "proof_of_concept": normalized.get("proof_of_concept", ""),
                    "remediation": normalized.get("remediation", ""),
                },
            }
            results.append(result)

        return {
            "version": "2.1.0",
            "schemaUri": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/Schemata/sarif-schema-2.1.0.json",
            "runs": [
                {
                    "tool": {
                        "driver": {
                            "name": "dragojar-android-pentest",
                            "version": "1.0.0",
                            "informationUri": "https://www.DragonJAR.org",
                            "rules": self._build_sarif_rules(findings),
                        }
                    },
                    "results": results,
                    "properties": {
                        "export_time": datetime.now(timezone.utc).isoformat(),
                        "total_findings": len(results),
                    },
                }
            ],
        }

    def _sarif_severity(self, severity: str) -> str:
        """Map severity to SARIF level."""
        mapping = {
            "Critical": "error",
            "High": "error",
            "Medium": "warning",
            "Low": "note",
            "Informational": "note",
            "Info": "note",
        }
        return mapping.get(severity, "warning")

    def _build_sarif_rules(
        self, findings: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Build SARIF rules from findings."""
        rules = {}
        for finding in findings:
            normalized = self.normalize_finding(finding)
            rule_id = normalized.get("cwe_id", normalized.get("id", "UNKNOWN"))

            if rule_id not in rules:
                rules[rule_id] = {
                    "id": rule_id,
                    "name": normalized["title"].replace(" ", "_"),
                    "shortDescription": {"text": normalized["title"]},
                    "fullDescription": {
                        "text": normalized.get("description", "")[:1000]
                    },
                    "help": {
                        "text": f"Remediation: {normalized.get('remediation', 'N/A')}",
                        "markdown": f"## {normalized['title']}\n\n**Severity:** {normalized['severity']}\n\n### Description\n{normalized.get('description', '')}\n\n### Proof of Concept\n```\n{normalized.get('proof_of_concept', 'N/A')}\n```\n\n### Remediation\n{normalized.get('remediation', 'N/A')}",
                    },
                    "properties": {
                        "severity": normalized["severity"],
                        "tags": [
                            "android",
                            "mobile",
                            normalized.get("owasp_category", "")
                            .lower()
                            .replace(" ", "-"),
                        ],
                    },
                }

        return list(rules.values())

    def export(
        self, input_path: str, output_path: str, output_format: str = "burp"
    ) -> None:
        """Main export method."""
        findings = self.load_findings(input_path)

        if not findings:
            self.warn("No findings loaded from input file")

        if output_format.lower() == "sarif":
            output_data = self.to_sarif_format(findings)
        else:
            output_data = self.to_burp_format(findings)

        output_dir = os.path.dirname(output_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)

        print(f"Successfully exported {len(findings)} findings to: {output_path}")
        print(f"Format: {output_format.upper()}")


def main():
    parser = argparse.ArgumentParser(
        description="Export Android pentest findings to Burp Suite JSON or SARIF format",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Export to Burp JSON:
    python3 burp-findings-export.py --input findings.json --output burp-issues.json

  Export to SARIF for GitHub:
    python3 burp-findings-export.py --input findings.json --output report.sarif --format sarif

  Use with environment variables:
    export BURP_OUTPUT_DIR=./burp-exports
    python3 burp-findings-export.py --input findings.json --output $BURP_OUTPUT_DIR/burp.json
        """,
    )

    parser.add_argument(
        "--input",
        "-i",
        required=True,
        help="Input JSON file containing pentest findings",
    )

    parser.add_argument(
        "--output", "-o", required=True, help="Output file path for exported findings"
    )

    parser.add_argument(
        "--format",
        "-f",
        choices=["burp", "sarif"],
        default="burp",
        help="Output format: burp (Burp Suite JSON) or sarif (SARIF 2.1.0). Default: burp",
    )

    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable verbose debug output"
    )

    args = parser.parse_args()

    try:
        exporter = BurpFindingsExporter(verbose=args.verbose)
        exporter.export(args.input, args.output, args.format)
        return 0

    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in input file: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"ERROR: Unexpected error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback

            traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
