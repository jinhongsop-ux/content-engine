# Nookcraft 内容生产数据模板

## 文件结构

```
sites/kitminiaturehouse/
├── site.json           ← 品牌配置（原：品牌调性文档 D2-B + Project instructions）
├── author.json         ← 作者档案（原：创始人数字身份数据库 D2-C）
├── knowledge.json      ← 品类知识（原：品类知识库 D1-B + 品类认知表 D1-A 部分）
├── links.json          ← 内链库（原：Project instructions 内链表）
└── keywords.csv        ← 关键词任务（原：keyword_cluster_map D3 + 新增字段）
```

## 与原始 SOP 文件的对应关系

| 原始文件 | 对应模板 | 提取内容 |
|---|---|---|
| 品牌调性文档 D2-B | site.json | 品牌定位、mustSay/Not、写作风格 |
| Project instructions | site.json + links.json | 内链规则、专题页/分类页/已发布博客清单 |
| 创始人数字身份 D2-C | author.json | 基础信息、写作风格、故事素材库（10条） |
| 品类知识库 D1-B | knowledge.json | 术语表、权威事实、买家FAQ、卖点、顾虑 |
| 品类认知表 D1-A | knowledge.json (competitorContext) | 竞品打法摘要、差异化机会 |
| keyword_cluster_map D3 | keywords.csv | 原有字段保留 + 新增4列 |

## keywords.csv 新增字段说明

| 新字段 | 说明 |
|---|---|
| `volume` | 月搜索量，辅助优先级判断 |
| `kd` | 关键词难度 0-100 |
| `cannibalcheck` | 已有相似文章的 slug，留空表示无冲突。生成前必须检查 |
| `pillartarget` | 本文必须内链回的专题页 URL，优先级高于 internallinkingurls |
| `blogid` | 博客编号 B01-B99，与关键词地图 B 系列对齐 |

## 更新规则

**每发布一篇新博客后：**
1. 在 `keywords.csv` 对应行的 `urlslug` 确认为已发布状态
2. 将新博客加入 `links.json → blogPosts[]`，status 设为 published
3. 检查是否有老文章需要补充指向新文章的内链

**每新增关键词任务时：**
1. 在 keywords_blank_template.csv 新增一行
2. `cannibalcheck` 字段：查已发布博客列表，如有语义重叠填入对应 slug
3. `pillartarget` 字段：必填，对应 T01-T06 专题页之一

## 程序读取逻辑

程序启动时读取这 5 个文件，合并成单一 ctx 对象：
- site.json → 品牌规则、禁止词、内链优先级
- author.json → 署名模块、故事素材（生成时随机选取匹配故事）
- knowledge.json → 术语注入、权威事实、买家FAQ
- links.json → 内链自动匹配（按关键词相关度打分）
- keywords.csv → 任务队列，每行一篇文章
