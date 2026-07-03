# TikTok 爆款脚本分析工作台 Spec v0.1

## 1. 产品定位

交付一个面向小工作室使用的 **TikTok 爆款脚本分析工作台**。

用户输入 TikTok 视频链接、博主主页或关键词后，系统自动完成：

1. 抓取 TikTok 视频数据；
2. 判断视频是否已经存在，避免重复添加和重复分析；
3. 对新视频进行视频解析；
4. 生成脚本拆解、分镜结构、爆点分析和可复刻脚本；
5. 将结果沉淀为视频库、博主库、话题库和脚本资产库。

一句话定位：

> 把 TikTok 视频、博主和话题，自动分析成可复刻的短视频脚本资产。

---

## 2. 交付形态

第一版采用：

```text
Vercel 网页工作台
+ Supabase 数据库
+ Apify TikTok Scraper
+ Gemini / OpenRouter 视频分析
+ Supabase Storage / Cloudflare R2 文件存储
```

各部分职责：

| 模块                               | 作用                      |
| -------------------------------- | ----------------------- |
| Vercel                           | 做网页入口、任务提交、结果展示、接口调用    |
| Supabase                         | 做数据库，负责视频去重、任务状态、分析结果存储 |
| Supabase Storage                 | 存视频文件、关键帧、封面图           |
| Apify                            | 抓取 TikTok 视频、博主、关键词搜索结果 |
| Gemini / OpenRouter              | 分析视频内容，生成脚本拆解结果         |

---

## 3. 核心使用场景

### 场景 1：单条视频分析

用户输入一个 TikTok 视频链接。

系统输出：

* 视频基础数据；
* 视频摘要；
* 前 3 秒钩子；
* 分镜脚本；
* 口播脚本；
* 画面字幕结构；
* 卖点拆解；
* 爆点分析；
* 可复刻脚本。

---

### 场景 2：博主监控

用户输入一个 TikTok 博主主页。

系统定期抓取该博主的新视频。

系统输出：

* 新视频列表；
* 每条视频的数据变化；
* 已分析 / 未分析状态；
* 博主常用脚本套路；
* 值得复刻的视频。

---

### 场景 3：关键词 / 话题分析

用户输入一个关键词或话题。

系统抓取 TikTok 搜索结果中的相关视频。

系统输出：

* 相关热视频；
* 高互动视频；
* 话题下常见脚本结构；
* 高频开头钩子；
* 高频卖点；
* 可复刻脚本模板。

---

## 4. 总体链路

```text
用户输入：视频链接 / 博主主页 / 关键词
  ↓
Vercel 创建任务
  ↓
调用 Apify 抓取 TikTok 数据
  ↓
获得 tiktok_video_id
  ↓
Supabase 查重
  ↓
判断是否需要新增 / 更新 / 复用已有结果
  ↓
新视频进入视频解析流程
  ↓
生成视频分析包
  ↓
调用 Gemini / OpenRouter 生成脚本结果
  ↓
结果写入 Supabase
  ↓
Vercel 页面展示结果
```

---

## 5. 去重逻辑

去重的核心字段是：

```text
tiktok_video_id
```

用户提交的视频链接可能有多种形式：

```text
TikTok 标准链接
TikTok 短链接
分享链接
博主主页下的视频链接
关键词搜索返回的视频链接
```

系统不能直接用用户提交的原始 URL 去重。

正确流程是：

```text
用户提交 URL
  ↓
Apify 解析视频
  ↓
获取真实 tiktok_video_id
  ↓
用 tiktok_video_id 查询 Supabase
```

### 去重判断

#### 情况 1：数据库不存在该视频

处理方式：

```text
新建视频记录
状态 = pending_analysis
进入视频解析流程
```

#### 情况 2：数据库已存在，且已经分析完成

处理方式：

```text
不重新分析
直接返回已有分析结果
避免重复扣费
```

#### 情况 3：数据库已存在，但互动数据过期

处理方式：

```text
只更新播放量、点赞数、评论数、分享数
不重新跑 Gemini 分析
```

#### 情况 4：用户主动点击重新分析

处理方式：

```text
创建新的 analysis_version
重新跑视频解析
保留历史版本
```

---

## 6. 数据状态设计

### 视频状态

| 状态               | 含义      |
| ---------------- | ------- |
| new              | 新发现视频   |
| metadata_fetched | 基础数据已抓取 |
| duplicate        | 已存在视频   |
| pending_analysis | 等待分析    |
| processing_video | 视频处理中   |
| analyzing        | AI 分析中  |
| completed        | 分析完成    |
| failed           | 分析失败    |

### 分析状态

| 状态                | 含义     |
| ----------------- | ------ |
| not_started       | 未开始    |
| extracting_audio  | 提取音频   |
| extracting_frames | 抽关键帧   |
| reading_text      | 识别画面文字 |
| generating_script | 生成脚本   |
| completed         | 完成     |
| failed            | 失败     |

---

## 7. 数据库表设计

### 7.1 videos 视频表

用于保存每条 TikTok 视频的唯一记录。

字段建议：

```text
id
tiktok_video_id
original_url
canonical_url
author_id
author_name
title
description
publish_time
duration
play_count
like_count
comment_count
share_count
collect_count
cover_url
video_file_url
source_type
source_value
analysis_status
last_metric_update_time
created_at
updated_at
```

source_type 示例：

```text
manual_video
creator_monitor
keyword_search
hashtag_search
```

---

### 7.2 analysis_results 分析结果表

用于保存视频脚本分析结果。

字段建议：

```text
id
video_id
analysis_version
model_name
video_summary
video_type
target_audience
hook_0_3s
storyboard
voiceover_script
subtitle_structure
visual_structure
selling_points
viral_points
replicable_script
rewrite_suggestions
created_at
```

---

### 7.3 creators 博主表

用于保存需要监控的博主。

字段建议：

```text
id
creator_url
creator_id
creator_name
category
monitor_frequency
last_fetch_time
status
created_at
updated_at
```

---

### 7.4 keywords 关键词表

用于保存需要监控的话题和关键词。

字段建议：

```text
id
keyword
region
language
fetch_limit
monitor_frequency
last_fetch_time
status
created_at
updated_at
```

---

### 7.5 tasks 任务表

用于记录每一次用户提交或系统定时抓取任务。

字段建议：

```text
id
task_type
input_value
status
related_video_id
related_creator_id
related_keyword_id
error_message
created_at
updated_at
```

task_type 示例：

```text
analyze_video
monitor_creator
search_keyword
refresh_metrics
reanalyze_video
```

---

## 8. 视频解析流程

视频解析分为 6 步。

### 第一步：抓取基础数据

由 Apify 完成。

需要返回：

```text
tiktok_video_id
视频标题
作者信息
发布时间
视频时长
播放量
点赞数
评论数
分享数
收藏数
hashtags
封面图
视频下载链接
字幕，如果有
评论数据，可选
```

这些数据先写入 videos 表。

---

### 第二步：获取视频文件

推荐方式：

```text
Apify 返回视频下载链接
  ↓
系统下载 MP4 文件
  ↓
保存到 Supabase Storage / Cloudflare R2
  ↓
得到稳定的视频文件 URL
```

不要把 TikTok 页面 URL 直接交给 Gemini。

原因：

```text
TikTok 页面 URL 不是稳定的视频文件地址
可能需要页面渲染
可能有跳转
可能受地区限制
可能被平台风控拦截
模型不一定能访问
```

第一版推荐使用：

```text
存储后的 MP4 文件 URL
```

或者：

```text
字幕 + 关键帧 + 元数据
```

---

### 第三步：提取音频与旁白

目标：还原视频里“说了什么”。

输入：

```text
MP4 视频文件
```

输出：

```text
完整旁白文本
分段文本
时间点
语言
语气倾向
```

可选方式：

```text
Gemini
OpenAI Transcribe
Whisper
```

第一版可以优先使用 Gemini 或 OpenAI 转写。

---

### 第四步：抽关键帧

目标：让 AI 理解“画面怎么拍”。

抽帧规则：

```text
视频小于 30 秒：每 2 秒抽 1 帧
视频 30–60 秒：每 3 秒抽 1 帧
最多保留 12 张关键帧
```

每张关键帧保存：

```text
frame_url
timestamp
frame_description
```

---

### 第五步：识别画面文字

目标：识别视频里的屏幕字幕和视觉信息。

需要识别：

```text
屏幕字幕
产品名
品牌名
价格
促销信息
贴纸文字
评论截图文字
对比文字
```

第一版可以直接让 Gemini 读取关键帧图片并输出画面文字。

---

### 第六步：生成视频分析包

最终给 Gemini 的内容建议是：

```text
1. 视频标题
2. 视频描述
3. 作者信息
4. 发布时间
5. 播放量 / 点赞 / 评论 / 分享 / 收藏
6. 视频时长
7. 旁白文本
8. 屏幕字幕
9. 关键帧图片
10. 关键帧时间点
11. 评论区高频内容，可选
12. 视频文件 URL，可选
```

第一版推荐：

```text
旁白文本 + 关键帧 + 画面文字 + 元数据
```

增强版再加入：

```text
完整 MP4 视频文件
评论区分析
历史同类视频对比
```

---

## 9. Gemini 输入方式说明

### 不推荐方式

```text
直接给 Gemini TikTok 页面 URL
```

例如：

```text
https://www.tiktok.com/@xxx/video/123
```

原因：

```text
这只是页面地址
不一定能直接访问视频文件
模型侧可能无法打开
稳定性差
失败率高
```

---

### 推荐方式 1：给 Gemini 视频文件

适合增强版。

流程：

```text
下载 MP4
  ↓
上传到 Gemini File API 或可公开访问的存储
  ↓
把 file_uri / mp4_url 给 Gemini
  ↓
让 Gemini 直接理解视频
```

优点：

```text
画面和声音理解更完整
```

缺点：

```text
成本更高
速度更慢
失败排查更麻烦
```

---

### 推荐方式 2：给 Gemini 视频分析包

适合第一版。

流程：

```text
MP4
  ↓
提取旁白
  ↓
抽关键帧
  ↓
识别画面文字
  ↓
组合元数据
  ↓
交给 Gemini 生成脚本
```

优点：

```text
成本更低
速度更快
结果更稳定
方便复用
方便排查
```

第一版采用该方式。

---

## 10. 脚本分析输出格式

每条视频输出统一结构：

```text
1. 视频基础判断
- 视频类型：
- 目标用户：
- 内容目的：
- 核心卖点：

2. 前 3 秒钩子
- 原始钩子：
- 钩子类型：
- 为什么能留住用户：
- 可复刻写法：

3. 分镜结构
- 0–3 秒：
- 3–8 秒：
- 8–15 秒：
- 15–25 秒：
- 结尾：

4. 口播/字幕结构
- 痛点：
- 解决方案：
- 证明：
- 转化话术：

5. 画面结构
- 人物：
- 产品：
- 场景：
- 镜头：
- 字幕：
- 节奏：

6. 爆点分析
- 情绪点：
- 反差点：
- 视觉点：
- 评论触发点：
- 传播原因：

7. 可复刻脚本
- 标题：
- 开头：
- 中段：
- 结尾：
- 拍摄建议：

8. 改写方向
- 适合行业：
- 适合产品：
- 复刻难度：
- 可复用程度：
```

---

## 11. 页面设计

### 页面 1：任务提交页

用户可以输入：

```text
视频链接
博主主页
关键词 / 话题
```

按钮：

```text
分析视频
添加博主监控
添加话题监控
```

---

### 页面 2：视频库

展示：

```text
视频标题
作者
播放量
点赞数
评论数
分析状态
是否重复
脚本结果入口
更新时间
```

---

### 页面 3：视频分析详情页

展示：

```text
视频基础信息
关键帧
旁白文本
画面文字
脚本拆解
分镜结构
爆点分析
可复刻脚本
```

---

### 页面 4：博主监控页

展示：

```text
博主列表
监控频率
最近抓取时间
新视频数量
已分析数量
高增长视频
```

---

### 页面 5：话题分析页

展示：

```text
关键词列表
抓取数量
热门视频
常见脚本结构
高频卖点
话题脚本模板
```

---

## 12. MVP 范围

第一版必须支持：

```text
1. 单视频链接分析
2. tiktok_video_id 去重
3. Apify 抓取基础数据
4. 视频分析包生成
5. Gemini 生成脚本结果
6. Supabase 存视频和分析结果
7. Vercel 页面展示结果
```

第一版暂不支持：

```text
1. 多客户权限系统
2. 复杂团队协作
3. 自动扣费套餐
4. 评论深度情绪分析
5. 全量历史数据回溯
6. 浏览器插件
7. 完整 SaaS 化后台
```

---

## 13. 第一版验收标准

### 视频去重验收

输入同一个视频的不同链接形式，系统应该识别为同一个视频。

验收结果：

```text
不重复创建视频
不重复调用 Gemini
直接返回已有分析结果
```

---

### 视频分析验收

输入一条新 TikTok 视频链接后，系统应完成：

```text
抓取视频基础信息
生成旁白文本
生成关键帧
识别画面文字
生成脚本拆解
写入数据库
页面可查看结果
```

---

### 博主监控验收

输入一个博主主页后，系统应完成：

```text
抓取博主公开视频
识别新视频
过滤已存在视频
只分析新视频
```

---

### 关键词搜索验收

输入一个关键词后，系统应完成：

```text
抓取相关视频列表
过滤重复视频
保存新视频
生成脚本分析
```

---

## 14. 关键原则

1. 所有视频先拿到 `tiktok_video_id` 再入库。
2. 已分析视频默认不重新分析。
3. 播放量、点赞数、评论数可以定期更新。
4. AI 分析结果支持版本化。
5. TikTok 页面 URL 不直接交给 Gemini。
6. 第一版优先使用“视频分析包”方式分析。
7. 完整 MP4 视频理解作为增强版能力。
8. 抓取只支持公开可访问内容。
9. 第三方 API 费用由客户账号承担。
10. TikTok 平台变化导致抓取失败，需要作为维护边界单独说明。

---

## 15. 最终推荐链路

```text
Vercel 页面提交任务
  ↓
Apify 抓 TikTok 数据
  ↓
获取 tiktok_video_id
  ↓
Supabase 查重
  ↓
已存在：
    返回已有结果 / 更新数据
  ↓
不存在：
    保存视频记录
    下载视频文件
    提取旁白
    抽关键帧
    识别画面文字
    组合视频分析包
    调 Gemini 生成脚本
    保存分析结果
  ↓
Vercel 展示分析结果
```

第一版的技术结论：

```text
Vercel 负责入口和接口
Supabase 负责去重和结果库
Apify 负责 TikTok 抓取
Storage 负责保存视频和关键帧
Gemini 负责视频理解和脚本生成
```
