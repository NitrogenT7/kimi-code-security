#!/usr/bin/env python3
"""
Findings Correlation Script

Correlates and merges security findings from multiple sources:
- Manual pentest findings (from android-apk-audit skill)
- MobSF automated scan results
- Frida dynamic instrumentation traces

Generates unified JSON reports with deduplicated and merged findings.

Usage:
    python3 correlate-findings.py --manual findings.json --mobsf mobsf-report.json --output unified.json
    python3 correlate-findings.py --all manual.json mobsf.json frida.json --output report.json
"""

import argparse
import hashlib
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional, Set, Tuple


class FindingNormalizer:
    """Normalize findings from different sources to a common format."""

    SEVERITY_ORDER = {
        "Critical": 0,
        "High": 1,
        "Medium": 2,
        "Low": 3,
        "Informational": 4,
        "Info": 4,
    }

    SOURCE_PRIORITY = {"manual-pentest": 3, "mobsf": 2, "frida": 1}

    CWE_KEYWORDS = {
        "CWE-798": ["api key", "apikey", "secret", "credential", "password", "token"],
        "CWE-89": ["sql injection", "sqli", "sql injection", "database query"],
        "CWE-79": ["xss", "cross-site scripting", "html injection"],
        "CWE-295": ["certificate", "ssl", "tls", "trustmanager", "pinning"],
        "CWE-269": ["privilege", "permission", "authorization", "access control"],
        "CWE-200": [
            "sensitive data",
            "exposure",
            "data leak",
            "information disclosure",
        ],
        "CWE-312": ["cleartext", "plaintext", "unencrypted", "http"],
        "CWE-489": ["debug", "debuggable", "test mode"],
        "CWE-925": ["intent", "broadcast", "deeplink", "deep link"],
        "CWE-926": ["exported", "component", "activity", "service", "receiver"],
    }

    @classmethod
    def normalize(
        cls, finding: Dict[str, Any], source: str = "unknown"
    ) -> Dict[str, Any]:
        """Normalize a finding to standard format."""
        normalized = {
            "id": cls._normalize_id(finding.get("id", finding.get("name", ""))),
            "title": cls._normalize_title(
                finding.get("title", finding.get("name", "Unknown Finding"))
            ),
            "severity": cls._normalize_severity(finding.get("severity", "Medium")),
            "confidence": cls._normalize_confidence(
                finding.get("confidence", "Likely")
            ),
            "description": cls._clean_text(
                finding.get("description", finding.get("issue_background", ""))
            ),
            "cwe_id": cls._normalize_cwe(finding.get("cwe_id", finding.get("cwe", ""))),
            "cvss_4_0_score": finding.get("cvss_4_0_score", ""),
            "owasp_category": cls._normalize_owasp(finding.get("owasp_category", "")),
            "proof_of_concept": cls._clean_text(finding.get("proof_of_concept", "")),
            "remediation": cls._clean_text(
                finding.get("remediation", finding.get("remediation_background", ""))
            ),
            "source": source,
            "original_id": finding.get("id", finding.get("name", "")),
            "evidence": finding.get("evidence", {}),
            "references": cls._normalize_references(finding.get("references", [])),
        }

        if not normalized["cwe_id"]:
            normalized["cwe_id"] = cls._infer_cwe(
                normalized["title"], normalized["description"]
            )

        if normalized["description"] and not normalized["proof_of_concept"]:
            normalized["proof_of_concept"] = cls._extract_poc_from_description(
                normalized["description"]
            )

        return normalized

    @classmethod
    def _normalize_id(cls, raw_id: str) -> str:
        """Normalize finding ID to consistent format."""
        if not raw_id:
            return f"UNCATEGORIZED-{hashlib.md5(str(raw_id).encode()).hexdigest()[:8]}"

        clean = raw_id.strip().upper()
        clean = "".join(c if c.isalnum() or c in "-_" else "-" for c in clean)
        return clean

    @classmethod
    def _normalize_title(cls, title: str) -> str:
        """Normalize finding title."""
        if not title:
            return "Unknown Finding"

        title = title.strip()
        if len(title) > 100:
            title = title[:97] + "..."

        return title

    @classmethod
    def _normalize_severity(cls, severity: str) -> str:
        """Normalize severity to standard values."""
        severity_map = {
            "critical": "Critical",
            "high": "High",
            "medium": "Medium",
            "low": "Low",
            "informational": "Informational",
            "info": "Informational",
            "warning": "Medium",
            "error": "High",
        }
        return severity_map.get(severity.lower(), "Medium")

    @classmethod
    def _normalize_confidence(cls, confidence: str) -> str:
        """Normalize confidence level."""
        conf_map = {
            "certain": "Confirmed",
            "confirmed": "Confirmed",
            "firm": "Confirmed",
            "tentative": "Likely",
            "likely": "Likely",
            "possible": "Possible",
            "low": "Possible",
        }
        return conf_map.get(confidence.lower(), "Likely")

    @classmethod
    def _normalize_cwe(cls, cwe: str) -> str:
        """Normalize CWE identifier."""
        if not cwe:
            return ""

        cwe = cwe.strip().upper()
        if not cwe.startswith("CWE-") and cwe.isdigit():
            cwe = f"CWE-{cwe}"
        elif cwe.startswith("CWE-") and not cwe[4:].isdigit():
            return ""

        return cwe

    @classmethod
    def _normalize_owasp(cls, owasp: str) -> str:
        """Normalize OWASP category."""
        if not owasp:
            return ""

        owasp = owasp.strip()
        if not owasp.startswith("M"):
            return owasp

        return owasp

    @classmethod
    def _clean_text(cls, text: str) -> str:
        """Clean and normalize text content."""
        if not text:
            return ""

        text = text.strip()
        text = " ".join(text.split())

        return text

    @classmethod
    def _normalize_references(cls, refs: Any) -> List[str]:
        """Normalize references list."""
        if not refs:
            return []
        if isinstance(refs, str):
            return [refs]
        return [str(r) for r in refs if r]

    @classmethod
    def _infer_cwe(cls, title: str, description: str) -> str:
        """Infer CWE from title and description."""
        combined = f"{title} {description}".lower()

        for cwe, keywords in cls.CWE_KEYWORDS.items():
            if any(kw in combined for kw in keywords):
                return cwe

        return ""

    @classmethod
    def _extract_poc_from_description(cls, description: str) -> str:
        """Extract proof of concept from description."""
        poc_markers = ["poc:", "proof:", "example:", "command:", "steps:"]

        for marker in poc_markers:
            idx = description.lower().find(marker)
            if idx != -1:
                return description[idx + len(marker) :].strip()

        return ""


class FindingCorrelator:
    """Correlate and merge findings from multiple sources."""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.normalizer = FindingNormalizer()

    def log(self, message: str) -> None:
        if self.verbose:
            print(f"[DEBUG] {message}", file=sys.stderr)

    def _detect_source_from_filename(self, file_path: str) -> str:
        """Auto-detect source type from filename."""
        lower = os.path.basename(file_path).lower()
        if "mobsf" in lower or "scan" in lower:
            return "mobsf"
        elif "frida" in lower or "trace" in lower:
            return "frida"
        return "manual-pentest"

    def load_findings(self, file_path: str, source: str) -> List[Dict[str, Any]]:
        """Load findings from JSON file."""
        self.log(f"Loading {source} findings from: {file_path}")

        if not os.path.exists(file_path):
            self.log(f"Warning: File not found: {file_path}")
            return []

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                return []

            data = json.loads(content)

        findings = self._extract_findings_list(data)
        normalized = [self.normalizer.normalize(f, source) for f in findings]

        self.log(f"Loaded {len(normalized)} findings from {source}")
        return normalized

    def _extract_findings_list(self, data: Any) -> List[Dict[str, Any]]:
        """Extract list of findings from various JSON structures."""
        if isinstance(data, list):
            return data
        elif isinstance(data, dict):
            for key in [
                "findings",
                "issues",
                "results",
                "vulnerabilities",
                "items",
                "data",
            ]:
                if key in data:
                    value = data[key]
                    if isinstance(value, list):
                        return value

            if "static_analysis" in data:
                static = data["static_analysis"]
                if isinstance(static, dict) and "findings" in static:
                    return static["findings"]

            return [data]

        return []

    def compute_fingerprint(self, finding: Dict[str, Any]) -> str:
        """Compute fingerprint for deduplication."""
        components = [
            finding.get("cwe_id", "").upper(),
            finding.get("title", "")[:30].lower(),
            finding.get("source", ""),
        ]

        key = "|".join(c.strip() for c in components if c)
        return hashlib.sha256(key.encode()).hexdigest()[:16]

    def are_similar(self, f1: Dict[str, Any], f2: Dict[str, Any]) -> Tuple[bool, str]:
        """Check if two findings are similar enough to merge."""
        cwe1 = f1.get("cwe_id", "")
        cwe2 = f2.get("cwe_id", "")

        if cwe1 and cwe2 and cwe1 == cwe2:
            return True, "Same CWE"

        title1 = f1.get("title", "").lower()
        title2 = f2.get("title", "").lower()

        words1 = set(title1.split())
        words2 = set(title2.split())
        common = words1 & words2

        if len(common) >= 3:
            return True, f"Similar title ({len(common)} common words)"

        desc1 = f1.get("description", "").lower()
        desc2 = f2.get("description", "").lower()

        if desc1 and desc2:
            common_desc = len(set(desc1.split()) & set(desc2.split()))
            if common_desc >= 20:
                return True, f"Similar description ({common_desc} common words)"

        return False, ""

    def correlate(
        self, findings_by_source: Dict[str, List[Dict[str, Any]]]
    ) -> List[Dict[str, Any]]:
        """Correlate findings from multiple sources."""
        self.log(f"Correlating findings from {len(findings_by_source)} sources")

        all_findings = []
        for source, findings in findings_by_source.items():
            all_findings.extend(findings)

        self.log(f"Total findings before correlation: {len(all_findings)}")

        fingerprints = {}
        merged_findings = []

        for finding in all_findings:
            fp = self.compute_fingerprint(finding)

            if fp in fingerprints:
                existing_idx = fingerprints[fp]
                existing = merged_findings[existing_idx]

                existing["sources"].append(finding.get("source", ""))
                existing["merged_from"].append(
                    finding.get("original_id", finding.get("id", ""))
                )

                if finding.get("source", "") == "manual-pentest":
                    existing["confidence"] = "Confirmed"

                if self.normalizer.SEVERITY_ORDER.get(
                    finding["severity"], 99
                ) < self.normalizer.SEVERITY_ORDER.get(existing["severity"], 99):
                    existing["severity"] = finding["severity"]

                existing["evidence"]["additional_sources"].append(
                    {
                        "source": finding.get("source", ""),
                        "original_id": finding.get("original_id", ""),
                        "description": finding.get("description", "")[:500],
                    }
                )

                self.log(
                    f"Merged finding: {finding.get('title', 'Unknown')} (source: {finding['source']})"
                )

            else:
                fingerprints[fp] = len(merged_findings)

                new_finding = {
                    "id": f"CORR-{len(merged_findings) + 1:03d}",
                    "title": finding["title"],
                    "severity": finding["severity"],
                    "confidence": finding["confidence"],
                    "description": finding["description"],
                    "cwe_id": finding["cwe_id"],
                    "cvss_4_0_score": finding.get("cvss_4_0_score", ""),
                    "owasp_category": finding.get("owasp_category", ""),
                    "proof_of_concept": finding.get("proof_of_concept", ""),
                    "remediation": finding.get("remediation", ""),
                    "sources": [finding.get("source", "")],
                    "merged_from": [finding.get("original_id", finding.get("id", ""))],
                    "confirmed": finding.get("source", "") == "manual-pentest",
                    "evidence": {
                        "primary": {
                            "source": finding.get("source", ""),
                            "description": finding.get("description", ""),
                            "poc": finding.get("proof_of_concept", ""),
                        }
                    },
                    "references": finding.get("references", []),
                }

                merged_findings.append(new_finding)

        self.log(f"Total findings after correlation: {len(merged_findings)}")

        merged_findings.sort(
            key=lambda f: (
                self.normalizer.SEVERITY_ORDER.get(f["severity"], 99),
                f["title"],
            )
        )

        return merged_findings

    def generate_unified_report(
        self,
        findings_by_source: Dict[str, List[Dict[str, Any]]],
        merged_findings: List[Dict[str, Any]],
        output_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate unified report structure."""

        severity_counts = defaultdict(int)
        source_counts = defaultdict(int)

        for f in merged_findings:
            severity_counts[f["severity"]] += 1
            for src in f["sources"]:
                source_counts[src] += 1

        report = {
            "metadata": {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "generator": "dragonjar-android-apk-audit/1.5.0",
                "version": "1.0.0",
                "sources": {
                    "manual_pentest": len(findings_by_source.get("manual-pentest", [])),
                    "mobsf": len(findings_by_source.get("mobsf", [])),
                    "frida": len(findings_by_source.get("frida", [])),
                },
                "total_findings": len(merged_findings),
                "unique_vulnerabilities": len(merged_findings),
                "severity_breakdown": dict(severity_counts),
                "source_contribution": dict(source_counts),
            },
            "summary": {
                "critical": severity_counts.get("Critical", 0),
                "high": severity_counts.get("High", 0),
                "medium": severity_counts.get("Medium", 0),
                "low": severity_counts.get("Low", 0),
                "informational": severity_counts.get("Informational", 0),
            },
            "findings": merged_findings,
        }

        if output_path:
            output_dir = os.path.dirname(output_path)
            if output_dir and not os.path.exists(output_dir):
                os.makedirs(output_dir, exist_ok=True)

            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2, ensure_ascii=False)

            self.log(f"Report saved to: {output_path}")

        return report


def main():
    parser = argparse.ArgumentParser(
        description="Correlate and merge security findings from multiple sources",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Merge findings from two sources:
    python3 correlate-findings.py \\
      --manual manual-findings.json \\
      --mobsf mobsf-report.json \\
      --output unified-report.json

  Include all three sources:
    python3 correlate-findings.py \\
      --manual findings.json \\
      --mobsf mobsf.json \\
      --frida frida-traces.json \\
      --output unified.json

  Merge from JSONL pipeline:
    python3 correlate-findings.py \\
      --pipeline pipeline_queue.jsonl \\
      --output unified-report.json

  Use individual files:
    python3 correlate-findings.py \\
      --all manual.json mobsf.json frida.json \\
      --output report.json

Environment Variables:
  BURP_OUTPUT_DIR    Output directory for generated reports
        """,
    )

    parser.add_argument("--manual", "-m", help="JSON file with manual pentest findings")

    parser.add_argument("--mobsf", "-s", help="JSON file with MobSF scan results")

    parser.add_argument(
        "--frida", "-f", help="JSON file with Frida instrumentation traces"
    )

    parser.add_argument(
        "--all", nargs="+", help="Multiple JSON files to merge (auto-detect sources)"
    )

    parser.add_argument("--pipeline", help="Process pipeline_queue.jsonl file")

    parser.add_argument(
        "--output", "-o", required=True, help="Output file path for unified report"
    )

    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable verbose debug output"
    )

    args = parser.parse_args()

    try:
        correlator = FindingCorrelator(verbose=args.verbose)

        findings_by_source = {}

        if args.all:
            for file_path in args.all:
                source = correlator._detect_source_from_filename(file_path)
                findings = correlator.load_findings(file_path, source)
                if findings:
                    findings_by_source[source] = findings

        else:
            if args.manual:
                findings = correlator.load_findings(args.manual, "manual-pentest")
                if findings:
                    findings_by_source["manual-pentest"] = findings

            if args.mobsf:
                findings = correlator.load_findings(args.mobsf, "mobsf")
                if findings:
                    findings_by_source["mobsf"] = findings

            if args.frida:
                findings = correlator.load_findings(args.frida, "frida")
                if findings:
                    findings_by_source["frida"] = findings

        if args.pipeline:
            if os.path.exists(args.pipeline):
                findings = correlator.load_findings(args.pipeline, "manual-pentest")
                if findings:
                    if "manual-pentest" not in findings_by_source:
                        findings_by_source["manual-pentest"] = []
                    findings_by_source["manual-pentest"].extend(findings)

        if not findings_by_source:
            print("ERROR: No findings loaded from any source")
            return 1

        merged = correlator.correlate(findings_by_source)
        report = correlator.generate_unified_report(
            findings_by_source, merged, args.output
        )

        print("\n" + "=" * 60)
        print("CORRELATION SUMMARY")
        print("=" * 60)
        print(f"Sources processed: {len(findings_by_source)}")
        print(f"Total findings merged: {len(merged)}")
        print(f"\nSeverity breakdown:")
        for sev, count in report["summary"].items():
            print(f"  {sev.capitalize()}: {count}")
        print(f"\nOutput saved to: {args.output}")

        return 0

    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in input file: {e}")
        return 1

    except FileNotFoundError as e:
        print(f"ERROR: {e}")
        return 1

    except Exception as e:
        print(f"ERROR: Unexpected error: {e}")
        if args.verbose:
            import traceback

            traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
