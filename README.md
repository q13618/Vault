# Vault — 临时文件中转站

把大图、视频、文件丢进来，立刻拿到一条短链接发出去；到了设定的时间，文件和链接一起作废。
默认不需要注册、不需要登录，类似 tmpfiles.org，但界面更干净。

- **短链接**：`https://<域名>/d/ab3k9xm2qp`，够短，微信、短信里都发得出去。
- **直传存储**：文件从浏览器直接传到 Vercel Blob，不经过 Serverless 函数转发，所以几个 G 的视频也传得动（>8 MB 自动走分片上传）。
- **到期即废**：下载入口按到期时间即时拒绝访问，定时任务随后把对象从存储里彻底删除。
- **网页存 PDF**：贴一个网址，远端无头浏览器渲染成 PDF，同样给一条到期作废的短链接。
- **可提前撤回**：上传时会生成一条只有上传者持有的管理链接，点一下即可立即删除。
- **零数据库**：元信息全部编码在对象路径里，不需要 Postgres / Redis，也没有需要备份的状态。

## 运行方式

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 路径编解码、时长与套餐的单元测试
npm run typecheck
npm run build
```

本地要真正传文件，需要先有 Blob 令牌：`vercel env pull`（或把 `BLOB_READ_WRITE_TOKEN`
写进 `.env.local`，字段见 `.env.example`）。没有令牌时首页会提示存储未接上，其余页面照常工作。

## 部署到 Vercel

1. 把仓库导入 Vercel（或用已连接的 Git 项目），framework 自动识别为 Next.js，无需额外构建配置。
2. 在项目的 **Storage** 里创建一个 **Blob** 存储并关联到本项目。平台会自动注入
   `BLOB_READ_WRITE_TOKEN` —— 这是唯一必需的环境变量，**这一步必须手动做一次**，
   否则上传会返回 503。
3. 建议再设一个 `CRON_SECRET`：设了之后定时清理接口只接受带 `Authorization: Bearer <CRON_SECRET>`
   的调用（这个头由 Vercel 自动附加）。不设也能跑 —— 接口会退而校验平台注入的
   `x-vercel-cron-schedule` 头，外部调用者伪造不了它。
4. 重新部署。之后每次推送都会自动构建：推生产分支出生产版本，推其他分支出预览版本。
5. 这是个面向收件人的公开站点，所以项目的 Vercel Authentication（登录墙）需要关掉，
   否则收到链接的人会先被要求登录 Vercel。

`vercel.json` 里已经声明了每小时执行一次的清理任务（`/api/cron/reap`）。

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | 是 | 关联 Blob 存储后由 Vercel 注入 |
| `CRON_SECRET` | 建议 | 保护 `/api/cron/reap`；不设时退回校验 `x-vercel-cron-schedule` |
| `VAULT_ANON_MAX_MB` | 否 | 匿名用户单文件上限（MB），默认 200 |
| `VAULT_CANONICAL_HOST` | 否 | 分享链接使用的规范域名；不设时生产部署自动取 Vercel 的生产域名 |
| `CLOUDFLARE_ACCOUNT_ID` | 网页转 PDF 需要 | Cloudflare 账号 ID |
| `CLOUDFLARE_API_TOKEN` | 网页转 PDF 需要 | 需带 Browser Rendering: Edit 权限 |

## 自定义域名

分享链接越短越好，而且同一个文件不该出现两种链接。所以生成链接时用的是「规范域名」：

1. 设了 `VAULT_CANONICAL_HOST` 就用它；
2. 否则生产部署取 Vercel 注入的 `VERCEL_PROJECT_PRODUCTION_URL` —— 把自定义域名设为生产域名后，
   它就是那个域名，**换域名不用改代码**；
3. 都没有则退回浏览器当前访问的地址（本地开发、预览部署就是这种情况）。

因此绑定域名只需要两步，都在平台侧完成：

1. Vercel 项目 → Settings → Domains → 添加域名（子域名同理）。
2. 按页面提示在 DNS 服务商处加一条记录。子域名是 `CNAME`，值形如
   `cname.vercel-dns-0.com`（**以 Vercel 页面上显示的值为准**，不同账号后缀不同）；
   顶级域名则是 `A` 记录指向 `76.76.21.21`。

域名 Valid 之后重新部署一次，分享链接就会自动换成新域名。

## 存储布局

整个服务的「数据库」就是对象路径本身：

```
f/<id>/<expiresAtSeconds>/<secret>/<manageHash>/<encodedFilename>
```

| 段 | 作用 |
| --- | --- |
| `id` | 出现在分享链接里的 10 位短码。下载时用 `f/<id>/` 做前缀查询即可取回全部元信息 |
| `expiresAtSeconds` | 到期时间。由服务端在签发上传令牌时按套餐校验，改链接改不动它 |
| `secret` | 12 位随机段，只存在于对象路径中、从不出现在分享链接里，因此拿到 `id` 也猜不出 Blob 直链 |
| `manageHash` | 撤回口令的 SHA-256 摘要。口令本身只有上传者持有，别人即使翻出直链也删不掉文件 |
| `encodedFilename` | 原始文件名。只转义会破坏路径或响应头的字符（`% ? # / \\ "` 与控制符），中文、空格、括号原样保留 —— 对象存储按这一段生成 `Content-Disposition`，整体转义会让收件人另存时看到一串 `%E5%81%87` |

额度校验发生在 `app/api/upload/route.ts` 签发令牌的时候：单文件大小上限交给 Blob
服务端强制执行（客户端改不了），保留时长则按当前套餐的上限核对。

## 网页转 PDF

`POST /api/pdf`，请求体 `{ url, ttl }`。流程是：校验地址 → 调渲染服务拿 PDF 字节 →
用**和上传文件完全相同的路径约定**写进 Blob。因此到期作废、提前撤回、短链分享、定时清理
全部自动复用，这条路径没有引入任何新的状态。

渲染实现收在 `lib/render.ts` 的 `PageRenderer` 接口后面，当前实现是 Cloudflare
Browser Rendering（`POST /accounts/<id>/browser-rendering/pdf`）。要换成自建 Chromium
或别家服务，只需在这个文件里加一个实现，调用方不用改。

选它的主要理由是**中文字体**：自建 `@sparticuz/chromium` 只内置 Open Sans，CJK 会渲染成
豆腐块，而且坏掉的字体会被嵌进 PDF 变成永久产物。托管服务没有这个问题。

地址校验在 `lib/url-guard.ts`：只放行 http/https，拒绝回环、内网、链路本地（含云元数据
端点 `169.254.169.254`）与带凭据的地址。需要说明的是，页面是由 Cloudflare 的浏览器抓取的，
不在我们自己的网络里，所以经典 SSRF 并不成立；拦这些地址是因为它们本来也渲染不出东西，
且不想让这个公开入口变成别人的探测工具。

没配 Cloudflare 凭据时，界面上「存网页」页签会说明原因，接口返回 503 —— 不会静默失败。

## 保留时长与套餐

`lib/plans.ts` 是唯一的额度来源，首页的对比表直接读它：

| 档位 | 单文件 | 最长保留 | 状态 |
| --- | --- | --- | --- |
| 免费使用（匿名） | 200 MB | 7 天 | 已开放，无需注册 |
| 注册会员 | 1 GB | 30 天 | 待接入 |
| Plus | 5 GB | 180 天 | 待接入 |
| Pro | 20 GB | 365 天 | 待接入 |

付费档位的额度已经定义好，但账号体系与支付尚未接入。接入后只需让
`resolvePlan()` 读取会话并返回对应套餐，上传校验、界面展示都会自动跟上 —— 其余代码无需改动。

## 已知取舍

- 预览图片 / 音视频时，浏览器最终会拿到 Blob 直链，所以熟悉开发者工具的收件人能看到 `secret`
  那一段。这只影响「绕过到期判断直连文件」，而且对象在到期后会被清理任务删除；
  撤回权限由独立的 `manageHash` 把守，不受影响。
- 清理任务每小时跑一次，过期文件最多会在存储里多留一小时；但下载入口在到期那一刻就已拒绝访问。
- 有登录墙或人机验证的页面渲染不出来 —— Cloudflare Browser Rendering 设计上尊重 bot 防护，
  不做伪装。这类失败会明确报错，而不是给出一张空白 PDF。
- **没有做用量限流。** 上传只消耗存储，而网页转 PDF 会消耗按时长计费的浏览器额度，
  公开运营前建议先在 Vercel 侧加上 WAF / 速率限制。

## 路线图

- [x] 第一步：临时文件上传、短链分享、到期自动作废、提前撤回
- [x] 第二步：把输入的网页地址转成 PDF，同样按临时链接分发
