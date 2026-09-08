#!/usr/bin/env python3
"""
Android IPC 审计工作区初始化脚本
用法: python init_audit_workspace.py <audit_root_dir> <app_name> <package_name>
示例: python init_audit_workspace.py ./audit_20250619 "OPPO AIWriter" "com.oplus.aiwriter"
"""

import os
import sys
from datetime import datetime


def init_workspace(root_dir: str, app_name: str, package_name: str):
    """初始化审计工作目录结构"""
    
    dirs = [
        "01_recon",
        "02_defense", 
        "03_deepaudit",
        "04_vulns",
        "05_verify",
        "06_poc",
    ]
    
    for d in dirs:
        os.makedirs(os.path.join(root_dir, d), exist_ok=True)
    
    # 创建主索引文件
    index_path = os.path.join(root_dir, "INDEX.md")
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(f"""# {app_name} IPC 审计工作区

## 应用信息

| 属性 | 值 |
|------|-----|
| 应用名称 | {app_name} |
| 包名 | {package_name} |
| 审计时间 | {datetime.now().strftime("%Y-%m-%d %H:%M:%S")} |
| 审计状态 | 进行中 |

## 工作目录

| 阶段 | 目录 | 状态 | 说明 |
|------|------|------|------|
| Phase 1 | `01_recon/` | ⏳ | 攻击面测绘 |
| Phase 2 | `02_defense/` | ⏳ | 防御机制识别 |
| Phase 3 | `03_deepaudit/` | ⏳ | 深度审计与数据流追踪 |
| Phase 4 | `04_vulns/` | ⏳ | 漏洞挖掘与可行性评估 |
| Phase 5 | `05_verify/` | ⏳ | 回溯验证（防幻觉） |
| Phase 6 | `06_poc/` | ⏳ | PoC 验证 |
| 最终 | `FINAL_REPORT.md` | ⏳ | 最终报告 |

## 快速导航

- [攻击面清单](01_recon/attack_surface.md)
- [防御分析汇总](02_defense/)
- [数据流分析汇总](03_deepaudit/)
- [漏洞分析汇总](04_vulns/)
- [验证报告汇总](05_verify/)
- [PoC 汇总](06_poc/)

## 审计日志

| 时间 | 阶段 | 操作 | 备注 |
|------|------|------|------|
| {datetime.now().strftime("%Y-%m-%d %H:%M:%S")} | Init | 初始化工作区 | - |
""")
    
    # 创建空的 attack_surface.md 模板
    attack_surface_path = os.path.join(root_dir, "01_recon", "attack_surface.md")
    with open(attack_surface_path, "w", encoding="utf-8") as f:
        f.write(f"""# {app_name} 攻击面清单

> 生成时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
> 数据来源: AndroidManifest.xml (via jadx-mcp)

## 应用元数据

| 属性 | 值 |
|------|-----|
| 包名 | {package_name} |
| 应用名称 | {app_name} |

## Exported Activity ({count} 个)

| 组件名 | exported | 权限 | Intent Filter | 优先级 | 备注 |
|--------|----------|------|---------------|--------|------|

## Exported Service ({count} 个)

| 组件名 | exported | 权限 | Intent Filter | 优先级 | 备注 |
|--------|----------|------|---------------|--------|------|

## Exported Receiver ({count} 个)

| 组件名 | exported | 权限 | Intent Filter | 优先级 | 备注 |
|--------|----------|------|---------------|--------|------|

## Exported Provider ({count} 个)

| 组件名 | exported | 权限 | grantUriPermissions | 路径权限 | 优先级 | 备注 |
|--------|----------|------|---------------------|----------|--------|------|

## DeepLink / URL Scheme

| Scheme | Host | Path | 对应 Activity | 风险 | 备注 |
|--------|------|------|---------------|------|------|

## 统计汇总

| 优先级 | Activity | Service | Receiver | Provider | 合计 |
|--------|----------|---------|----------|----------|------|
| P0 | 0 | 0 | 0 | 0 | 0 |
| P1 | 0 | 0 | 0 | 0 | 0 |
| P2 | 0 | 0 | 0 | 0 | 0 |
| P3 | 0 | 0 | 0 | 0 | 0 |
""")
    
    print(f"[+] 审计工作区已初始化: {os.path.abspath(root_dir)}")
    print(f"[+] 应用: {app_name} ({package_name})")
    print(f"[+] 目录结构:")
    for d in dirs:
        print(f"    {d}/")
    print(f"[+] 索引文件: {index_path}")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"用法: python {sys.argv[0]} <audit_root_dir> <app_name> <package_name>")
        print(f"示例: python {sys.argv[0]} ./audit_20250619 \"OPPO AIWriter\" com.oplus.aiwriter")
        sys.exit(1)
    
    init_workspace(sys.argv[1], sys.argv[2], sys.argv[3])
