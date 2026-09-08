# 端点深度分析参考指南

## 目录
- [常见网络框架识别](#常见网络框架识别)
- [请求签名与认证机制识别](#请求签名与认证机制识别)
- [测试导向风险初筛标准](#测试导向风险初筛标准)
- [输出模板参考](#输出模板参考)

---

## 常见网络框架识别

### Retrofit
**识别特征**：
- 接口文件含 `@GET`、`@POST`、`@PUT`、`@DELETE` 注解
- 参数注解：`@Query`、`@Path`、`@Body`、`@Header`、`@Field`
- 初始化代码：`Retrofit.Builder().baseUrl("...")`
- 接口调用：`retrofit.create(XxxApi.class)`

**分析要点**：
- `baseUrl` 的值（常量在 Builder 中或配置文件里）
- 接口方法的路径模板与参数列表
- 是否有统一的 `@Headers` 或 Interceptor 注入认证信息
- `ConverterFactory` 类型（JSON/Protobuf/XML）

### OkHttp
**识别特征**：
- `OkHttpClient.Builder()` 链式配置
- `addInterceptor()` / `addNetworkInterceptor()`
- `CertificatePinner`（证书固定）
- `HostnameVerifier` 自定义实现

**分析要点**：
- Interceptor 中是否注入通用 Header（如 User-Agent、Token、签名）
- 是否配置了自定义 `HostnameVerifier` 或空实现（可绕过证书校验）
- `CertificatePinner` 的 pin 值（用于评估中间人绕过难度）
- 超时配置、重试策略

### Volley
**识别特征**：
- `RequestQueue`、`StringRequest`、`JsonObjectRequest`、`JsonArrayRequest`
- `ImageRequest`、`NetworkImageView`

**分析要点**：
- `RequestQueue` 初始化时的 `baseUrl` 或默认 Host
- 自定义 Request 子类中 `getHeaders()` / `getParams()` 重载
- 请求构造方式（GET/POST 参数拼接）

### 自定义 HttpURLConnection / Apache HttpClient
**识别特征**：
- `HttpURLConnection`、`URL.openConnection()`
- `org.apache.http` 包下的类（旧版 Android）
- `HttpsURLConnection` + `SSLSocketFactory` 自定义

**分析要点**：
- URL 字符串拼接逻辑（常存在硬编码域名 + 动态路径）
- `setRequestProperty()` 设置的 Header 列表
- `getOutputStream()` 写入的 Body 构造逻辑
- 自定义 `TrustManager`（是否空实现导致证书校验失效）

### WebSocket
**识别特征**：
- `WebSocketClient`、`okhttp3.WebSocket`
- `wss://` 或 `ws://` URL

**分析要点**：
- 连接 URL 与握手 Header
- 消息格式（JSON/二进制）
- 心跳机制与重连策略

---

## 请求签名与认证机制识别

### 常见签名算法模式

| 模式 | 代码特征 | 测试意义 |
|------|----------|----------|
| **MD5 参数签名** | `MD5(string1 + string2 + "salt")` / `DigestUtils.md5Hex(...)` | 若 salt 硬编码，可构造合法签名 |
| **HMAC-SHA256** | `Mac.getInstance("HmacSHA256")` + `doFinal(...)` | 密钥位置是关键，硬编码 = 可伪造 |
| **RSA 签名** | `Signature.getInstance("SHA256withRSA")` | 私钥位置是关键，硬编码 = 可伪造 |
| **时间戳防重放** | `System.currentTimeMillis()` / `timestamp` 参数 | 测试时需注意时间窗口 |
| **随机数 (nonce)** | `UUID.randomUUID()` / `nonce` 参数 | 需配合签名一起分析 |

### Token 传递方式

| 方式 | 代码特征 | 测试注意 |
|------|----------|----------|
| **Header Bearer** | `Authorization: Bearer <token>` | Token 获取端点、有效期、刷新机制 |
| **Cookie / Session** | `CookieManager`、`Set-Cookie` | Session 固定攻击、Cookie 作用域 |
| **URL 参数 Token** | `?token=xxx` / `?access_key=xxx` | URL 中传输易被日志/Referrer 泄露 |
| **自定义 Header** | `X-Auth-Token`、`X-Api-Key` | 检查是否与其他应用共享同一 Header 名 |

### 对称/非对称加密传输

| 类型 | 代码特征 | 测试意义 |
|------|----------|----------|
| **AES 加密 Body** | `Cipher.getInstance("AES/...")` | 密钥/IV 是否硬编码或固定 |
| **RSA 加密密钥** | `Cipher.getInstance("RSA/...")` | 公钥是否硬编码、私钥是否泄露 |
| **Base64 编码** | `Base64.encodeToString(...)` | 常与其他加密组合使用，单独使用不构成安全 |

---

## 测试导向风险初筛标准

### 五维评分矩阵

对每一个端点，从以下五个维度评估。每个维度按 **存在风险(1)** / **无明显风险(0)** 打分，总分 0-5。

| 维度 | 判定为风险(1)的条件 | 典型代码特征 |
|------|-------------------|-------------|
| **鉴权绕过可能** | 端点可被未认证访问；Token 在客户端生成/硬编码；签名密钥可提取 | 无 `Authorization` Header、Token=硬编码字符串、签名算法本地可复现 |
| **输入攻击面** | 参数来自用户输入且未明显过滤；拼接进 SQL/命令/URL；反射/动态加载 | `getStringExtra` / `getText()` 直接传入请求参数；字符串拼接构建 URL/SQL |
| **敏感操作暴露** | 端点执行管理员/高权限操作；越权接口直接暴露给客户端 | URL 含 `/admin/`、`/internal/`、`/deleteUser`；参数含 `role=admin` |
| **传输层风险** | 使用 HTTP（非 HTTPS）；证书校验被禁用/可绕过；明文传密码/Token | `http://` URL；空 `TrustManager`；`HostnameVerifier` 恒返回 true |
| **信息泄露** | 错误响应暴露栈轨迹、服务器路径、内部配置；调试接口未关闭 | `printStackTrace` 写入响应；`debug=true` 参数控制详细错误；`/test`、`/debug` 端点 |

### 风险等级判定

| 总分 | 风险等级 | 后端测试优先级 |
|------|----------|--------------|
| 4-5 | **Critical** | 立即测试 |
| 3 | **High** | 优先测试 |
| 2 | **Medium** | 常规测试 |
| 1 | **Low** | 有时间再测试 |
| 0 | **Info** | 记录即可 |

### "建议优先测试" 标注规则

同时满足以下条件的端点，在情报包中标注 **🔴 建议优先测试**：
1. 风险等级 >= **High**（总分 >= 3）
2. 业务价值高：涉及用户数据读写、支付、权限变更、文件上传下载
3. 用户输入可控：至少一个请求参数可来自外部用户输入

---

## 输出模板参考

### API 情报卡片模板

```markdown
## {Endpoint-ID}: {简要功能描述}

### 请求模板
| 属性 | 值 |
|------|-----|
| HTTP 方法 | GET / POST / PUT / DELETE |
| 完整 URL | `https://{host}/{path}` |
| Path 参数 | `{param1}`, `{param2}` |
| Query 参数 | `key1=val1&key2=val2` |
| Header | `Authorization: Bearer {token}`<br>`Content-Type: application/json` |
| Body | `{ "field": "value" }` |

### 认证机制
- **类型**: Bearer Token / HMAC 签名 / Cookie Session / 无
- **Token 获取**: {描述如何获取 Token，如登录接口返回值}
- **签名构造**: {签名算法、参与签名字段、密钥位置}

### 代码证据
- **定义位置**: `{ClassName}.{methodName}` (jadx-mcp 引用)
- **调用位置**: `{CallerClass}.{callerMethod}`
- **关键片段**:
  ```java
  {从源码中提取的关键代码，含参数构造、Header 设置、URL 拼接}
  ```

### 业务功能
{该端点在应用中的具体业务用途}

### 风险初筛
| 维度 | 评分 | 依据 |
|------|------|------|
| 鉴权绕过 | 0/1 | {依据} |
| 输入攻击面 | 0/1 | {依据} |
| 敏感操作 | 0/1 | {依据} |
| 传输层风险 | 0/1 | {依据} |
| 信息泄露 | 0/1 | {依据} |
| **总分** | **{n}/5** | |
| **风险等级** | {Critical/High/Medium/Low/Info} | |
| **优先测试** | {是/否} | {原因} |

### 测试建议
- [ ] {具体测试方向 1}
- [ ] {具体测试方向 2}
```

### 后端渗透测试情报包总览模板

```markdown
# {AppName} 后端渗透测试情报包

## 执行摘要
- **应用名称**: {name}
- **包名**: {package_name}
- **版本**: {version}
- **厂商**: {developer}
- **审计时间**: {datetime}
- **后端域名数**: {n}
- **核心 API 端点数**: {n}
- **建议优先测试数**: {n}

## 后端域名总览
| 域名 | 用途分类 | 协议 | 端口 | 备注 |
|------|----------|------|------|------|
| `{host}` | 核心业务 | HTTPS | 443 | 主 API 网关 |

## 🔴 高价值目标清单（按风险等级排序）

### Critical
| Endpoint-ID | 功能 | URL | 风险总分 | 测试建议摘要 |
|-------------|------|-----|----------|-------------|
| E001 | {功能} | `/{path}` | 5/5 | {摘要} |

### High
| Endpoint-ID | 功能 | URL | 风险总分 | 测试建议摘要 |
|-------------|------|-----|----------|-------------|
| E002 | {功能} | `/{path}` | 3/5 | {摘要} |

## 完整 API 情报表
{汇总所有 API 情报卡片的核心信息为一张大表}

| Endpoint-ID | 方法 | 路径 | 认证 | 风险等级 | 优先测试 |
|-------------|------|------|------|----------|----------|
| E001 | POST | /api/login | 无 | Critical | 🔴 是 |

## 认证机制速查
{汇总所有发现的认证方式，便于测试时快速构造请求}

## 关键代码证据索引
{按 Endpoint-ID 索引，引用 04_decon/ 目录下的详细卡片}

## 测试工具建议
- {如需要 Burp Suite 插件、自定义签名脚本等}
```
