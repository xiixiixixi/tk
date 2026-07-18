# 本地版本架构设计 v0.1

> 本文档记录 **本地版**(完全重做版本)的技术选型、组件、数据模型与抓取流程。
> 与原工程(`README.md` / `Spec.md` / `tech.md` 描述的版本)的关系见 §1.3。

---

## 0. 决策记录(Brainstorming)

| # | 决策点 | 选择 | 理由 |
|---|--------|------|------|
| 1 | 项目范围 | **完整本地版**(全部重做) | 不保留 Apify / Supabase / Railway worker / Gemini / R2 / Next.js web app |
| 2 | 飞书产品形态 | **多维表格 (Bitable/Base)** | 类 Airtable,字段类型丰富,有 OpenAPI,可当数据库 |
| 3 | 使用者范围 | **个人本地使用** | 1 人,tenant_access_token 即可,无需权限隔离 |
| 4 | 数据规模定位 | **不做视频解析** | 用户明确不抓视频、不做 AI 分析;只抓元数据存飞书 |
| 5 | 抓取架构 | **纯扩展 + chrome.debugger / CDP** | 拿 XHR raw response,数据最完整;用户接受顶部"调试条"体验 |
| 6 | 功能范围 | **单视频抓取 + 博主主页批量抓取** | 不做关键词搜索 |

---

## 1. 总体目标与边界

### 1.1 一句话定位

> 用浏览器扩展操控 Chrome 抓 TikTok 视频元数据(单条 / 博主主页批量),直接写入飞书多维表格,数据展示完全靠飞书自带 UI。

### 1.2 做什么

- ✅ 打开 TikTok 视频页面 → 一键抓取元数据(标题/作者/播放量/点赞/评论/分享/收藏/hashtags/发布时间/封面 URL)
- ✅ 打开 TikTok 博主主页 → 一键批量抓取最近 N 条公开视频元数据
- ✅ 写入飞书多维表格(`videos` 表 + `creators` 表)
- ✅ 用 `tiktok_video_id` 自动去重(查询已有则跳过)
- ✅ 飞书自带 UI 浏览/筛选/分组/导出

### 1.3 不做什么

- ❌ **视频文件下载**(用户明确移除)
- ❌ **AI 分析 / Gemini / OpenRouter**(用户明确移除)
- ❌ **本地 web app**(无 Next.js,无 Next.js 部署)
- ❌ **关键词 / 话题搜索抓取**
- ❌ **自动定时监控**(个人手动触发足够)
- ❌ **评论抓取 / 评论分析**
- ❌ **多用户协作**(单用户本地用)
- ❌ **Railway / Vercel / yt-dlp / R2**

### 1.4 与原工程关系

**完全替换**,不复用任何代码。两套独立方案,代码仓库相同(用于管理扩展源码),但 `app/` / `lib/` / `worker/` 在本地版中不再使用。

---

## 2. 总体架构

```
┌─────────────────────────────────────────────────────┐
│  Chrome 浏览器(用户日常使用,已登录 TikTok)          │
│                                                      │
│  ┌──────────────────────────────────────────┐       │
│  │  TikTok 视频页面 / 博主主页(SPA + XHR)   │       │
│  └──────────────────────────────────────────┘       │
│                     ▲                                │
│                     │ CDP(Network.responseReceived)  │
│                     │ + DOM 读取                     │
│  ┌──────────────────┴───────────────────────────┐   │
│  │  Chrome 扩展(TikTok Saver)                  │   │
│  │  ┌─────────────┐  ┌─────────────┐           │   │
│  │  │ background   │  │ content     │           │   │
│  │  │ (SW +       │  │ script      │           │   │
│  │  │  chrome.     │  │ (DOM 辅助)  │           │   │
│  │  │  debugger)   │  │             │           │   │
│  │  └─────────────┘  └─────────────┘           │   │
│  │  ┌─────────────────────────────────┐        │   │
│  │  │ popup.html(触发抓取 / 配置入口) │        │   │
│  │  └─────────────────────────────────┘        │   │
│  └──────────────────────────────────────────────┘   │
│                     │                                │
│                     │ HTTPS(飞书 OpenAPI)            │
└─────────────────────┼────────────────────────────────┘
                      ▼
              ┌───────────────────┐
              │  飞书多维表格       │
              │  videos + creators │
              │  (Bitable/Base)    │
              └───────────────────┘
                      ▲
                      │ 用户查看/筛选/导出
                      │
              ┌───────────────────┐
              │  飞书自带 UI       │
              │  (无需 web app)    │
              └───────────────────┘
```

**没有后端服务,没有数据库,没有云函数,没有队列。** 只有浏览器扩展 + 飞书云。

---

## 3. 浏览器扩展架构

### 3.1 Manifest V3 标准结构

```
tiktok-saver-extension/
├── manifest.json          # MV3 配置
├── src/
│   ├── background/
│   │   └── service-worker.ts    # SW:chrome.debugger 调度、token 管理、写入飞书
│   ├── content/
│   │   └── content-script.ts    # 注入 tiktok.com:DOM 读取、单页元数据兜底
│   ├── popup/
│   │   ├── popup.html           # 触发 UI:抓当前页、抓博主、查看进度
│   │   └── popup.ts
│   ├── options/
│   │   ├── options.html         # 配置页:App ID、App Secret、app_token、table_id
│   │   └── options.ts
│   ├── cdp/
│   │   ├── debugger-client.ts   # chrome.debugger API 封装 + CDP 消息路由
│   │   └── tiktok-parser.ts     # TikTok XHR 响应解析
│   ├── feishu/
│   │   ├── auth.ts              # tenant_access_token 获取/缓存/刷新
│   │   └── bitable.ts           # 多维表格 CRUD 封装
│   └── shared/
│       ├── types.ts             # 抓取到的 VideoRecord / CreatorRecord 类型
│       └── storage.ts           # chrome.storage.local 封装
├── icons/                       # 16/48/128 px
└── README.md
```

### 3.2 Manifest 关键字段

```json
{
  "manifest_version": 3,
  "name": "TikTok Saver",
  "version": "0.1.0",
  "description": "抓 TikTok 视频元数据到飞书多维表格",
  "permissions": [
    "debugger",           // chrome.debugger API 调 CDP
    "storage",            // chrome.storage 存 token / 配置
    "activeTab",          // 当前活动标签页操作
    "tabs",               // 创建/查询标签页
    "scripting"           // 注入 content script
  ],
  "host_permissions": [
    "https://www.tiktok.com/*",
    "https://open.feishu.cn/*"
  ],
  "background": {
    "service_worker": "src/background/service-worker.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://www.tiktok.com/*"],
      "js": ["src/content/content-script.ts"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": "icons/48.png"
  },
  "options_page": "src/options/options.html"
}
```

### 3.3 权限清单的权衡

| 权限 | 是否必要 | 说明 |
|------|---------|------|
| `debugger` | ✅ 必要 | 调 CDP 拿 Network raw body |
| `storage` | ✅ 必要 | 存 token / 配置(App Secret 必须本地) |
| `activeTab` | ✅ 必要 | 抓当前标签页 + 触发 attach |
| `tabs` | ✅ 必要 | 查询标签页 URL / 关闭 |
| `scripting` | ⚠️ 可选 | 手动注入 content script 时需要;若已在 manifest 注册可省 |
| `<all_urls>` | ❌ 避免 | 不申请,只声明 `tiktok.com` + `open.feishu.cn` |

---

## 4. CDP 抓取策略

### 4.1 为什么必须用 chrome.debugger

- TikTok 是 SPA,所有视频元数据通过 XHR 加载(无 SSR 注入的 `__NEXT_DATA__`)
- Chrome MV3 限制了 `chrome.webRequest`(只能观察,不能读 response body)
- `chrome.declarativeNetRequest` 只能做静态规则(不能拦截读取)
- **唯一能拿 raw response body 的路径 = `chrome.debugger` + CDP**

### 4.2 chrome.debugger 的代价(诚实标注)

| 项 | 状况 | 用户体验影响 |
|---|---|---|
| 顶部黄色"Chrome 正在调试此浏览器"提示条 | ⚠️ **必有** | 抓取期间一直显示,顶部 4px 黄条 |
| 每次新标签页需重新 attach | ✅ 处理 | 自动重试,无感 |
| 首次 attach 需用户授权 | ⚠️ **首次 1 次** | 弹"是否允许调试"对话框,选"允许" |
| Chrome 菜单显示"此扩展正在调试" | ✅ 接受 | 始终如此 |
| 部分视频网站检测 CDP 并禁用功能 | ⚠️ 可能 | TikTok 截至 2026-07 未检测,需持续观察 |

### 4.3 attach / detach 生命周期

```
用户点击 popup「抓当前页」
  ↓
popup 发消息给 SW → SW 拿当前 active tab id
  ↓
chrome.debugger.attach({ tabId }, '1.3')
  ↓
chrome.debugger.sendCommand('Network.enable')
chrome.debugger.sendCommand('Page.enable')
  ↓
监听 chrome.debugger.onEvent → 过滤 Network.responseReceived
  ↓
当 URL 匹配 /api/* 或关键路径时,sendCommand('Network.getResponseBody', {requestId})
  ↓
解析 body → 提取元数据
  ↓
抓完主动 detach(关闭标签页或超时 60s)
```

### 4.4 关键拦截 URL 模式(基于 TikTok Web API)

```
# 单条视频页
https://www.tiktok.com/@xxx/video/123
  → 触发 GET https://www.tiktok.com/api/item/detail/?...
  → 响应 JSON 含完整 VideoMeta

# 博主主页
https://www.tiktok.com/@xxx
  → 触发 GET https://www.tiktok.com/api/post/item_list/?...
  → 响应 JSON 含 video 列表

# 搜索(我们不用,但可拦截防止误抓)
https://www.tiktok.com/api/search/...
```

### 4.5 重连与超时

- 标签页导航后需重新 attach(SW 监听 `chrome.tabs.onUpdated`)
- 单次抓取超时 60s,超时强制 detach 防止"黄条卡住"
- 抓取中弹"正在调试"是正常的,**这是本方案的固有代价**

---

## 5. 飞书数据模型(多维表格 schema)

### 5.1 总共 2 张表

由于不做 AI 分析,`analysis_results` / `video_assets` 表被移除。
`tasks` 表被移除(没有 pipeline 状态机需要追踪)。

| 原 Supabase 表 | 新飞书表 | 说明 |
|---------------|---------|------|
| `videos` | `videos`(Bitable) | 视频元数据 |
| `creators` | `creators`(Bitable) | 博主信息 |
| `analysis_results` | ❌ 删除 | — |
| `video_assets` | ❌ 删除 | — |
| `tasks` | ❌ 删除 | — |

### 5.2 videos 表 schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `record_id` | 自动 | 飞书系统字段 |
| `tiktok_video_id` | Text | **去重键**(唯一) |
| `original_url` | URL | 用户提交的 URL |
| `canonical_url` | URL | TikTok 标准化 URL |
| `author_id` | Text | 作者 TikTok user id |
| `author_name` | Text | 作者昵称 |
| `title` | Text | 视频标题/描述 |
| `description` | Text | 长描述 |
| `publish_time` | DateTime | 发布时间 |
| `duration` | Number | 时长(秒) |
| `play_count` | Number | 播放量 |
| `like_count` | Number | 点赞数 |
| `comment_count` | Number | 评论数 |
| `share_count` | Number | 分享数 |
| `collect_count` | Number | 收藏数 |
| `hashtags` | Text | 逗号分隔(飞书不支持数组字段,用文本) |
| `cover_url` | URL | 封面图 URL |
| `source_type` | SingleSelect | `manual_video` / `creator_monitor` |
| `source_value` | Text | 来源 URL(博主主页 URL 等) |
| `fetched_at` | DateTime | 抓取时间 |

### 5.3 creators 表 schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `record_id` | 自动 | 飞书系统字段 |
| `creator_id` | Text | TikTok uniqueId(去重键) |
| `creator_url` | URL | TikTok 主页 URL |
| `creator_name` | Text | 昵称 |
| `follower_count` | Number | 粉丝数 |
| `video_count` | Number | 公开视频数 |
| `last_fetch_time` | DateTime | 最后抓取时间 |
| `notes` | Text | 备注 |

### 5.4 关联关系

- 飞书 Bitable **不支持外键**(原 Supabase 有 FK)
- 替代方案:`videos.source_value` 存博主主页 URL,作为软关联
- 飞书 UI 自带「关联记录」字段类型,但需要 Bitable 升级版;**MVP 用文本 URL 即可**

### 5.5 去重逻辑

飞书无 unique constraint。伪代码:

```typescript
// 写入前先查
const existing = await bitable.search({
  table_id: TABLE_IDS.videos,
  filter: { tiktok_video_id: video.tiktok_video_id }
})
if (existing.length > 0) {
  // 跳过 OR 更新互动数据
} else {
  await bitable.create({ table_id: TABLE_IDS.videos, fields: ... })
}
```

并发风险:同时抓多个视频时,两个请求都"查不到"会重复创建。
**MVP 可接受**;严格一致性需加 lock 或串行化(本方案不实现)。

### 5.6 容量限制

| 项 | 限制 | 影响 |
|---|---|---|
| Bitable 单表行数 | **5000 行(免费版)** | 个人用够,百级博主 × 几十视频不超 |
| 单条 attachment | 一般 100MB | 我们不存视频,不影响 |
| API 调用频率 | 通常 1000 次/分钟/租户 | 个人抓取频率低,远不超 |
| 字段数 | 最多 300 字段/表 | 我们 20 字段,远不超 |

---

## 6. 鉴权流程

### 6.1 飞书自建应用(用户一次性配置)

1. 打开 [open.feishu.cn/app](https://open.feishu.cn/app) → 创建企业自建应用
2. 添加权限:
   - `bitable:app:readonly` / `bitable:app` (多维表格读写)
   - `drive:drive` (云盘,后续若需)
3. 创建版本 → 发布(企业自建通常免审)
4. 获取 `App ID` + `App Secret`
5. 把多维表格分享给应用(打开多维表格 → 右上角「...」→ 添加文档应用 → 选自己的应用)
6. 复制多维表格 URL,从 URL 解析:
   - `app_token`: `https://xxx.feishu.cn/base/{APP_TOKEN}?table={TABLE_ID}`
   - `table_id`: URL 中 `table=` 参数

### 6.2 扩展内配置存储

用户在 options 页面填写:

```
App ID:           cli_xxx
App Secret:       xxx
videos app_token: AAAA
videos table_id:  tblBBB
creators app_token: AAAA  (可与 videos 共用 base)
creators table_id:  tblCCC
```

存到 `chrome.storage.local`(本地加密区),**不上传任何服务器**。

### 6.3 tenant_access_token 获取与缓存

```typescript
// 首次 / 过期时调用
async function getTenantToken(appId: string, appSecret: string): Promise<string> {
  const cached = await chrome.storage.local.get(['token', 'tokenExpiresAt'])
  if (cached.token && cached.tokenExpiresAt > Date.now() + 60_000) {
    return cached.token
  }
  const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  })
  const { tenant_access_token, expire } = await resp.json()
  await chrome.storage.local.set({
    token: tenant_access_token,
    tokenExpiresAt: Date.now() + (expire - 300) * 1000  // 提前 5 分钟刷新
  })
  return tenant_access_token
}
```

- token 有效期 2 小时
- 提前 5 分钟自动刷新
- 401 错误 → 强制重取

---

## 7. 抓取流程

### 7.1 单条视频抓取

```
用户在 TikTok 视频页(如 https://www.tiktok.com/@user/video/123)
  ↓ 点 popup「抓当前页」按钮
popup 发送消息给 SW:{ action: 'fetch_current', tabId }
  ↓
SW:chrome.debugger.attach(tabId)
  ↓
SW:Network.enable,等待 Network.responseReceived
  ↓
检测到 URL 匹配 https://www.tiktok.com/api/item/detail/
  ↓
SW:Network.getResponseBody(requestId)
  ↓
tiktok-parser 提取:
  - id → tiktok_video_id
  - desc → title
  - createTime → publish_time
  - authorMeta.{id, name} → author_id, author_name
  - videoMeta.duration, coverUrl
  - stats.{playCount, diggCount, commentCount, shareCount, collectCount}
  - challenges[].name → hashtags
  ↓
写入飞书 videos 表(先去重)
  ↓
chrome.debugger.detach(tabId)
  ↓
popup 显示「✓ 已写入飞书」
```

### 7.2 博主主页批量抓取

```
用户在 TikTok 博主主页(如 https://www.tiktok.com/@user)
  ↓ 点 popup「抓博主所有视频」按钮 + 选择抓取条数(10/30/50)
popup 发送消息给 SW:{ action: 'fetch_creator', tabId, limit: 30 }
  ↓
SW:chrome.debugger.attach
  ↓
触发页面滚动(可选:content script 模拟 scroll)→ 触发 XHR 翻页
  ↓
监听所有 https://www.tiktok.com/api/post/item_list/ 响应
  ↓
合并多页响应,提取视频列表
  ↓
对每个 video 复用 7.1 的解析逻辑(注意避免重复 attach/detach)
  ↓
批量写入飞书(并发 5 个请求避免限频)
  ↓
chrome.debugger.detach
  ↓
popup 显示「✓ 已写入 28 条新视频」(已自动去重)
```

### 7.3 creator 信息抓取

- 在抓博主主页时,顺便抓 creator 信息(从主页初始 XHR 拿)
- 写入 creators 表(按 creator_id 去重)
- 更新 last_fetch_time

---

## 8. UI 设计

### 8.1 popup(主交互)

**布局**:128px × 320px,3 个主功能 + 1 个配置入口

```
┌────────────────────────────────┐
│  TikTok Saver                  │
├────────────────────────────────┤
│  当前页:                       │
│  🎬 @user/video/123            │
│  [抓取这条视频]                │
├────────────────────────────────┤
│  或输入 TikTok URL:            │
│  [_________________]           │
│  [抓取]                        │
├────────────────────────────────┤
│  博主主页:                     │
│  @user  (28 个公开视频)        │
│  抓取: [10] [30] [50]          │
│  [批量抓取]                    │
├────────────────────────────────┤
│  最近: ✓ 5 条已写入 10s 前     │
│  [⚙ 配置]  [📊 打开飞书]       │
└────────────────────────────────┘
```

### 8.2 options 页面(配置)

- App ID / App Secret 输入框(密码字段)
- 飞书多维表格 app_token / table_id 输入(videos + creators)
- 「测试连接」按钮 → 调一次 list records 验证 token 和表 ID
- 「清空缓存」按钮

### 8.3 状态反馈

- popup 顶部状态条:`空闲 / 抓取中 / 写入中 / 完成 / 错误`
- 错误分类显示:鉴权失败 / API 限频 / 抓取超时 / 解析失败
- `chrome.notifications` API:批量抓取完成时桌面通知

---

## 9. 风险与局限

| 风险 | 严重度 | 应对 |
|------|--------|------|
| **Chrome 顶部"正在调试"条** | 中 | 用户已接受;提供 popup「detach」按钮主动关 |
| **TikTok 反爬升级** | 高 | chrome.debugger 在 Chrome 内部走 CDP,目前未检测;持续观察,有变化需重构 |
| **飞书 API 限频** | 低 | 个人用远低于 1000 次/分钟限制 |
| **飞书 5000 行/表上限** | 中 | 个人用不到;超限后用户可手动归档老记录,或升级飞书套餐 |
| **批量抓博主网络不稳定** | 中 | 进度保存到 chrome.storage.local,断网可恢复 |
| **TikTok 登录态过期** | 中 | 提示用户「请在 TikTok 重新登录」,扩展不存 cookie |
| **CDP 协议版本变化** | 低 | 锁 `1.3` 版本,Chrome 升级需重新测试 |
| **App Secret 存扩展** | 中 | chrome.storage.local 在用户机器本地,不加密但仅本机可读;不申请同步权限 |

---

## 10. Phase 计划

| Phase | 内容 | 验证 |
|-------|------|------|
| **1** | 脚手架:Chrome 扩展 MV3 骨架 + manifest + popup 空壳 + options 空壳 + GitHub Actions 打包 | 能加载到 chrome://extensions |
| **2** | CDP 抓取:实现 chrome.debugger attach + Network.responseReceived 监听 + tiktok-parser 解析 item/detail API | 控制台手动测试能拿到 JSON |
| **3** | 飞书接入:实现 auth + bitable CRUD + options 配置页 + 测试连接 | 选项填好 + 能在飞书看到测试记录 |
| **4** | 单条视频抓取流程:popup → SW → CDP → 解析 → 写入飞书 | 实际抓一条视频,飞书出现一行 |
| **5** | 博主批量抓取:item_list API + 滚动 + 批量写入 + 去重 + 进度通知 | 实际抓一个博主,飞书出现 N 行 |
| **6** | 收尾:错误处理 / README / 打包脚本 / chrome 商店上架材料 | 扩展可安装、可发布 |

---

## 11. 关键文件清单(实施时建立)

```
tiktok-saver-extension/
├── manifest.json
├── src/
│   ├── background/service-worker.ts    (Phase 1)
│   ├── content/content-script.ts       (Phase 1)
│   ├── popup/popup.html, popup.ts      (Phase 1, 4, 5)
│   ├── options/options.html, options.ts (Phase 3)
│   ├── cdp/debugger-client.ts          (Phase 2)
│   ├── cdp/tiktok-parser.ts            (Phase 2)
│   ├── feishu/auth.ts                  (Phase 3)
│   ├── feishu/bitable.ts               (Phase 3)
│   └── shared/types.ts, storage.ts     (Phase 1)
├── icons/{16,48,128}.png
├── README.md
├── package.json                        # vite-plugin 或类似打包
└── tsconfig.json
```

技术栈建议:**TypeScript + Vite + `@crxjs/vite-plugin`**(MV3 扩展的标准现代方案)。

---

## 12. 后续不做的事(明确边界)

以下功能即使容易做,本期也不做(避免范围蔓延):

- 评论抓取(需要额外 API 调用,且价值不高)
- 视频文件本地保存 / 下载(用户明确不要)
- 自动定时抓取(个人手动够用)
- 多用户 / 团队协作(单用户足够)
- 飞书以外的存储(Notion / Airtable 等)(避免分散精力)
- Chrome 之外的浏览器(Firefox / Edge)(Edge 已兼容 MV3,后续可加;Firefox 暂缓)
- Chrome 商店发布(Phase 6 才准备材料)

---

## 附录 A:CDP 协议基础

`chrome.debugger.sendCommand(target, method, params)` → 返回 `Promise<result>`

`chrome.debugger.onEvent` 事件流:
- `Network.responseReceived` → `{ requestId, response: { url, status, ... } }`
- `Network.getResponseBody` → `{ body, base64Encoded }`

TikTok 关键 endpoint(基于 2026-07 观察):
- 单视频详情:`https://www.tiktok.com/api/item/detail/?itemId=...`
- 博主视频列表:`https://www.tiktok.com/api/post/item_list/?uniqueId=...&count=...&cursor=...`
- 博主信息:`https://www.tiktok.com/api/user/detail/?uniqueId=...`

URL 模式匹配用正则:`/^https:\/\/www\.tiktok\.com\/api\/(item\/detail|post\/item_list|user\/detail)\//`

---

## 附录 B:飞书 Bitable OpenAPI 端点速查

```
POST /open-apis/auth/v3/tenant_access_token/internal   拿 token
GET  /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records   列记录
POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records   增记录
GET  /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/{record_id}   查单条
PUT  /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/{record_id}   改记录
```

---

> **本文档下一步**:实施前应先创建 Phase 1 脚手架,验证 Chrome 扩展能加载。完成后回到此文档更新 Phase 状态。