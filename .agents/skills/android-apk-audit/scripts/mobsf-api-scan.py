#!/usr/bin/env python3
"""
MobSF REST API Integration Script

Provides programmatic access to MobSF for automated Android APK analysis.
Supports upload, scan initiation, report retrieval, and result polling.

Usage:
    python3 mobsf-api-scan.py --apk app.apk --scan
    python3 mobsf-api-scan.py --hash <scan_hash> --report
    python3 mobsf-api-scan.py --apk app.apk --scan --wait --timeout 300
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from urllib.parse import urljoin

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library is required. Install with: pip install requests")
    sys.exit(1)


class MobSFAPIClient:
    """MobSF REST API client with retry logic and error handling."""

    DEFAULT_TIMEOUT = 30
    MAX_RETRIES = 3
    RETRY_DELAY = 5
    POLL_INTERVAL = 10

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        api_key: str = "",
        verbose: bool = False,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.verbose = verbose
        self.session = requests.Session()

        self.session.headers.update(
            {
                "Accept": "application/json",
                "User-Agent": "dragonjar-android-apk-audit/1.5.0",
            }
        )

        if api_key:
            self.session.headers["Authorization"] = f"Bearer {api_key}"

    def log(self, message: str) -> None:
        if self.verbose:
            print(f"[DEBUG] {message}", file=sys.stderr)

    def _make_request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        """Make HTTP request with retry logic."""
        url = urljoin(self.base_url, endpoint)
        kwargs.setdefault("timeout", self.DEFAULT_TIMEOUT)

        self.log(f"{method} {url}")

        last_error = None
        for attempt in range(self.MAX_RETRIES):
            try:
                response = self.session.request(method, url, **kwargs)
                self.log(f"Response: {response.status_code}")

                if response.status_code == 429:
                    retry_after_str = response.headers.get(
                        "Retry-After", str(self.RETRY_DELAY)
                    )
                    try:
                        retry_after = int(retry_after_str)
                    except ValueError:
                        retry_after = self.RETRY_DELAY
                    self.log(f"Rate limited. Waiting {retry_after}s before retry...")
                    time.sleep(retry_after)
                    continue

                return response

            except requests.exceptions.Timeout as e:
                last_error = e
                self.log(f"Timeout on attempt {attempt + 1}/{self.MAX_RETRIES}")

            except requests.exceptions.ConnectionError as e:
                last_error = e
                self.log(
                    f"Connection error on attempt {attempt + 1}/{self.MAX_RETRIES}"
                )

            except requests.exceptions.RequestException as e:
                last_error = e
                self.log(f"Request error on attempt {attempt + 1}/{self.MAX_RETRIES}")

            if attempt < self.MAX_RETRIES - 1:
                time.sleep(self.RETRY_DELAY)

        raise requests.exceptions.RequestException(
            f"Failed after {self.MAX_RETRIES} attempts: {last_error}"
        )

    def check_health(self) -> Dict[str, Any]:
        """Check MobSF API health and authentication status."""
        try:
            response = self._make_request("GET", "/api/v1/user_data")
            response.raise_for_status()
            return {
                "status": "healthy",
                "authenticated": True,
                "version": response.json().get("version", "unknown"),
                "data": response.json(),
            }
        except requests.exceptions.RequestException as e:
            return {"status": "unhealthy", "authenticated": False, "error": str(e)}

    def upload_file(self, file_path: str) -> Dict[str, Any]:
        """Upload APK/IPA to MobSF for analysis."""
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        file_size = os.path.getsize(file_path)
        if file_size > 500 * 1024 * 1024:
            raise ValueError(
                f"File too large: {file_size / (1024 * 1024):.1f}MB (max 500MB)"
            )

        self.log(f"Uploading {file_path} ({file_size / 1024:.1f}KB)...")

        with open(file_path, "rb") as f:
            files = {
                "file": (os.path.basename(file_path), f, "application/octet-stream")
            }

            response = self._make_request("POST", "/api/v1/upload", files=files)
            response.raise_for_status()

        result = response.json()
        self.log(f"Upload complete. Hash: {result.get('hash', 'N/A')}")

        return {
            "status": "uploaded",
            "hash": result.get("hash"),
            "scan_type": result.get("scan_type"),
            "file_name": result.get("file_name"),
            "message": result.get("message", "File uploaded successfully"),
        }

    def start_scan(self, file_hash: str) -> Dict[str, Any]:
        """Start MobSF scan for uploaded file."""
        self.log(f"Starting scan for hash: {file_hash}")

        response = self._make_request(
            "POST", "/api/v1/scan", data={"hash": file_hash, "scan_type": "apk"}
        )
        response.raise_for_status()

        result = response.json()
        self.log(f"Scan initiated. Task ID: {result.get('task_id', 'N/A')}")

        return {
            "status": "scan_started",
            "task_id": result.get("task_id"),
            "message": result.get("message", "Scan started"),
        }

    def get_report(self, file_hash: str) -> Dict[str, Any]:
        """Retrieve scan report from MobSF."""
        self.log(f"Fetching report for hash: {file_hash}")

        response = self._make_request("GET", f"/api/v1/report/{file_hash}")
        response.raise_for_status()

        return response.json()

    def get_pdf_report(self, file_hash: str) -> bytes:
        """Retrieve PDF version of the report."""
        self.log(f"Fetching PDF report for hash: {file_hash}")

        response = self._make_request("GET", f"/api/v1/download/{file_hash}")
        response.raise_for_status()

        return response.content

    def get_findings(self, file_hash: str) -> List[Dict[str, Any]]:
        """Extract security findings from MobSF report."""
        report = self.get_report(file_hash)

        findings = []

        if "static_analysis" in report:
            static = report["static_analysis"]
            if "permissions" in static:
                findings.extend(
                    self._extract_permission_findings(static["permissions"])
                )

        if "dynamic_analysis" in report:
            dynamic = report["dynamic_analysis"]
            if "issues" in dynamic:
                findings.extend(dynamic["issues"])

        if "malware_check" in report:
            malware = report["malware_check"]
            if malware.get("is_malware"):
                findings.append(
                    {
                        "id": f"MOB-{len(findings) + 1:03d}",
                        "title": "Malware Detection",
                        "severity": "Critical",
                        "confidence": "Confirmed",
                        "description": malware.get(
                            "detection", "Malware signature detected"
                        ),
                        "source": "mobsf",
                        "tool": "MobSF",
                        "type": "malware",
                    }
                )

        return findings

    def _extract_permission_findings(
        self, permissions: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Extract security findings from permissions analysis."""
        findings = []
        dangerous_permissions = [
            "android.permission.CAMERA",
            "android.permission.RECORD_AUDIO",
            "android.permission.ACCESS_FINE_LOCATION",
            "android.permission.ACCESS_COARSE_LOCATION",
            "android.permission.READ_CONTACTS",
            "android.permission.WRITE_CONTACTS",
            "android.permission.READ_SMS",
            "android.permission.SEND_SMS",
            "android.permission.READ_CALL_LOG",
            "android.permission.WRITE_CALL_LOG",
            "android.permission.PROCESS_OUTGOING_CALLS",
            "android.permission.READ_PHONE_STATE",
            "android.permission.CALL_PHONE",
        ]

        for perm in permissions:
            if perm.get("permission") in dangerous_permissions:
                findings.append(
                    {
                        "id": f"MOB-{len(findings) + 1:03d}",
                        "title": f"Dangerous Permission: {perm.get('permission', 'Unknown')}",
                        "severity": "Medium",
                        "confidence": "Confirmed",
                        "description": perm.get(
                            "description",
                            f"Permission {perm.get('permission')} grants access to sensitive functionality",
                        ),
                        "source": "mobsf",
                        "tool": "MobSF",
                        "type": "permission",
                        "permission": perm.get("permission"),
                        "info": perm.get("info", ""),
                    }
                )

        return findings

    def wait_for_scan(self, file_hash: str, timeout: int = 300) -> Dict[str, Any]:
        """Poll until scan completes or timeout."""
        self.log(f"Waiting for scan to complete (timeout: {timeout}s)...")

        start_time = time.time()
        last_status = ""

        while time.time() - start_time < timeout:
            try:
                response = self._make_request("GET", f"/api/v1/report/{file_hash}")

                if response.status_code == 202:
                    status = response.json().get("status", "processing")
                    if status != last_status:
                        self.log(f"Scan status: {status}")
                        last_status = status

                    if status == "completed":
                        self.log("Scan completed!")
                        return {"status": "completed", "report": response.json()}

                    time.sleep(self.POLL_INTERVAL)
                elif response.status_code == 200:
                    return {"status": "completed", "report": response.json()}
                else:
                    time.sleep(self.POLL_INTERVAL)

            except requests.exceptions.RequestException:
                time.sleep(self.POLL_INTERVAL)

        return {
            "status": "timeout",
            "message": f"Scan did not complete within {timeout}s",
        }


def format_mobsf_report(report: Dict[str, Any]) -> str:
    """Format MobSF report as readable text."""
    lines = []
    lines.append("=" * 60)
    lines.append("MOB SF SCAN REPORT")
    lines.append("=" * 60)

    if "app_name" in report:
        lines.append(f"App Name: {report['app_name']}")
    if "package_name" in report:
        lines.append(f"Package: {report['package_name']}")
    if "version_name" in report:
        lines.append(f"Version: {report['version_name']}")

    lines.append("")

    if "static_analysis" in report:
        lines.append("--- Static Analysis ---")
        static = report["static_analysis"]

        if "permissions" in static:
            lines.append(f"\nPermissions ({len(static['permissions'])}):")
            for perm in static["permissions"][:10]:
                status = (
                    "[DANGEROUS]"
                    if perm.get("status", "").lower() == "dangerous"
                    else ""
                )
                lines.append(f"  - {perm.get('permission', 'Unknown')} {status}")

    if "malware_check" in report:
        malware = report["malware_check"]
        lines.append(f"\n--- Malware Check ---")
        lines.append(f"Score: {malware.get('score', 'N/A')}")
        lines.append(f"Is Malware: {malware.get('is_malware', False)}")

    lines.append("=" * 60)
    return "\n".join(lines)


def save_json(data: Dict[str, Any], output_path: str) -> None:
    """Save data as JSON file."""
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"JSON report saved to: {output_path}")


def save_pdf(pdf_data: bytes, output_path: str) -> None:
    """Save PDF data to file."""
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    with open(output_path, "wb") as f:
        f.write(pdf_data)

    print(f"PDF report saved to: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="MobSF REST API integration for Android APK security scanning",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Check MobSF status:
    python3 mobsf-api-scan.py --health

  Upload and scan APK:
    python3 mobsf-api-scan.py --apk app.apk --scan --wait

  Get existing scan report:
    python3 mobsf-api-scan.py --hash abc123def456 --report

  Save findings to JSON:
    python3 mobsf-api-scan.py --hash abc123def456 --findings --output mobsf-findings.json

  Full workflow with output:
    python3 mobsf-api-scan.py --apk app.apk --scan --wait --report \\
      --output-dir ./mobsf-output --json --pdf

Environment Variables:
  MOBSF_URL     MobSF server URL (default: http://localhost:8000)
  MOBSF_API_KEY MobSF API key for authenticated instances
        """,
    )

    parser.add_argument("--apk", "-a", help="Path to APK/IPA file to upload and scan")

    parser.add_argument("--hash", help="File hash (MD5/SHA1) to retrieve existing scan")

    parser.add_argument(
        "--scan", action="store_true", help="Start a new scan after upload"
    )

    parser.add_argument(
        "--wait", "-w", action="store_true", help="Wait for scan to complete"
    )

    parser.add_argument(
        "--timeout",
        "-t",
        type=int,
        default=300,
        help="Maximum seconds to wait for scan (default: 300)",
    )

    parser.add_argument("--report", action="store_true", help="Retrieve scan report")

    parser.add_argument(
        "--findings", action="store_true", help="Extract security findings from report"
    )

    parser.add_argument(
        "--pdf", action="store_true", help="Download PDF version of report"
    )

    parser.add_argument(
        "--health", action="store_true", help="Check MobSF API health status"
    )

    parser.add_argument("--output", "-o", help="Output file path for report/findings")

    parser.add_argument("--output-dir", help="Output directory for multiple files")

    parser.add_argument("--json", action="store_true", help="Save output as JSON")

    parser.add_argument(
        "--url",
        default=os.environ.get("MOBSF_URL", "http://localhost:8000"),
        help="MobSF server URL (default: from MOBSF_URL env or localhost:8000)",
    )

    parser.add_argument(
        "--api-key",
        default=os.environ.get("MOBSF_API_KEY", ""),
        help="MobSF API key (default: from MOBSF_API_KEY env)",
    )

    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable verbose debug output"
    )

    args = parser.parse_args()

    mobsf = MobSFAPIClient(
        base_url=args.url, api_key=args.api_key, verbose=args.verbose
    )

    try:
        if args.health:
            result = mobsf.check_health()
            print(json.dumps(result, indent=2))
            return 0

        if not args.apk and not args.hash:
            parser.print_help()
            print("\nERROR: Must specify either --apk or --hash")
            return 1

        file_hash = args.hash
        scan_completed = False

        if args.apk:
            upload_result = mobsf.upload_file(args.apk)
            print(json.dumps(upload_result, indent=2))

            file_hash = upload_result.get("hash")
            if not file_hash:
                print("ERROR: Could not get file hash from upload response")
                return 1

            if args.scan:
                scan_result = mobsf.start_scan(file_hash)
                print(json.dumps(scan_result, indent=2))

                if args.wait:
                    wait_result = mobsf.wait_for_scan(file_hash, timeout=args.timeout)
                    if wait_result.get("status") == "completed":
                        scan_completed = True
                        print("\nScan completed successfully!")

        if args.report or args.findings or args.pdf:
            if not file_hash:
                print(
                    "ERROR: No file hash available. Upload a file first or provide --hash"
                )
                return 1

            if args.pdf:
                pdf_data = mobsf.get_pdf_report(file_hash)
                output_path = args.output or os.path.join(
                    args.output_dir or ".", f"{file_hash}.pdf"
                )
                save_pdf(pdf_data, output_path)

            if args.report or args.findings:
                report = mobsf.get_report(file_hash)

                if args.findings:
                    findings = mobsf.get_findings(file_hash)
                    output_data = {
                        "metadata": {
                            "file_hash": file_hash,
                            "generated_at": datetime.now(timezone.utc).isoformat(),
                            "source": "MobSF",
                            "total_findings": len(findings),
                        },
                        "findings": findings,
                    }

                    output_path = args.output or os.path.join(
                        args.output_dir or ".", "mobsf-findings.json"
                    )
                    save_json(output_data, output_path)

                if args.report and not args.findings:
                    if args.json:
                        output_path = args.output or os.path.join(
                            args.output_dir or ".", f"{file_hash}-report.json"
                        )
                        save_json(report, output_path)
                    else:
                        print(format_mobsf_report(report))

        return 0

    except requests.exceptions.ConnectionError as e:
        print(f"ERROR: Cannot connect to MobSF at {args.url}")
        print(f"Details: {e}")
        print("\nVerify MobSF is running and accessible.")
        return 1

    except requests.exceptions.HTTPError as e:
        print(f"ERROR: MobSF API error: {e}")
        if e.response is not None:
            print(f"Response: {e.response.text}")
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
