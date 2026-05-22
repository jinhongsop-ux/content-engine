# Configuration

## Article Model

Configure the article-generation model in `设置`.

Common fields:

- Model endpoint.
- Model name.
- Max tokens.
- Timeout.
- API key.

API keys may also be provided through local environment variables. Costs are paid by the user of the model account.

## Gemini Helper Model

Gemini helper settings are used for translation previews and image/ALT helper tasks where configured.

The helper model is optional. If no key is provided, related helper actions may fail while the rest of the app remains usable.

## WordPress

WordPress settings are stored per local site in `site.json`.

Fields:

- `endpoint`: WordPress site or REST endpoint.
- `username`: WordPress username.
- `appPassword`: WordPress Application Password.
- `defaultStatus`: usually `draft`.
- `categories`: optional category IDs.
- `tags`: optional tag IDs.

WordPress publishing creates posts through the REST API. SEO meta support depends on the site's plugins and REST meta settings.

## Site Data

Each local site normally includes:

- `site.json`
- `author.json`
- `knowledge.json`
- `links.json`
- `style-reference.json`
- `project-instructions.md`
- `keywords.csv`
- `outputs/`

Real site data stays local and is not included in the release package.
