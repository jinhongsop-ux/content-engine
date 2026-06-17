# 配置说明

## 文章模型

进入“设置 -> 文章模型 / Gemini”。

文章模型用于大纲和正文生成。常见字段：

- Endpoint
- Model Name
- Max Tokens
- Timeout
- API Key

支持 Anthropic 风格、OpenAI 兼容接口和已配置的小米 MiMo 兼容接口。真实 API Key 可以填在界面顶部，也可以保存在本地 `.env` 或环境变量中。

## Gemini 辅助模型

Gemini 辅助模型用于：

- 文章预览翻译。
- 图片理解和 ALT 文本。
- HTML 美化格式。

如果没有配置 Gemini Key，这些辅助功能可能失败，但不会影响基础大纲和正文生成。

界面里提供 Google AI Studio 获取 Key 的入口。

## WordPress

WordPress 配置按站点存储在 `site.json`。

字段包括：

- `endpoint`：WordPress 网站地址或 REST endpoint。
- `username`：WordPress 用户名。
- `appPassword`：WordPress Application Password。
- `defaultStatus`：建议使用 `draft`。
- `categories`：可选分类 ID。
- `tags`：可选标签 ID。

程序默认发布为草稿。SEO Meta 写入取决于目标 WordPress 站点的 SEO 插件和 REST Meta 支持。

## 站点资料

每个站点位于：

```text
sites/[siteId]/
```

标准文件：

- `site.json`
- `author.json`
- `knowledge.json`
- `links.json`
- `style-reference.json`
- `project-instructions.md`
- `keywords.csv`
- `outputs/`

## C端与B端差异

C端站点更关注：

- 品牌人设。
- 用户场景。
- 购买决策。
- 产品体验。
- FAQ、教程、选购指南、对比文章。

B端站点更关注：

- 公司可信度。
- 团队/工厂背景。
- 产品参数。
- 工艺和质检。
- 行业应用。
- 采购 FAQ。
- RFQ / Catalog / Send Drawing / Talk to Engineer 等转化动作。

老站点如果没有 `siteType` 字段，默认按 C端 / B2C 处理。

## 默认策略

默认策略位于：

```text
templates/
```

包含：

- `article-types.json`
- `prompt-sections.json`
- `qa-rules.json`
- `b2c/`
- `b2b/`

加载顺序为：

1. 通用默认策略。
2. 按 `siteType` 加载 C端或 B端策略。
3. 站点级 `sites/[siteId]/templates/` 覆盖。

## 安全提醒

不要把 `.env`、真实 `sites/`、API Key、WordPress Application Password 或客户资料提交到公开仓库或 release 包。
