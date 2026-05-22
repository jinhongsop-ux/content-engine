# Release Checklist

Before delivering Content Engine Lite v0.1.1:

- [ ] Run `npm install`.
- [ ] Run `npm run smoke`.
- [ ] Run `npm start`.
- [ ] Open `http://127.0.0.1:3000`.
- [ ] Confirm `start-windows.bat` exists.
- [ ] Confirm `stop-windows.bat` exists.
- [ ] Confirm `scripts/start-windows.ps1` exists.
- [ ] Confirm `scripts/stop-windows.ps1` exists.
- [ ] Confirm `docs/QUICK-START-WINDOWS.md` exists.
- [ ] Confirm `docs/ONE-CLICK-START.md` exists.
- [ ] Confirm the main UI still contains the current navigation and workspace features.
- [ ] Check `examples/demo-site/` contains all required demo files.
- [ ] Run `npm run build-release`.
- [ ] Confirm `release/Content-Engine-Lite-v0.1.1.zip` exists.
- [ ] Confirm the release zip includes Windows launcher scripts and Windows quick-start docs.
- [ ] Confirm the release zip does not include `.env`, `.git`, `node_modules`, `sites/`, `outputs`, logs, or runtime cache.
- [ ] Confirm `runtime/` is not included in the release zip.
- [ ] Confirm generated content will be manually reviewed before use.
