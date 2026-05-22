# Data File Formats

Use these formats when preparing a clean site data pack.

## site.json

```json
{
  "siteId": "demo-site",
  "siteName": "Demo Site",
  "displayName": "Demo Site",
  "domain": "https://demo-content-engine.local",
  "language": "en",
  "positioning": "Who this site helps and what it helps them do.",
  "audience": ["buyer type 1", "buyer type 2"],
  "brandRole": "practical guide",
  "conversionGoal": "request a quote",
  "tone": "clear, practical, specific",
  "writingStyle": "Plain English with concrete examples.",
  "mustSay": ["Human review is required."],
  "mustNotSay": ["guaranteed results"],
  "wordpress": {
    "endpoint": "",
    "username": "",
    "appPassword": "",
    "defaultStatus": "draft",
    "categories": [],
    "tags": []
  }
}
```

## author.json

```json
{
  "name": "Author Name",
  "title": "Author Title",
  "bio": "Short author profile.",
  "background": "Relevant background.",
  "styleGuide": "Writing voice guidance.",
  "storyBank": [
    {
      "id": "story-01",
      "title": "Story title",
      "summary": "Specific usable story detail.",
      "useWhen": "When to use this story."
    }
  ]
}
```

## knowledge.json

```json
{
  "terminology": [
    { "zh": "中文术语", "en": "English term", "definition": "Definition." }
  ],
  "authoritativeFacts": ["Fact with source-like clarity."],
  "buyerQuestions": [
    { "q": "Question?", "a": "Answer." }
  ],
  "complianceBoundaries": ["Do not make unsupported claims."]
}
```

## links.json

```json
{
  "pillarPages": [
    { "anchor": "guide", "url": "/blog/guide/", "topic": "topic", "keywords": ["keyword"] }
  ],
  "blogPosts": [],
  "productPages": [],
  "trustPages": []
}
```

## style-reference.json

```json
{
  "brief": "HTML style reference summary.",
  "htmlRules": ["Return HTML only."],
  "visualStyle": {
    "font": "system sans-serif",
    "tone": "clean",
    "colors": ["#1f2937"]
  }
}
```

## project-instructions.md

Use Markdown. Include brand SOP, writing rules, compliance boundaries, output requirements, and article workflow.

## keywords.csv

Required header:

```csv
keyword,urlslug,priority,intent,articletype,targetwordcount,secondarykeywords,variants,direction,internallinkingurls,volume,kd,cannibalcheck,pillartarget,blogid
```

Minimum useful fields:

- `keyword`
- `urlslug`
- `priority`
- `articletype`
- `targetwordcount`
- `direction`
- `internallinkingurls`
- `blogid`
