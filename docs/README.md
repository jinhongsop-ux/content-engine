# Content Engine Lite 文档

Content Engine Lite 是本地内部使用的 AI 内容生产工作台。它把站点资料、关键词任务、Project 指令、大纲生成、正文生成、QA 注意点、图片配置、发布资料包和 WordPress 草稿发布组织成一条可人工审核的工作流。

## 适用场景

- C 端 DTC / 内容站：品牌人设、品类知识、购买指南、FAQ、教程、对比评测、礼品/场景文章。
- B 端外贸 / 制造站：公司可信度、产品参数、工艺能力、应用场景、采购 FAQ、解决方案内容、RFQ 转化。
- 多站点本地内容工厂：每个站点一个独立 `sites/[siteId]/` 目录。

## 主模块

- 内容任务：关键词规划表、筛选、批量生成大纲、批量生成文章、批量美化、批量发布 WordPress 草稿。
- 文章工作台：大纲、正文、HTML、QA 注意点、发布包、图片、数据包。
- 站点资料库：品牌/公司设置、作者/团队档案、品类/行业知识、内链库、样式参考、Project 指令。
- 导入中心：文件上传、AI 识别结果、字段映射、写入记录、导入历史和站点隔离。
- 使用教程：按 C 端 D1-D8 和 B 端 D0-D8 展示不同资料准备与执行路径。
- 设置：文章模型、Gemini 翻译/图片/美化模型、WordPress、默认策略。

## 不是这些

- 不是成熟 SaaS。
- 不是多人权限系统。
- 不是自动保证排名的 SEO 系统。
- 不是无人审核的自动发文系统。
- 不包含真实站点数据和真实密钥。

## 推荐阅读顺序

1. `INSTALL.md`
2. `USER-GUIDE-B2C.md` 或 `USER-GUIDE-B2B.md`
3. `DATA-FILES.md`
4. `CONFIG.md`
5. `TROUBLESHOOTING.md`
6. `DESKTOP-PACKAGING.md`

所有生成内容、SEO 元数据、Schema、图片 ALT 和 WordPress 草稿都必须人工审核后使用。
