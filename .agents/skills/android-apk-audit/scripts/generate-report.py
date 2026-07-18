#!/usr/bin/env python3
"""
Android APK Audit - Report Generator

Generates HTML and Markdown reports from audit findings in JSON format.
Reads findings from pipeline output and produces structured reports
with CVSS 4.0 scoring, OWASP mapping, and remediation guidance.

Usage:
    python3 generate-report.py --input findings.json --output report.html
    python3 generate-report.py --input findings.json --output report.md
    python3 generate-report.py --input findings.json --output report.html --template executive

Exit codes:
    0 - Report generated successfully
    1 - Error during generation
"""

import json
import sys
import os
import html
import argparse
from datetime import datetime
from typing import Dict, List, Optional
from pathlib import Path


# CVSS 4.0 Severity mapping
SEVERITY_COLORS = {
    "Critical": "#dc2626",
    "High": "#ea580c",
    "Medium": "#ca8a04",
    "Low": "#2563eb",
    "Informational": "#6b7280",
}

SEVERITY_ORDER = {
    "Critical": 0,
    "High": 1,
    "Medium": 2,
    "Low": 3,
    "Informational": 4,
}


def parse_findings(input_path: str) -> List[Dict]:
    """Parse findings from JSON file or JSONL file."""
    findings = []

    if not os.path.exists(input_path):
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    with open(input_path, "r", encoding="utf-8") as f:
        content = f.read().strip()

        if not content:
            print("Error: Input file is empty", file=sys.stderr)
            sys.exit(1)

        # Try JSON array first
        try:
            data = json.loads(content)
            if isinstance(data, list):
                findings = data
            elif isinstance(data, dict):
                # Single finding or wrapped structure
                if "findings" in data:
                    findings = data["findings"]
                else:
                    findings = [data]
        except json.JSONDecodeError:
            # Try JSONL (one JSON per line)
            for line_num, line in enumerate(content.split("\n"), 1):
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                try:
                    findings.append(json.loads(line))
                except json.JSONDecodeError:
                    print(
                        f"Warning: Skipping invalid JSON on line {line_num}",
                        file=sys.stderr,
                    )

    if not findings:
        print("Error: No valid findings found in input", file=sys.stderr)
        sys.exit(1)

    return findings


def sort_findings(findings: List[Dict]) -> List[Dict]:
    """Sort findings by severity (Critical first)."""
    return sorted(
        findings,
        key=lambda f: SEVERITY_ORDER.get(f.get("severity", "Informational"), 99),
    )


def generate_stats(findings: List[Dict]) -> Dict:
    """Generate statistics from findings."""
    stats = {
        "total": len(findings),
        "by_severity": {},
        "by_confidence": {},
        "by_owasp": {},
    }

    for finding in findings:
        severity = finding.get("severity", "Unknown")
        confidence = finding.get("confidence", "Unknown")
        owasp = finding.get("owasp_category", "Unknown")

        stats["by_severity"][severity] = stats["by_severity"].get(severity, 0) + 1
        stats["by_confidence"][confidence] = (
            stats["by_confidence"].get(confidence, 0) + 1
        )
        stats["by_owasp"][owasp] = stats["by_owasp"].get(owasp, 0) + 1

    return stats


def generate_markdown_report(
    findings: List[Dict],
    app_name: str,
    package_name: str,
    output_path: str,
) -> str:
    """Generate a Markdown report."""
    sorted_findings = sort_findings(findings)
    stats = generate_stats(findings)

    lines = [
        f"# Security Audit Report",
        f"",
        f"**Application:** {app_name}",
        f"**Package:** {package_name}",
        f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"**Total Findings:** {stats['total']}",
        f"",
        f"## Executive Summary",
        f"",
    ]

    # Severity summary table
    lines.append("| Severity | Count |")
    lines.append("|----------|-------|")
    for sev in ["Critical", "High", "Medium", "Low", "Informational"]:
        count = stats["by_severity"].get(sev, 0)
        if count > 0:
            lines.append(f"| {sev} | {count} |")
    lines.append("")

    # Risk rating
    critical_count = stats["by_severity"].get("Critical", 0)
    high_count = stats["by_severity"].get("High", 0)
    if critical_count > 0:
        risk = "CRITICAL"
    elif high_count > 0:
        risk = "HIGH"
    elif stats["by_severity"].get("Medium", 0) > 0:
        risk = "MEDIUM"
    else:
        risk = "LOW"
    lines.append(f"**Overall Risk Rating: {risk}**")
    lines.append("")

    # Detailed findings
    lines.append("## Detailed Findings")
    lines.append("")

    for i, finding in enumerate(sorted_findings, 1):
        severity = finding.get("severity", "Unknown")
        title = finding.get("title", f"Finding #{i}")
        confidence = finding.get("confidence", "Unknown")

        lines.append(f"### {i}. [{severity}] {title}")
        lines.append("")
        lines.append(f"- **Severity:** {severity}")
        lines.append(f"- **Confidence:** {confidence}")
        lines.append(f"- **OWASP:** {finding.get('owasp_category', 'N/A')}")
        lines.append(f"- **CWE:** {finding.get('cwe_id', 'N/A')}")

        cvss = finding.get("cvss_4_0_score")
        if cvss:
            lines.append(f"- **CVSS 4.0:** {cvss}")

        lines.append("")

        description = finding.get("description", "")
        if description:
            lines.append(f"**Description:** {description}")
            lines.append("")

        poc = finding.get("proof_of_concept", "")
        if poc:
            lines.append("**Proof of Concept:**")
            lines.append(f"```")
            lines.append(poc)
            lines.append(f"```")
            lines.append("")

        remediation = finding.get("remediation", "")
        if remediation:
            lines.append(f"**Remediation:** {remediation}")
            lines.append("")

        lines.append("---")
        lines.append("")

    report = "\n".join(lines)

    if output_path:
        output_dir = os.path.dirname(output_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(report)
        print(f"Markdown report written to: {output_path}")

    return report


def generate_html_report(
    findings: List[Dict],
    app_name: str,
    package_name: str,
    output_path: str,
) -> str:
    """Generate an HTML report with styling."""
    sorted_findings = sort_findings(findings)
    stats = generate_stats(findings)

    # Risk rating
    critical_count = stats["by_severity"].get("Critical", 0)
    high_count = stats["by_severity"].get("High", 0)
    if critical_count > 0:
        risk = "CRITICAL"
        risk_color = SEVERITY_COLORS["Critical"]
    elif high_count > 0:
        risk = "HIGH"
        risk_color = SEVERITY_COLORS["High"]
    elif stats["by_severity"].get("Medium", 0) > 0:
        risk = "MEDIUM"
        risk_color = SEVERITY_COLORS["Medium"]
    else:
        risk = "LOW"
        risk_color = SEVERITY_COLORS["Low"]

    # Build severity badges
    severity_badges = ""
    for sev in ["Critical", "High", "Medium", "Low", "Informational"]:
        count = stats["by_severity"].get(sev, 0)
        if count > 0:
            color = SEVERITY_COLORS.get(sev, "#6b7280")
            severity_badges += f'<span style="background:{color};color:white;padding:4px 12px;border-radius:4px;margin-right:8px;">{sev}: {count}</span>'

    # Build findings HTML
    findings_html = ""
    for i, finding in enumerate(sorted_findings, 1):
        severity = finding.get("severity", "Unknown")
        title = finding.get("title", f"Finding #{i}")
        color = SEVERITY_COLORS.get(severity, "#6b7280")

        findings_html += f"""
        <div class="finding" style="border-left:4px solid {color};padding:16px;margin-bottom:16px;background:#f9fafb;">
            <h3 style="margin-top:0;color:{color};">[{severity}] {html.escape(title)}</h3>
            <table style="width:100%;max-width:600px;">
                <tr><td><strong>Confidence</strong></td><td>{html.escape(finding.get("confidence", "N/A"))}</td></tr>
                <tr><td><strong>OWASP</strong></td><td>{html.escape(finding.get("owasp_category", "N/A"))}</td></tr>
                <tr><td><strong>CWE</strong></td><td>{html.escape(finding.get("cwe_id", "N/A"))}</td></tr>"""

        cvss = finding.get("cvss_4_0_score")
        if cvss:
            findings_html += f"<tr><td><strong>CVSS 4.0</strong></td><td>{html.escape(cvss)}</td></tr>"

        findings_html += "</table>"

        description = finding.get("description", "")
        if description:
            findings_html += (
                f"<p><strong>Description:</strong> {html.escape(description)}</p>"
            )

        poc = finding.get("proof_of_concept", "")
        if poc:
            findings_html += f"<p><strong>Proof of Concept:</strong></p><pre style='background:#1e293b;color:#e2e8f0;padding:12px;border-radius:4px;overflow-x:auto;'>{html.escape(poc)}</pre>"

        remediation = finding.get("remediation", "")
        if remediation:
            findings_html += (
                f"<p><strong>Remediation:</strong> {html.escape(remediation)}</p>"
            )

        findings_html += "</div>"

    html_output = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Audit Report - {html.escape(app_name)}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1000px; margin: 0 auto; padding: 24px; color: #1e293b; }}
        h1 {{ color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }}
        h2 {{ color: #334155; margin-top: 32px; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ text-align: left; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }}
        th {{ background: #f1f5f9; }}
        .risk-badge {{ font-size: 1.5em; font-weight: bold; color: white; background: {risk_color}; padding: 8px 24px; border-radius: 8px; display: inline-block; margin: 16px 0; }}
        .meta {{ color: #64748b; font-size: 0.9em; }}
        pre {{ white-space: pre-wrap; word-wrap: break-word; }}
        @media print {{ body {{ max-width: none; }} }}
    </style>
</head>
<body>
    <h1>🔒 Security Audit Report</h1>
    <p class="meta">
        <strong>Application:</strong> {html.escape(app_name)}<br>
        <strong>Package:</strong> {html.escape(package_name)}<br>
        <strong>Date:</strong> {datetime.now().strftime("%Y-%m-%d %H:%M")}<br>
        <strong>Total Findings:</strong> {stats["total"]}
    </p>

    <h2>Executive Summary</h2>
    <div class="risk-badge">Overall Risk: {risk}</div>
    <p>{severity_badges}</p>

    <h2>Detailed Findings</h2>
    {findings_html}

    <footer style="margin-top:48px;padding-top:16px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:0.8em;">
        Generated by android-apk-audit skill | CVSS 4.0 Scoring | OWASP MASTG Methodology
    </footer>
</body>
</html>"""

    if output_path:
        output_dir = os.path.dirname(output_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_output)
        print(f"HTML report written to: {output_path}")

    return html_output


def main():
    parser = argparse.ArgumentParser(
        description="Generate security audit reports from findings JSON"
    )
    parser.add_argument(
        "--input",
        "-i",
        required=True,
        help="Path to findings JSON or JSONL file",
    )
    parser.add_argument(
        "--output",
        "-o",
        required=True,
        help="Output path for the report (.html or .md)",
    )
    parser.add_argument(
        "--app-name",
        default="Unknown App",
        help="Application name (default: Unknown App)",
    )
    parser.add_argument(
        "--package-name",
        default="com.example.app",
        help="Package name (default: com.example.app)",
    )
    parser.add_argument(
        "--template",
        "-t",
        choices=["executive", "detailed"],
        default="detailed",
        help="Report template type (default: detailed)",
    )

    args = parser.parse_args()

    # Parse findings
    findings = parse_findings(args.input)
    print(f"Loaded {len(findings)} findings from {args.input}")

    # Generate report based on output extension
    ext = Path(args.output).suffix.lower()

    if ext == ".html":
        generate_html_report(
            findings=findings,
            app_name=args.app_name,
            package_name=args.package_name,
            output_path=args.output,
        )
    elif ext in (".md", ".markdown"):
        generate_markdown_report(
            findings=findings,
            app_name=args.app_name,
            package_name=args.package_name,
            output_path=args.output,
        )
    else:
        print(
            f"Error: Unsupported output format '{ext}'. Use .html or .md",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Report generated successfully: {args.output}")


if __name__ == "__main__":
    main()
