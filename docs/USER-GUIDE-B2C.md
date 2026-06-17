# C端 / DTC 内容站使用教程

适用对象：独立站、电商、消费品、品牌博客。目标是把品牌资料、作者故事、品类知识、关键词规划、内链库和样式参考变成可人工审核的文章生产流程。

## D1 品类调研

在「站点资料库 → 品类知识」写入术语、权威事实、买家 FAQ、顾虑、卖点和合规边界。对应文件是 `knowledge.json`。

## D2 品牌与作者建设

在「站点资料库 → 品牌设置」填写网站名、域名、语言、定位、受众、语气、必须表达和禁止表达。对应文件是 `site.json`。

在「站点资料库 → 作者档案」填写作者姓名、身份、背景、写作风格和故事素材库。对应文件是 `author.json`。

## D3 关键词规划

在「内容任务」或「导入中心」导入 `keywords.csv`。建议字段包含：

```csv
keyword,urlslug,priority,intent,articletype,targetwordcount,secondarykeywords,variants,direction,internallinkingurls,volume,kd,cannibalcheck,pillartarget,blogid
```

核心关键词必须有 `keyword` 和 `urlslug`。次要关键词、变体词和长尾词会进入大纲和正文提示词，用于覆盖检查。

## D4 产品与转化素材

把产品分类、产品卖点、购买顾虑、退换货政策、FAQ 和信任页面沉淀到「品类知识」与「内链库」。程序不替代完整 WooCommerce 上架流程，但会在文章中引用这些资料。

## D5 专题页与样式参考

在「站点资料库 → 内链库」维护专题页、分类页、产品页、已发布博客和信任页。在「样式参考」填写文章 HTML 排版规则，供「美化格式」模块使用。

## D6 信任建设

把 About、FAQ、退换货政策、作者背书、真实使用经验和品牌边界写入 `site.json`、`links.json`、`project-instructions.md`。

## D7 内容生产

推荐顺序：

1. 在「内容任务」勾选关键词。
2. 点击「生成已选大纲」。
3. 检查大纲。
4. 点击「生成已选文章」。
5. 打开文章工作台，检查正文、HTML、QA、图片、发布包和数据包。
6. 需要品牌排版时点击「美化格式」。

## D8 发布与复盘

可导出文章 ZIP、元数据表格，或发布到 WordPress 草稿。正式发布前必须人工复核标题、正文、内链、图片、Meta Description、Schema 和 QA 注意点。
