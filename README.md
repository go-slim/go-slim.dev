# go-slim 网站

go-slim.dev 是使用 Astro 构建的双语静态文档站。Astro 在构建阶段生成 HTML，
Pagefind 生成浏览器端搜索索引，Cloudflare Workers Static Assets 负责发布 `dist`
目录。少数动态能力由 Worker 提供，不需要常驻应用服务器。

## 常用命令

| 命令 | 作用 |
| :--- | :--- |
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 启动 Astro 开发服务器 |
| `pnpm check` | 检查 Astro、内容与 TypeScript |
| `pnpm build` | 构建静态站点和 Pagefind 索引 |
| `pnpm preview` | 使用 Astro 预览构建结果 |
| `pnpm preview:cloudflare` | 构建后使用远程 Cloudflare 绑定预览 Worker |
| `pnpm check:deploy` | 构建并对两个 Worker 执行 Wrangler dry-run |
| `pnpm deploy` | 构建并发布主站 Worker |
| `pnpm deploy:gateway` | 发布 Go import 与包文本 Gateway Worker |
| `pnpm deploy:all` | 依次发布主站和 Gateway Worker |

项目要求 Node.js 22.12 或更高版本。

## 发布架构

### 主站 Worker

[`wrangler.jsonc`](./wrangler.jsonc) 将 `dist` 配置为静态资源目录。HTML、CSS、
JavaScript、Pagefind 文件及 WebGPU Worker 均由 Cloudflare Static Assets 直接提供。
配置使用 `drop-trailing-slash`，与 Astro 的 `trailingSlash: "never"` 保持一致。

以下请求会优先进入 [`workers/site.ts`](./workers/site.ts)：

- `/api/ai`：Cloudflare Workers AI 流式推理与当日预算状态；
- `/__llms__/*`：内部包文本路由；
- 静态资源未命中后的 `/<package>/llms.txt`、`llms-full.txt` 和 `SKILL.md`。

`/api/ai` 使用 `@cf/zai-org/glm-4.7-flash`。SQLite Durable Object 会在调用模型前
预留预计 Neurons，并在流结束后按响应 usage 结算。每日额度为 9,000 Neurons，
UTC 00:00 自动重置。浏览器端 WebLLM 模型仍直接从模型分发源下载，不经过本站
Worker。

首次发布前登录并确认 Wrangler 账户：

```sh
pnpm wrangler login
pnpm check:deploy
pnpm deploy
```

发布后，在 Cloudflare Dashboard 中把 `go-slim.dev` 添加为 `go-docs` Worker 的
Custom Domain。Custom Domain 会负责 DNS 与证书；创建前需移除冲突的旧 CNAME。

### Gateway Worker

[`wrangler.gateway.jsonc`](./wrangler.gateway.jsonc) 发布独立的轻量 Gateway，只匹配：

- `/__go_imports__/*`：生成 Go 自定义导入路径的 `go-import`/`go-source` 元数据；
- `/__llms__/*`：代理 GitHub 上最新的包文本并动态生成 `SKILL.md`。

Gateway 与主站分离，避免普通静态页面请求进入运行时代码。Gateway 对成功 GET
响应使用 Cloudflare Cache API 缓存一小时。

```sh
pnpm deploy:gateway
```

Worker Route 不会自动创建 DNS 记录，因此域名必须已接入 Cloudflare 并开启代理。

## Cloudflare 规则

为 `go-slim.dev` 配置两条 URL Rewrite Rules。公开 URL 不会发生跳转，规则只将
内部请求路径改写到 Gateway 路由。

### Go import 发现

```text
Expression:
http.host eq "go-slim.dev"
and any(http.request.uri.args["go-get"][*] == "1")
and not starts_with(http.request.uri.path, "/__go_imports__/")

Path: concat("/__go_imports__", http.request.uri.path)
Query: Preserve
```

例如 `https://go-slim.dev/h3?go-get=1` 会返回：

```html
<meta name="go-import" content="go-slim.dev/h3 git https://github.com/go-slim/h3">
```

嵌套路径仍声明第一个路径片段对应的模块根。

### 包文本与 Skill

```text
Expression:
http.host eq "go-slim.dev"
and not starts_with(http.request.uri.path, "/__llms__/")
and (
  ends_with(http.request.uri.path, "/llms.txt") or
  ends_with(http.request.uri.path, "/llms-full.txt") or
  ends_with(http.request.uri.path, "/SKILL.md")
)

Path: concat("/__llms__", http.request.uri.path)
Query: Preserve
```

`llms.txt` 与 `llms-full.txt` 从 `go-slim/<package>` 仓库的 `main` 分支读取并缓存；
`SKILL.md` 根据包名动态生成。包名必须是单个安全路径片段，但不要求预先登记在站点
内容中，仓库或文件是否存在由 GitHub 上游响应决定。

### Gateway 缓存

添加一条匹配内部路径的 Cache Rule：

```text
http.host eq "go-slim.dev"
and (
  starts_with(http.request.uri.path, "/__go_imports__/") or
  starts_with(http.request.uri.path, "/__llms__/")
)
```

将缓存资格设为 Eligible for cache；对 `200-299` 响应设置 3,900 秒 Edge TTL，
不缓存 `400-599` 响应，并保留查询字符串作为缓存键的一部分。

### WWW 重定向

使用 Cloudflare Single Redirect 将 `www` 规范化到 apex：

```text
Expression: http.host eq "www.go-slim.dev"
Target: concat("https://go-slim.dev", http.request.uri.path)
Query: Preserve
Status: 308
```

## 主要目录

- `content/`：双语博客和类库文档；
- `src/components/`：Astro UI、搜索与本地 AI 助手；
- `src/pages/`：静态双语路由；
- `workers/site.ts`：主站 Static Assets 与 Workers AI 入口；
- `workers/go-import-gateway.ts`：Go import 与包文本 Gateway；
- `workers/ai-budget.ts`：Workers AI 每日预算 Durable Object。

社区讨论请访问 [go-slim Discord](https://discord.gg/wac7vTPXhq)。
