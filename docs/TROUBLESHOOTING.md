# Troubleshooting

## Port Already in Use

Change `PORT` in local environment settings or stop the existing process using port 3000.

## No API Key Found

Set an environment variable such as `ANTHROPIC_API_KEY` or paste a key in the UI.

## Gemini Helper Fails

Confirm the Gemini API key and model name in `设置`. Translation and image helper features are optional.

## WordPress Publish Fails

Check:

- Endpoint URL.
- Username.
- Application Password.
- WordPress REST API availability.
- Hosting rate limits or firewall rules.
- Whether SEO meta fields are exposed by the SEO plugin.

## Import Writes But UI Looks Unchanged

Refresh the site or switch away and back. Confirm the imported file was mapped to the expected target. Use standard files from `examples/demo-site/` as a reference.

## Release Zip Contains Unexpected Files

Run `npm run build-release` again and inspect the zip. The script is designed to exclude `sites/`, `.env`, `.git`, `node_modules`, outputs, logs, and release internals.
