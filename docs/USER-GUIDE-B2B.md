# B端 / 外贸 / 制造站使用教程

适用对象：工厂、供应商、B2B 产品站、外贸询盘站。目标是把公司可信度、产品能力、工艺参数、行业应用、案例证据和采购问题组织成能服务 RFQ 的内容流程。

## D0 商业定位与技术底座

在「站点管理」选择「创建 B端 / 外贸 / 制造站」。创建时填写业务模式、目标市场、目标行业、买家角色、核心产品、核心能力、认证、MOQ、交期和禁止编造声明。对应文件是 `site.json`。

## D1 行业与采购认知

在「站点资料库 → 产品与行业知识」写入产品线、材料、规格、工艺、质量控制、认证、应用场景、采购 FAQ、技术 FAQ 和案例。对应文件是 `knowledge.json`。

## D2 供应商可信度

在「站点资料库 → 团队档案」写入公司/团队背景、工厂故事、工程经验、质检经验、出口经验和案例素材。底层文件仍是 `author.json`，但语义是团队/公司可信度档案。

## D3 B2B SEO 与页面架构

导入关键词表时，除基础字段外建议增加：

```csv
keyword,urlslug,priority,intent,articletype,targetwordcount,secondarykeywords,direction,volume,kd,buyerrole,funnelstage,industry,application,productline,geotarget,ctatype,evidenceneeded,casetarget,solutiontarget,rfqtarget,compliancerisk,blogid
```

这些字段会影响大纲、正文、CTA、证据要求和 QA 注意点。

## D4 产品线与能力页面

B端不是 C端选品上架逻辑。需要整理产品线、OEM/ODM、定制能力、样品、资料下载、Contact/RFQ 页面。对应文件通常是 `links.json` 和 `knowledge.json`。

## D5 Solution Hub

在「内链库」维护解决方案页、产品页、行业页、应用场景页、案例页、认证页、能力页、联系页和下载页。文章应把读者导向供应商评估、发送图纸、下载目录或询盘。

## D6 信任与转化系统

在 `site.json`、`knowledge.json`、`project-instructions.md` 中明确：

- 不编造认证、工厂规模、客户名、案例数据、产能、交期、MOQ。
- 精确参数必须来自资料库。
- 文章必须包含采购导向 CTA。
- 结尾应是公司/团队可信度说明，而不是个人作者口吻。

## D7 B2B 内容工厂

推荐文章类型：产品分类指南、应用场景指南、行业解决方案、生产工艺说明、材料/参数说明、标准/认证说明、供应商对比、案例文章、采购 FAQ、支柱文章。

操作顺序仍是：生成大纲 → 检查大纲 → 生成文章 → 检查 QA 注意点 → 美化 HTML → 检查发布包 → 发布 WordPress 草稿。

## D8 GSC 与线索复盘

发布后结合 GSC、GA4、GTM、询盘质量和销售反馈复盘关键词、CTA、页面承接和内容深度。程序主要负责内容和元数据输出，不替代 CRM 或销售线索系统。
