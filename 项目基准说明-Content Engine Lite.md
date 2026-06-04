# Content Engine Lite 项目基准说明

版本基准：v0.1.1  
文档日期：2026-06-02  
项目路径：`D:\下载\content-engine`

本文档用于后续全面升级前的基准说明。它记录当前程序的产品定位、完整功能、程序框架、数据结构、运行路径、交付边界和升级注意事项。后续做大版本重构时，应先对照本文确认哪些能力必须保留。

## 1. 项目定位

Content Engine Lite 是一个本地运行的多站点 AI 内容生产工作台，用于把站点资料、关键词规划、Project 指令、文章策略、大纲生成、正文生成、QA 检查、HTML 美化、图片配置、发布包和 WordPress 草稿发布组织成一条可操作的生产流程。

当前项目不是成熟 SaaS，不是多用户云平台，也不是无人值守全自动发布系统。它的默认使用方式是：AI 生成内容，人工检查质量，再导出或发布为 WordPress 草稿。

核心目标：

- 支持多个网站独立管理内容生产资料。
- 支持 C端/DTC 内容站和 B端/外贸/制造站两种运营逻辑。
- 把文章生产拆成“大纲 → 正文 → QA → HTML 美化 → 图片 → 发布包 → WordPress 草稿”的可审查流程。
- 所有真实业务数据保存在本地 `sites/` 下，release 包不包含真实站点数据。

## 2. 当前程序搭建路径

### 2.1 本地项目路径

当前开发与使用目录：

```text
D:\下载\content-engine
```

### 2.2 启动方式一：Windows 双击启动

适合非技术使用者。

```text
双击 start-windows.bat
```

启动脚本会：

- 检查 Node.js 和 npm 是否可用。
- 首次运行时自动执行 `npm install`。
- 如果 `.env` 不存在，会从 `.env.example` 复制一份。
- 启动本地服务。
- 打开 `http://127.0.0.1:3000`。
- 在 `runtime/content-engine.pid` 记录启动进程。

停止方式：

```text
双击 stop-windows.bat
```

或关闭启动窗口。

### 2.3 启动方式二：命令行启动

适合开发者。

```powershell
cd /d D:\下载\content-engine
npm install
npm start
```

打开：

```text
http://127.0.0.1:3000
```

### 2.4 测试与打包

基础冒烟测试：

```powershell
npm run smoke
```

生成交付包：

```powershell
npm run build-release
```

输出：

```text
D:\下载\content-engine\release\Content-Engine-Lite-v0.1.1.zip
```

## 3. 程序框架

### 3.1 技术栈

- 后端：Node.js + Express
- 前端：原生 HTML/CSS/JavaScript 单页应用
- 数据存储：本地文件系统
- 表格处理：CSV、XLSX
- 发布资料表：Excel `meta-table.xlsx`
- 打包：Node 脚本 + zip
- AI 模型接口：Anthropic 格式、OpenAI compatible、小米 MiMo compatible、Gemini 辅助模型

### 3.2 主程序入口

```text
main.js
```

职责：

- 创建 Express 应用。
- 托管 `ui/` 静态前端。
- 挂载 `/api` 后端路由。
- 默认监听 `127.0.0.1:3000`。
- 打印当前已有站点列表。

### 3.3 核心目录结构

```text
content-engine/
├── main.js
├── engine/
│   ├── api.js
│   ├── config-loader.js
│   ├── keyword-store.js
│   ├── task-queue.js
│   ├── prompt-builder.js
│   ├── generator.js
│   ├── splitter.js
│   ├── cleaner.js
│   ├── qa.js
│   ├── meta-writer.js
│   └── link-matcher.js
├── ui/
│   └── index.html
├── templates/
│   ├── article-types.json
│   ├── prompt-sections.json
│   ├── qa-rules.json
│   ├── common/
│   └── b2b/
├── sites/
│   └── [siteId]/
├── examples/
├── docs/
├── scripts/
├── release/
├── runtime/
├── site-recycle-bin/
├── start-windows.bat
├── stop-windows.bat
├── package.json
└── .env.example
```

### 3.4 后端模块职责

| 文件 | 主要职责 |
|---|---|
| `engine/api.js` | 所有 API 路由、站点管理、导入、生成、发布、图片、数据包、WordPress、HTML 美化 |
| `engine/config-loader.js` | 加载站点配置、校验必需文件、读取模板、构建链接索引、区分 B2C/B2B |
| `engine/keyword-store.js` | 读取和写入 `keywords.csv`，维护任务状态覆盖层 `queue-state.json` |
| `engine/task-queue.js` | 批量生成队列、并发控制、状态回调 |
| `engine/prompt-builder.js` | 构建大纲 Prompt、正文 Prompt、C端/B端写作角色、输出格式约束 |
| `engine/generator.js` | 调用文本生成模型，支持续写与不同兼容接口 |
| `engine/splitter.js` | 解析模型输出中的 HTML 和 META JSON |
| `engine/cleaner.js` | 清洗 HTML，移除危险或无效内容，保证 `<article>` 结构 |
| `engine/qa.js` | 内容质检、关键词覆盖、品牌禁用词、B2B 防编造、评分 |
| `engine/meta-writer.js` | 写入 `meta-table.xlsx`，包括 SEO、ALT、Schema、QA 等 sheet |
| `engine/link-matcher.js` | 根据关键词、手动目标和内链库匹配内链 |

## 4. 数据存储与站点资料契约

### 4.1 真实数据存储位置

每个站点的数据在：

```text
sites/[siteId]/
```

每个站点一套独立文件：

```text
sites/[siteId]/
├── site.json
├── author.json
├── knowledge.json
├── links.json
├── style-reference.json
├── project-instructions.md
├── keywords.csv
└── outputs/
```

### 4.2 必需文件说明

| 文件 | 作用 |
|---|---|
| `site.json` | 网站基础变量、域名、语言、定位、受众、写作风格、WordPress 配置、B2B/B2C 类型 |
| `author.json` | C端为作者档案；B端为团队/公司可信度档案 |
| `knowledge.json` | C端为品类知识；B端为产品、行业、工艺、认证、案例、采购 FAQ |
| `links.json` | 内链库，包含专题页、分类页、产品页、博客页、信任页；B端扩展解决方案页、行业页、认证页等 |
| `style-reference.json` | 样式参考和 HTML 美化规则 |
| `project-instructions.md` | 站点级 Project 指令，类似 Claude Project Instructions |
| `keywords.csv` | 关键词任务表 |
| `outputs/` | 生成结果、QA、发布包、图片、状态文件、元数据表格 |

### 4.3 输出文件

典型输出包括：

```text
sites/[siteId]/outputs/
├── queue-state.json
├── [slug].outline.json
├── [slug].html
├── [slug].polished.html
├── [slug].qa.json
├── [slug].polished.qa.json
├── [slug].data-pack.json
├── [slug]-data-pack.json
├── meta-table.xlsx
└── images/[slug]/
```

说明：

- `queue-state.json` 存放任务状态，不直接污染 `keywords.csv`。
- `[slug].html` 是基础文章版本。
- `[slug].polished.html` 是美化格式版本。
- `meta-table.xlsx` 是 SEO、ALT、Schema、QA、发布信息的汇总表。
- `data-pack` 是单篇文章的完整生产数据包。

## 5. 当前完整功能清单

### 5.1 多站点管理

当前程序支持：

- 站点下拉切换。
- 当前站点独立读取 `sites/[siteId]/` 数据。
- 新建 C端/DTC 站点。
- 新建 B端/外贸/制造站点。
- 老站点没有 `siteType` 时默认按 C端处理。
- 站点资料隔离，导入中心写入当前选中站点。
- 删除站点时进入 `site-recycle-bin/`，不是直接物理删除。
- 删除需要两重确认：
  - 浏览器确认。
  - 输入 `DELETE [siteId]`。
- 删除记录写入 `.recycle-info.json`。

### 5.2 内容任务页

内容任务页是主生产控制台，包含：

- 统计概览：总计、已完成、待生成、失败。
- 任务筛选：
  - 全部
  - 待生成
  - 大纲完成
  - 文章完成
  - 失败
- 搜索：关键词、slug、Blog ID。
- 关键词任务表。
- 行内编辑：
  - 关键词
  - URL Slug
  - 优先级
  - 文章类型
- 显示字段：
  - 目标字数
  - 搜索量
  - KD
  - Blog ID
  - 状态
  - QA 分
- 多选与全选。
- 批量操作：
  - 生成已选大纲
  - 生成已选文章
  - 美化已选文章
  - 发布已选到 WordPress
  - 重置已选
  - 取消选择
- 单行操作：
  - 打开文章工作台
  - 生成大纲
  - 生成文章
  - 删除关键词
- 新增关键词表单。
- 并发数滑块。
- 运行进度条。
- 实时运行日志。
- 日志折叠与清空。

### 5.3 大纲生成

大纲生成是正式写文章前的第一步。

功能：

- 对单篇关键词生成大纲。
- 对已选关键词批量生成大纲。
- 大纲保存在 `outputs/[slug].outline.json`。
- 大纲会结合：
  - 关键词行
  - 文章类型策略
  - 站点资料
  - 内链库
  - Project 指令
  - B2C/B2B 类型
- 大纲中包含文章结构、章节、关键词覆盖计划、内链建议、FAQ、CTA、QA 风险等。

### 5.4 正文生成

正文生成基于已生成大纲。

功能：

- 单篇按大纲生成文章。
- 批量对已选任务生成文章。
- 如果没有大纲，程序会提示先生成大纲。
- 输出基础 HTML 版本：`outputs/[slug].html`。
- 生成后自动进行 QA 检查。
- 生成后更新状态、字数、QA 分。
- 模型输出需要包含 HTML 与 META JSON 分隔标记。
- 支持模型续写与输出拆分。

### 5.5 HTML 美化格式

当前程序把内容质量和排版美化拆开处理。

功能：

- 基础版文章先保证内容逻辑。
- 美化格式作为独立步骤执行。
- 支持单篇美化。
- 支持勾选批量美化。
- 美化结果保存为 `outputs/[slug].polished.html`。
- 保留基础版，不覆盖原始文章。
- 工作台可在基础版、美化版、自动版之间切换。
- 美化规则读取站点 `style-reference.json`。
- 美化调用 Gemini 辅助模型；失败时有校验和回退逻辑。
- 美化后会生成独立 QA：`[slug].polished.qa.json`。

### 5.6 QA 检查

QA 模块用于判断文章是否达到发布前标准。

检查范围：

- 是否存在 `<article>`。
- 字数是否达标。
- H1 是否存在。
- H1 是否包含关键词。
- 是否包含禁用表达。
- 是否残留占位符、TODO、编辑标记。
- 是否有作者/团队可信度模块。
- 是否有 CTA。
- 是否有内链。
- 是否有 Schema。
- Meta Description 是否存在且不过长。
- 关键词覆盖：
  - 主关键词
  - 次要关键词
  - 变体/长尾词
- 品牌匹配。
- 内容有用性。
- 可读性。
- 发布就绪度。

B2B 额外硬性检查：

- 不得编造认证。
- 不得编造工厂规模、产能、设备、出口市场。
- 不得编造客户案例和项目结果。
- 不得无来源写精确交期、MOQ、价格、运输条款。
- 必须有采购导向 CTA。
- 必须有公司/团队可信度模块。
- 不得使用 C端消费品式夸张话术。

### 5.7 文章工作台

点击任务行的工作台按钮后打开文章工作台。

工作台包含：

- 大纲预览。
- 文章预览。
- HTML 源码。
- QA 检查。
- 发布包。
- 图片配置。
- 数据包。

顶部操作：

- 美化格式。
- 复制 HTML。
- 下载 HTML。
- 发布 WP 草稿。
- 关闭。

文章预览支持：

- 基础版。
- 美化版。
- 自动版。
- 翻译成中文查看。
- 切回英文原文。

### 5.8 发布包

发布包用于人工发布或 WordPress 发布前检查。

内容包括：

- 文章 HTML。
- SEO 标题三选。
- Meta Description。
- Focus Keyword。
- 图片 ALT 建议。
- Schema JSON-LD。
- 发布前检查清单。
- B2B CTA 信息。
- B2B 发布元数据。
- 发布状态准备信息。

检查清单通常包括：

- H1 包含核心关键词。
- 内链数量合理。
- 作者/团队模块存在。
- Meta Description 不超过 155 字符。
- Schema JSON-LD 已准备。
- B2B 文章是否包含 RFQ/联系/下载目录等采购 CTA。

### 5.9 数据包

数据包用于追踪单篇文章从关键词到发布的完整生产资料。

包含：

- 站点 ID。
- slug。
- 关键词任务行。
- 大纲。
- 基础 HTML 状态。
- 美化 HTML 状态。
- QA 结果。
- 美化 QA 结果。
- 发布包摘要。
- 图片计划。
- 文章变体信息。
- 可复制的发布包 JSON。
- 可复制的完整 data-pack JSON。

### 5.10 图片配置

图片模块用于为文章配置封面图和正文插图。

功能：

- 根据文章字数和结构生成默认图片槽。
- 默认包含封面图。
- 长文按比例生成正文插图槽。
- 每个图片槽包含：
  - 图片类型
  - 推荐位置
  - 推荐场景
  - AI 生图提示词
  - ALT 文本
  - 上传状态
- 支持上传图片。
- 支持调用 Gemini Vision 生成 ALT。
- 支持手动编辑 ALT。
- 支持把图片按推荐位置插入文章 HTML。
- 图片文件存放在 `outputs/images/[slug]/`。

### 5.11 WordPress 草稿发布

当前程序支持把文章发布到 WordPress 草稿。

功能：

- 单篇发布到 WordPress。
- 勾选批量发布到 WordPress。
- 默认发布状态建议为 `draft`。
- 支持从 `site.json` 读取 WordPress 配置。
- 支持标题、slug、HTML 内容、SEO meta、Schema 等发布数据。
- 不建议自动正式发布，仍需人工审核。

WordPress 配置字段通常包括：

- endpoint / siteUrl
- username
- applicationPassword
- defaultStatus
- category
- tags

### 5.12 站点资料库

站点资料库是每个站点的数据中台。

通用子模块：

- 品牌设置 / 公司设置。
- 作者档案 / 团队档案。
- 品类知识 / 产品与行业知识。
- 内链库 / 产品解决方案内链库。
- 样式参考。
- Project 指令。

C端主要维护：

- 品牌定位。
- 目标受众。
- 品牌角色。
- 转化目标。
- 写作语气。
- 必须表达。
- 禁止表达。
- 作者姓名、职位、背景、写作风格。
- 作者故事素材库。
- 术语表。
- 权威事实。
- 买家高频问题。
- 专题页、分类页、产品页、博客页、信任页。

B端主要维护：

- 公司定位。
- 商业模式。
- 目标市场。
- 目标行业。
- 买家角色。
- 核心产品。
- 核心能力。
- 认证。
- 质控信息。
- MOQ 政策。
- 交期政策。
- 团队档案。
- 工厂/工程/质检/出口经验。
- 产品线。
- 材料、规格、工艺。
- 质量控制、认证。
- 应用场景、行业。
- 采购 FAQ、技术 FAQ。
- 案例、卖点、合规边界。
- 解决方案页、行业页、应用页、案例页、认证页、联系页、下载页。

### 5.13 样式参考

样式参考用于 HTML 美化，而不是基础文章质量控制。

可配置内容：

- 文章根 class。
- class 前缀。
- FAQ 结构。
- CTA 结构。
- 排版组件规则。
- 禁止项。
- 参考 HTML / 示例块。

用途：

- 指导美化模块改造 HTML 结构。
- 让文章更接近目标网站风格。
- 保持基础文章和美化文章分离。

### 5.14 Project 指令

Project 指令是站点级写作总规则。

用途：

- 写作身份。
- 品牌 SOP。
- 禁止词。
- 允许表达。
- 内链规则。
- 关键词规则。
- 文章结构规则。
- E-E-A-T 规则。
- 发布检查清单。
- B2B 证据边界。

它是 prompt-builder 的重要输入，但不应破坏程序要求的机器输出格式。

### 5.15 导入中心

导入中心用于把外部资料转换成程序可用文件。

功能：

- 上传单个文件。
- 上传 ZIP。
- 识别文件类型。
- AI/规则辅助识别归属模块。
- 显示 AI 识别结果。
- 展示字段映射。
- 勾选要写入的文件。
- 写入当前站点。
- 显示写入记录。
- 显示必需文件完成状态。
- 支持站点隔离提醒，避免串站点数据。

支持或计划兼容的资料类型：

- JSON
- CSV
- XLSX
- DOCX
- Markdown
- TXT
- ZIP

可映射目标：

- `site.json`
- `author.json`
- `knowledge.json`
- `links.json`
- `style-reference.json`
- `project-instructions.md`
- `keywords.csv`
- 模板类文件

### 5.16 设置

设置页包含：

- 文章模型配置。
- Gemini 辅助模型配置。
- WordPress 配置。
- 默认策略入口。

文章模型支持：

- 小米 MiMo / token plan compatible endpoint。
- Anthropic compatible。
- OpenAI compatible。
- 自定义 endpoint。
- 自定义 model name。
- max tokens。
- timeout。

Gemini 辅助模型用途：

- 中文预览翻译。
- 图片理解与 ALT 生成。
- HTML 美化格式。

默认策略入口：

- C端默认策略。
- B端默认策略。
- 通用基础策略。

### 5.17 模板策略

当前模板目录：

```text
templates/
├── article-types.json
├── prompt-sections.json
├── qa-rules.json
├── common/
│   ├── article-types.json
│   ├── prompt-sections.json
│   └── qa-rules.json
└── b2b/
    ├── article-types.json
    ├── prompt-sections.json
    └── qa-rules.json
```

模板加载顺序：

1. 全局 fallback 模板。
2. `templates/common/` 通用模板。
3. 根据 `site.siteType` 加载类型模板。
4. 站点级 `sites/[siteId]/templates/` 覆盖。

文章类型策略包含：

- C端：
  - buying-guide
  - price-guide
  - comparison
  - faq
  - how-to
  - pillar
  - listicle
- B端：
  - product-category-guide
  - application-guide
  - industry-solution
  - manufacturing-process
  - materials-specs
  - standards-certification
  - supplier-comparison
  - case-study
  - procurement-faq
  - pillar

## 6. API 路由框架

所有 API 挂载在：

```text
/api
```

### 6.1 站点管理

```text
GET    /api/sites
POST   /api/sites
POST   /api/sites/create
DELETE /api/sites/:siteId
```

### 6.2 配置文件

```text
GET  /api/sites/:siteId/config/:file
POST /api/sites/:siteId/config/:file
GET  /api/sites/:siteId/project-instructions
POST /api/sites/:siteId/project-instructions
GET  /api/sites/:siteId/files
PUT  /api/sites/:siteId/files/:fileName
```

### 6.3 模板策略

```text
GET    /api/templates/:file
POST   /api/templates/:file
DELETE /api/templates/:file
```

### 6.4 关键词任务

```text
GET    /api/sites/:siteId/keywords
POST   /api/sites/:siteId/keywords
PUT    /api/sites/:siteId/keywords/:slug
DELETE /api/sites/:siteId/keywords/:slug
POST   /api/sites/:siteId/keywords/import
GET    /api/sites/:siteId/keywords/export
POST   /api/sites/:siteId/reset
```

### 6.5 导入中心

```text
POST /api/sites/:siteId/import-preview
POST /api/sites/:siteId/import-files
POST /api/sites/:siteId/setup-preview
POST /api/sites/:siteId/setup-apply
```

### 6.6 生成与美化

```text
POST /api/sites/:siteId/outline/:slug
POST /api/sites/:siteId/generate-article/:slug
POST /api/sites/:siteId/generate/:slug
POST /api/sites/:siteId/run
POST /api/sites/:siteId/polish/:slug
POST /api/sites/:siteId/polish
```

### 6.7 文章工作台读取

```text
GET /api/sites/:siteId/outlines/:slug
GET /api/sites/:siteId/articles/:slug
GET /api/sites/:siteId/qa/:slug
GET /api/sites/:siteId/publish-pack/:slug
GET /api/sites/:siteId/data-pack/:slug
```

### 6.8 图片配置

```text
GET  /api/sites/:siteId/image-plan/:slug
POST /api/sites/:siteId/image-plan/:slug
POST /api/sites/:siteId/image-plan/:slug/upload
POST /api/sites/:siteId/image-plan/:slug/alt
POST /api/sites/:siteId/image-plan/:slug/insert
GET  /api/sites/:siteId/article-images/:slug/:file
```

### 6.9 翻译、发布、导出

```text
POST /api/translate-preview
POST /api/sites/:siteId/publish-wordpress/:slug
GET  /api/sites/:siteId/export
GET  /api/sites/:siteId/meta-table
GET  /api/pipeline
```

## 7. 内容生产流程

当前核心流程：

```text
选择站点
  ↓
维护站点资料库
  ↓
导入或维护关键词任务
  ↓
生成大纲
  ↓
人工查看大纲
  ↓
按大纲生成文章
  ↓
QA 检查
  ↓
HTML 美化格式
  ↓
图片配置与 ALT
  ↓
查看发布包和数据包
  ↓
下载 / 导出 meta-table / 发布 WordPress 草稿
```

流程特点：

- 大纲和文章分阶段。
- 文章基础内容和美化格式分阶段。
- 自动生成和人工审核分离。
- 发布默认草稿。
- 失败文章仍可人工查看，必要时可发布或重置重跑。

## 8. B2C 与 B2B 两套逻辑

### 8.1 C端/DTC 内容站

关注：

- 品牌调性。
- 创始人/作者人设。
- 产品体验。
- 用户疑问。
- 购买决策。
- 礼品、教程、FAQ、对比、榜单。

文章倾向：

- 更强调读者场景。
- 更强调产品选择。
- 更强调一手经验和品牌可信度。

### 8.2 B端/外贸/制造站

关注：

- 公司可信度。
- 团队/工厂/工程能力。
- 产品参数。
- 工艺流程。
- 质量控制。
- 认证合规。
- 行业应用。
- 采购 FAQ。
- 客户案例。
- RFQ / send drawing / catalog download / consultation。

文章倾向：

- 面向采购经理、工程师、承包商、分销商、项目业主。
- 强调证据边界，不能编造能力、认证、案例、MOQ、交期。
- CTA 指向询盘、图纸提交、目录下载、技术咨询。

## 9. 安全与交付边界

### 9.1 本地数据安全

敏感内容通常包括：

- API Key。
- Gemini Key。
- WordPress Application Password。
- 真实站点配置。
- 真实客户资料。
- 生成文章。
- outputs。

这些数据应保存在本地，不应进入 release 包。

### 9.2 release 排除规则

release 打包脚本排除：

- `.git/`
- `node_modules/`
- `.env`
- `.env.*`
- `sites/`
- `outputs/`
- `logs/`
- `runtime/`
- `release/` 旧包
- `server.out.log`
- `server.err.log`
- 真实 API Key
- WordPress 密码
- 真实站点数据

### 9.3 当前 Git 注意事项

项目中 `sites/` 是真实使用数据目录。后续提交 GitHub 时，需要继续谨慎：

- 程序代码可以提交。
- 文档、模板、examples 可以提交。
- 真实站点数据不要默认提交。
- outputs 不要提交。
- `.env` 不要提交。
- `site-recycle-bin/` 不要提交。

## 10. 版本与交付包

当前版本：

```text
v0.1.1
```

主要交付能力：

- 本地 Node.js 程序。
- Windows 一键启动。
- 文档目录。
- demo-site 示例。
- smoke test。
- release zip 打包。
- 真实站点数据排除。

相关文件：

```text
VERSION
CHANGELOG.md
RELEASE-CHECKLIST.md
SECURITY-CHECK.md
docs/
examples/demo-site/
scripts/smoke-test.js
scripts/build-release.js
```

## 11. 当前依赖

`package.json` 中当前主要依赖：

```json
{
  "express": "^4.18.2",
  "exceljs": "^4.4.0",
  "csv-parse": "^5.5.3",
  "csv-stringify": "^6.4.5",
  "archiver": "^6.0.1",
  "node-fetch": "^3.3.2"
}
```

脚本：

```json
{
  "start": "node main.js",
  "dev": "node --watch main.js",
  "smoke": "node scripts/smoke-test.js",
  "build-release": "node scripts/build-release.js",
  "start:windows": "powershell -ExecutionPolicy Bypass -File scripts/start-windows.ps1"
}
```

## 12. 升级基准与不可丢失能力

后续全面升级时，以下能力必须保留：

- 本地运行，不依赖云端后台。
- 多站点独立资料库。
- C端/B端站点类型。
- 站点文件契约不变。
- 大纲和正文分阶段。
- 基础 HTML 和美化 HTML 双版本。
- QA 检查。
- 发布包。
- 数据包。
- 图片配置。
- WordPress 草稿发布。
- 导入中心。
- Project 指令。
- 样式参考。
- 模型设置。
- Gemini 辅助模型设置。
- 站点删除进入回收站。
- release 包不包含真实站点数据。
- smoke test。
- Windows 一键启动。

## 13. 后续全面升级建议

### 13.1 产品层

- 重做 UI 信息架构时，应保留当前业务流程，不要做成通用内容编辑器。
- 内容任务页应继续作为生产控制台。
- 文章工作台应继续作为单篇文章的集中检查与操作区。
- 导入中心应强化字段映射、写入记录和站点隔离。
- B2C/B2B 新建站点建议使用不同表单或不同向导，而不是只用一个下拉切换。

### 13.2 工程层

- 可逐步把 `ui/index.html` 拆分为模块化前端，但迁移时必须先建立 API 合约测试。
- 可把 `engine/api.js` 中的长路由拆成多个 router 文件。
- 可为站点配置增加 schema 校验。
- 可为导入中心增加更明确的文件格式适配器。
- 可为 WordPress 发布增加更详细的失败诊断。

### 13.3 内容质量层

- 保持文章生成维度简化，避免一次 Prompt 干预过多。
- 保持 HTML 美化作为独立模块。
- 样式参考建议以“一个主规则输入框 + 参考 HTML”形式简化。
- B2B QA 应继续强化防编造。
- 关键词覆盖应继续覆盖主词、次词、变体词、长尾词。

## 14. 当前基准结论

当前 Content Engine Lite 已经不是简单的文章生成器，而是一个本地多站点内容生产控制台。它的核心资产不是单篇文章生成能力，而是：

- 站点资料契约。
- 关键词任务状态管理。
- 大纲和正文分阶段生成。
- QA 与发布包。
- 基础版和美化版双版本。
- 图片与 ALT 工作流。
- WordPress 草稿发布。
- C端/B端策略分流。
- 本地安全交付机制。

后续全面升级应围绕这些基准能力做产品化、模块化和稳定性增强，而不是推翻现有流程。
