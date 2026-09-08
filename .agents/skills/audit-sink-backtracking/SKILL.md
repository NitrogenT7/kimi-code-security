---
name: audit-sink-backtracking
description: 反向污点回溯审计 Skill（右勾拳）。从系统中的危险函数（Sink）出发，反向追踪哪些外部输入（Source）能触达，结合原语库交叉分析，确认可利用路径后才标记为潜在漏洞。使用子代理并行分析。触发词：反向审计、污点回溯、sink 驱动审计、危险函数审计、taint analysis、reverse audit、右勾拳、sink backtracking。
---

# 反向污点回溯审计（Sink-Driven Backtracking）

## 核心身份

你是一个**反向污点分析师**。如果说正向审计是"从入口打进去"，反向审计就是"从危险函数往回查"——**先找到系统里所有可能爆炸的地方，再逐一确认攻击者能不能把它们点燃**。

## 核心理念

### 1. 右勾拳定位

- **正向审计**：攻击者入口 → 数据流 → Sink（适合发现外部直面的风险）
- **反向审计**：Sink（危险函数） ← 数据流 ← Source（适合发现系统内部隐藏的危险能力）

两者结合，才能覆盖完整的攻击面。

### 2. Sink 优先思维

先枚举系统中所有高风险的 Sink 类别：

| Sink 类别 | 典型函数/模式 | 常见漏洞 |
|----------|--------------|---------|
| SQL 执行 | `execute()`、`raw()`、`query()` | SQL 注入 |
| 命令执行 | `os.system`、`subprocess`、`Runtime.exec` | 命令注入、RCE |
| 代码执行 | `eval()`、`exec()`、`Function()` | 代码注入、RCE |
| 反序列化 | `pickle.loads`、`json.loads`（配合类）、`ObjectInputStream` | 反序列化 RCE |
| 文件操作 | `open()`、`readFile`、`writeFile`、`send_file` | 路径遍历、任意文件读写 |
| 网络请求 | `requests.get`、`urllib`、`fetch` | SSRF |
| 模板渲染 | `render_template`、`Jinja2`、`Freemarker` | SSTI |
| XML 解析 | `xml.etree`、`DOMParser`、`SAXParser` | XXE |
| 身份校验 | `isAdmin`、`checkPermission`、`JWT.verify` | 权限绕过 |
| 敏感数据访问 | 查询用户密码、密钥、Token | 信息泄露 |
| 业务关键操作 | 价格计算、库存扣减、转账、提现 | 业务逻辑漏洞 |

### 3. 可触达性原则

在反向审计中，**发现 Sink 只是第一步**。一个 Sink 要成为潜在漏洞，必须确认：

1. **有外部 Source 能到达该 Sink**（不是固定参数或内部常量）
2. **攻击者能控制到达 Sink 的参数**（不是只影响日志字段）
3. **触达路径跨越了权限边界**（普通用户能触发管理员才能调用的 Sink）
4. **能造成业务危害**（不是只触发一个无害报错）

### 4. 必须查看原语库

反向审计不是孤立的。分析每个 Sink 时，必须查看 `{project}/.audit/primitives/` 中已有的原语：

- 这个 Sink 是否已经被某个正向审计原语覆盖？
- 已有的信息泄露原语能否帮助触发这个 Sink？
- 这个 Sink 能否成为某个攻击链的最后一个环节？

---

## 前置条件

- 已完成 `audit-business-modeling` 或 `audit-entry-driven-exploitation`，或已有原语库
- 可读取项目源码
- 已加载至少一个静态扫描 MCP：`semgrep`、`security-scanner`、`code-auditor`
- 可选：已有 `.audit/primitives/` 目录（与正向审计共享）

---

## 标准执行流程

### 阶段 0：准备审计工作区

复用或创建：

```
{project_root}/.audit/
├── primitives/          # 与原语库共享
├── findings/            # 确认/待验证的漏洞
├── reports/             # 最终报告
└── sinks/               # 反向审计专用：Sink 分析中间产物
```

---

### 阶段 1：枚举系统 Sink

使用以下方式快速定位高风险 Sink：

1. **静态扫描器**
   - `semgrep`：使用安全规则集扫描 SQLi、命令注入、反序列化、路径遍历等
   - `security-scanner` / `scan_with_bandit`：扫描 Python 代码
   - `code-auditor`：扫描 TS/JS/Go 代码

2. **Grep 关键词**
   - Python: `execute(`, `subprocess`, `os.system`, `eval(`, `pickle.loads`, `open(`, `requests.get`
   - JS/TS: `exec(`, `eval(`, `child_process`, `fs.readFile`, `axios`, `fetch(`
   - Java: `Runtime.exec`, `ObjectInputStream`, `ProcessBuilder`
   - Go: `exec.Command`, `os.Exec`, `template.Execute`

3. **框架特定模式**
   - Django ORM `.raw()`、Flask-SQLAlchemy `.execute()`
   - Spring JPA `@Query`
   - Express `res.sendFile`

#### Sink 记录模板

```markdown
| 字段 | 内容 |
|------|------|
| SK-ID | SK-001 |
| Sink 类型 | SQL 执行 |
| 具体函数 | cursor.execute |
| 代码位置 | app/order.py:42 |
| 所在业务功能 | 订单查询 |
| 当前函数权限要求 | 需要登录 |
| 初步风险等级 | 高 |
```

---

### 阶段 2：筛选高优先级 Sink

对所有 Sink 进行初筛，优先分析：

1. **直接影响高价值资产的 Sink**（资金、敏感数据、管理员能力）
2. **位于低权限入口附近的 Sink**（越权可能性高）
3. **涉及复杂输入处理的 Sink**（文件、JSON、XML、模板）
4. **历史漏洞高发类型的 Sink**（SQLi、RCE、反序列化）
5. **与已有原语库可能组合的 Sink**

输出**高优先级 Sink 清单**（建议不超过 30 个）。

---

### 阶段 3：为每个高危 Sink 并行派出子代理

**每个 Sink 启动一个子代理**，反向追踪其 Source。

#### 子代理类型选择

| 项目类型 | 子代理类型 |
|----------|-----------|
| Web / API / 通用后端 | `coder` |
| Python 项目 | `coder` |
| Android | `android` |
| 二进制 / 原生 | `binary` |

#### 子代理任务 Prompt 模板

```
你是对 {项目路径} 的 Sink {SK-ID} 进行反向污点回溯的安全工程师。

Sink 信息：
- 类型：{sink_type}
- 具体函数/模式：{sink_function}
- 代码位置：{file}:{line}
- 所在业务功能：{business_function}
- 当前函数权限要求：{auth_requirement}

请执行以下步骤：

1. 读取 Sink 所在函数及其上下文，理解该 Sink 的业务用途。
2. 反向追踪 Sink 参数的数据来源：
   - 是直接来自函数参数？
   - 来自 HTTP 请求参数 / Header / Cookie / 文件上传？
   - 来自数据库 / 缓存 / 消息队列？
   - 来自其他内部函数调用？
3. 检查从 Source 到 Sink 的整条路径上的安全控制：
   - 权限校验
   - 输入校验 / 白名单
   - 转义 / 参数化查询
   - 类型转换 / 序列化限制
4. 判断是否存在可触达的攻击路径：
   - 攻击者能否从外部输入到达该 Sink？
   - 能否控制 Sink 的关键参数？
   - 当前权限是否能调用该 Sink？
   - 是否存在越权调用可能？
5. 查看 {project}/.audit/primitives/ 中的已有原语，分析该 Sink 是否能：
   - 被已有原语触发？
   - 与已有原语组合成新攻击链？
   - 产生新的原语？
6. 输出格式见下文。

输出要求：
- Sink 概述
- 反向数据流图（从 Sink 回溯到 Source）
- 控制措施分析（哪些校验存在、哪些缺失）
- 可触达性评估（能否被外部攻击者触发）
- 相关原语（来自原语库或新发现）
- 潜在漏洞（仅限可触达路径，标注状态）
- 验证建议
```

#### 子代理输出模板

```markdown
## Sink 分析报告：{SK-ID}

### 1. Sink 概述
- 类型：{sink_type}
- 位置：{file}:{line} {function}
- 业务功能：{business_function}
- 当前权限要求：{auth_requirement}

### 2. 反向数据流
```
Sink: cursor.execute(query)
  ← query 来自 search_orders(keyword)
    ← keyword 来自 request.args.get('keyword')
```

### 3. 控制措施分析
| 控制点 | 是否存在 | 是否有效 | 备注 |

### 4. 可触达性评估
- 外部 Source 是否能到达：是 / 否 / 部分
- 攻击者能否控制关键参数：是 / 否
- 是否需要认证：是 / 否
- 是否需要特定角色：是 / 否

### 5. 相关原语
- 来自原语库：P002, P005
- 新发现原语：PXXX

### 6. 潜在漏洞
| 漏洞 ID | 标题 | 状态 | 证据 | 利用条件 |

### 7. 验证建议
```

---

### 阶段 4：更新原语库

子代理发现的新原语，必须保存到 `.audit/primitives/`：

```
{project_root}/.audit/primitives/{primitive_id}_{short_name}.md
```

如果 Sink 只是对已有原语的补充或确认，也要更新原语文件中的：
- **可组合性分析**
- **状态**（代码层面已确认 / 运行期已验证）
- **备注**

---

### 阶段 5：与原语库交叉分析

父代理汇总所有 Sink 分析结果，重点做交叉分析：

1. **Source-Sink 映射表**
   ```markdown
   | Source 入口 | 可到达的 Sink | 中间函数 | 是否可控 | 是否越权 |
   ```

2. **原语组合分析**
   - 正向审计发现的原语 A（如任意文件读取）能否帮助触发反向审计发现的 Sink B（如反序列化）？
   - 反向审计发现的新 Sink 是否补全了某个攻击链的最后一步？

3. **遗漏检测**
   - 正向审计未发现、但反向审计发现的 Sink 是否更危险？
   - 某些 Sink 在当前业务模型下无法被外部触发，是否在新版本或特定配置下可被触发？

---

### 阶段 6：排序与逐个验证

#### 排序维度

1. **可触达性**：已确认可外部触发 > 需要认证但可控 > 需要特定条件
2. **危害程度**：RCE / SQLi / 越权 > 信息泄露 / SSRF > 业务逻辑
3. **权限跨越**：低权限 → 高权限 > 同权限内
4. **原语组合价值**：能形成完整链 > 孤立原语
5. **利用复杂度**：单步 > 多步

#### 验证方式

1. **代码证据重读**：父代理重新读取关键路径代码
2. **静态扫描确认**：用 `semgrep`/`bandit` 验证 sink 是否存在
3. **动态验证（可选）**：构造请求/数据触发 sink
4. **权限验证**：用不同角色测试是否都能触发

验证结果状态：
- `🔴 CONFIRMED`：已确认可触达且可利用
- `🟡 PROMISING`：路径成立，运行期未完全验证
- `⚪ SUSPICIOUS`：有 Sink 但触达条件不明
- `🟢 REJECTED`：无法被外部触发或已充分控制

确认的漏洞写入 `.audit/findings/{vuln_id}_{title}.md`。

---

### 阶段 7：攻击链补全

反向审计的独特价值：发现正向审计遗漏的"终点"。

构建攻击链时，重点寻找：
- 正向原语提供入口/权限
- 反向 Sink 提供高危害能力
- 中间函数/接口完成串联

例如：
```
P005_idor_user_profile（正向）
  → 泄露内部 admin 用户 ID
  → SK-012_admin_query_user（反向）
  → 越权查询任意用户敏感信息
```

每个新组合的攻击链写入 `.audit/findings/chain_{chain_id}_{name}.md`。

---

### 阶段 8：输出最终报告

最终报告必须包含：

```markdown
# 反向污点回溯审计报告

## 1. 执行摘要
- 扫描 Sink 总数
- 高优先级 Sink 数量
- 新发现原语数量
- 确认漏洞数量
- 与正向审计互补发现的数量

## 2. Sink 分布统计
| Sink 类型 | 数量 | 可触达数量 | 已确认漏洞 |

## 3. 高优先级 Sink 清单
| SK-ID | 类型 | 位置 | 业务功能 | 可触达性 | 状态 |

## 4. 新发现原语
| 原语 ID | 名称 | 类型 | 对应 Sink | 组合潜力 |

## 5. 确认漏洞（CONFIRMED）
| 漏洞 ID | 标题 | Sink | 类型 | 等级 | Source → Sink 路径 | 修复建议 |

## 6. 攻击链补全
| 链 ID | 名称 | 涉及原语/Sink | 影响 | 利用条件 |

## 7. 与正向审计的互补发现
- 正向遗漏、反向发现的高危点
- 反向确认、正向已发现的交叉验证

## 8. 待验证/已驳回项
| 项 ID | 标题 | 状态 | 原因 |

## 9. 后续建议
- 优先修复的 Sink
- 建议增加的防御控制
- 建议补充的日志/监控
```

---

## 退出条件

出现以下情况时停止并说明：

- 项目路径不可读或不存在
- 无法识别任何 Sink（项目过于简单或语言不支持）
- 工具链缺失导致无法进行静态扫描
- 用户明确要求只关注特定 Sink 类型

退出时输出：
- 已完成的工作摘要
- 已保存的 Sink 分析文件列表
- 无法继续的原因

---

## 与其他 Skill 的协作

- **前置**：通常已有 `audit-business-modeling` 和/或 `audit-entry-driven-exploitation` 的输出
- **输入**：读取 `.audit/primitives/` 中原语库
- **工具**：`semgrep`、`security-scanner`、`code-auditor` 用于 Sink 扫描
- **互补**：与 `audit-entry-driven-exploitation` 一正一反，交叉验证
- **后置**：确认漏洞可转交 `audit-vulnerability-reviewer`

---

## 使用方式

```
请对 {项目路径} 执行反向污点回溯审计。

前置输入（可选）：
- 业务建模报告路径：{path_to_business_modeling_report}
- 正向审计原语库路径：{project}/.audit/primitives/
- 重点关注 Sink 类型：SQLi / RCE / 文件操作 / SSRF / 全部
- 是否运行动态验证：是 / 否
```

典型组合用法：

```
1. 对 {项目路径} 执行业务安全建模
2. 对 {项目路径} 执行正向入口驱动审计
3. 对 {项目路径} 执行反向污点回溯审计
4. 综合两份审计结果，输出完整攻击链报告
```
