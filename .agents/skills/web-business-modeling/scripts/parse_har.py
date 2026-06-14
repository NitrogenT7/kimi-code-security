#!/usr/bin/env python3
"""
Parse a HAR file and produce a structured recon summary for web business modeling.
Usage:
    python parse_har.py path/to/file.har [-o report.md]
"""

import json
import re
import argparse
import urllib.parse
from collections import defaultdict
from datetime import datetime

SENSITIVE_PARAM_NAMES = {
    "password", "passwd", "pwd", "token", "secret", "api_key", "apikey",
    "session", "cookie", "authorization", "access_token", "refresh_token",
    "phone", "mobile", "email", "id_card", "identity"
}

INTERESTING_PATH_KEYWORDS = [
    "order", "pay", "payment", "cart", "checkout", "coupon", "discount",
    "user", "profile", "account", "wallet", "balance", "withdraw", "recharge",
    "admin", "manage", "dashboard", "api", "auth", "login", "register",
    "reset", "password", "file", "upload", "download", "export", "report",
    "webhook", "callback", "oauth", "sso", "invite", "gift", "point", "credit"
]

ID_PATTERN = re.compile(r"/\d+(/|$)")
UUID_PATTERN = re.compile(r"/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(/|$)")


def extract_domain(url):
    try:
        return urllib.parse.urlparse(url).netloc
    except Exception:
        return ""


def extract_path(url):
    try:
        parsed = urllib.parse.urlparse(url)
        return urllib.parse.unquote(parsed.path)
    except Exception:
        return ""


def extract_query_params(url):
    try:
        parsed = urllib.parse.urlparse(url)
        return {k: v for k, v in urllib.parse.parse_qs(parsed.query).items()}
    except Exception:
        return {}


def extract_body_params(request):
    post_data = request.get("postData", {})
    text = post_data.get("text", "")
    mime = post_data.get("mimeType", "")
    if not text:
        return {}
    if "json" in mime:
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                return {k: type(v).__name__ for k, v in data.items()}
        except Exception:
            pass
    if "x-www-form-urlencoded" in mime or "form-data" in mime:
        try:
            return {k: v for k, v in urllib.parse.parse_qs(text).items()}
        except Exception:
            pass
    return {"raw": text[:200]}


def summarize_entry(entry):
    req = entry.get("request", {})
    resp = entry.get("response", {})
    url = req.get("url", "")
    method = req.get("method", "GET")
    path = extract_path(url)
    query = extract_query_params(url)
    body = extract_body_params(req)

    headers = {h["name"].lower(): h["value"] for h in req.get("headers", [])}
    resp_headers = {h["name"].lower(): h["value"] for h in resp.get("headers", [])}

    auth_headers = []
    for name in headers:
        if any(k in name for k in ["authorization", "cookie", "token", "x-api", "x-auth"]):
            auth_headers.append(name)

    cookies_set = []
    for name in resp_headers:
        if "set-cookie" in name:
            cookies_set.append(resp_headers[name].split("=")[0])

    return {
        "method": method,
        "url": url,
        "path": path,
        "domain": extract_domain(url),
        "query_keys": list(query.keys()),
        "body_keys": list(body.keys()),
        "status": resp.get("status", 0),
        "content_type": resp_headers.get("content-type", "").split(";")[0],
        "auth_headers": auth_headers,
        "cookies_set": cookies_set,
        "has_id_in_path": bool(ID_PATTERN.search(path)),
        "has_uuid_in_path": bool(UUID_PATTERN.search(path)),
        "interesting": any(kw in path.lower() for kw in INTERESTING_PATH_KEYWORDS),
        "sensitive_params": [k for k in list(query.keys()) + list(body.keys())
                             if any(s in k.lower() for s in SENSITIVE_PARAM_NAMES)],
    }


def build_report(entries):
    summary = {
        "total": len(entries),
        "domains": set(),
        "paths": set(),
        "api_endpoints": [],
        "auth_mechanisms": set(),
        "set_cookies": set(),
        "interesting_endpoints": [],
        "id_or_uuid_endpoints": [],
        "redirects": [],
    }

    domain_methods = defaultdict(set)
    endpoint_status = defaultdict(set)

    for e in entries:
        summary["domains"].add(e["domain"])
        summary["paths"].add(e["path"])
        domain_methods[e["domain"]].add(e["method"])

        endpoint = f"{e['method']} {e['path']}"
        endpoint_status[endpoint].add(str(e["status"]))

        summary["auth_mechanisms"].update(e["auth_headers"])
        summary["set_cookies"].update(e["cookies_set"])

        if e["interesting"]:
            summary["interesting_endpoints"].append(e)
        if e["has_id_in_path"] or e["has_uuid_in_path"]:
            summary["id_or_uuid_endpoints"].append(e)
        if e["status"] in (301, 302, 307, 308):
            summary["redirects"].append(e)

    lines = []
    lines.append("# HAR 被动侦察摘要\n")
    lines.append(f"生成时间：{datetime.now().isoformat()}\n")
    lines.append("## 1. 总体统计\n")
    lines.append(f"- 总请求数：{summary['total']}")
    lines.append(f"- 涉及域名：{len(summary['domains'])}")
    lines.append(f"- 不同路径：{len(summary['paths'])}")
    lines.append(f"- 认证相关请求头：{', '.join(sorted(summary['auth_mechanisms'])) or '无'}")
    lines.append(f"- Set-Cookie 名称：{', '.join(sorted(summary['set_cookies'])) or '无'}\n")

    lines.append("## 2. 域名分布\n")
    for d in sorted(summary["domains"]):
        methods = "/".join(sorted(domain_methods[d]))
        lines.append(f"- `{d}`：{methods}")
    lines.append("")

    lines.append("## 3. API / 端点清单\n")
    lines.append("| Method | Path | 状态码 | Content-Type | 认证头 | 参数 | 业务关键词 |")
    lines.append("|--------|------|--------|--------------|--------|------|------------|")
    shown = set()
    for e in entries:
        key = f"{e['method']} {e['path']}"
        if key in shown:
            continue
        shown.add(key)
        param_keys = ", ".join((e["query_keys"] + e["body_keys"])[:8]) or "-"
        auth = ", ".join(e["auth_headers"]) or "-"
        biz = "是" if e["interesting"] else "-"
        lines.append(
            f"| {e['method']} | `{e['path']}` | {', '.join(sorted(endpoint_status[key]))} | "
            f"{e['content_type'] or '-'} | {auth} | {param_keys} | {biz} |"
        )
    lines.append("")

    lines.append("## 4. 高关注端点\n")
    lines.append("### 4.1 含资源 ID / UUID 的路径（越权测试候选）\n")
    for e in summary["id_or_uuid_endpoints"][:30]:
        lines.append(f"- `{e['method']} {e['path']}` → status={e['status']}")
    if not summary["id_or_uuid_endpoints"]:
        lines.append("- 未发现")
    lines.append("")

    lines.append("### 4.2 业务敏感路径（支付/权限/回调/文件等）\n")
    for e in summary["interesting_endpoints"][:40]:
        params = ", ".join((e["query_keys"] + e["body_keys"])[:6]) or "-"
        lines.append(f"- `{e['method']} {e['path']}` | params: {params}")
    if not summary["interesting_endpoints"]:
        lines.append("- 未发现")
    lines.append("")

    lines.append("### 4.3 重定向链\n")
    for e in summary["redirects"][:20]:
        lines.append(f"- `{e['method']} {e['path']}` → status={e['status']} → Location 见响应头")
    if not summary["redirects"]:
        lines.append("- 未发现")
    lines.append("")

    lines.append("## 5. 业务建模提示\n")
    lines.append("基于以上流量，下一步应：")
    lines.append("1. 根据 `Set-Cookie` 与认证头判断会话机制。")
    lines.append("2. 根据含 ID 路径识别资源对象，构建 IDOR 测试 TODO。")
    lines.append("3. 根据支付/订单/回调/文件类路径识别高价值资产。")
    lines.append("4. 根据重定向与回调路径识别开放重定向/回调伪造测试点。")
    lines.append("5. 对比不同身份下的同一请求，寻找权限边界异常。\n")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Parse HAR for web business modeling")
    parser.add_argument("har", help="Path to HAR file")
    parser.add_argument("-o", "--output", default="har-recon-summary.md", help="Output markdown file")
    args = parser.parse_args()

    with open(args.har, "r", encoding="utf-8") as f:
        har = json.load(f)

    entries_raw = har.get("log", {}).get("entries", [])
    entries = [summarize_entry(e) for e in entries_raw]

    report = build_report(entries)

    with open(args.output, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"[+] Parsed {len(entries)} entries from {args.har}")
    print(f"[+] Report written to {args.output}")


if __name__ == "__main__":
    main()
