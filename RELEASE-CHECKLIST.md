# Release Checklist

Before delivering Content Engine Lite v0.2.0:

- [ ] Run `npm install`.
- [ ] Run `npm run smoke`.
- [ ] Run `npm start`.
- [ ] Open `http://127.0.0.1:3000`.
- [ ] Confirm the top navigation contains: 内容任务、站点资料库、导入中心、使用教程、设置。
- [ ] Confirm C端 and B端 site creation flows still exist in 站点管理.
- [ ] Confirm “使用教程” switches content according to the current site's `siteType`.
- [ ] Confirm QA screen uses 注意点 / 建议 wording, not blocking failure wording.
- [ ] Confirm `start-windows.bat` exists.
- [ ] Confirm `stop-windows.bat` exists.
- [ ] Confirm `scripts/start-windows.ps1` exists.
- [ ] Confirm `scripts/stop-windows.ps1` exists.
- [ ] Confirm `desktop/main.cjs` exists.
- [ ] Confirm `docs/QUICK-START-WINDOWS.md` exists.
- [ ] Confirm `docs/ONE-CLICK-START.md` exists.
- [ ] Confirm `docs/USER-GUIDE-B2C.md` exists.
- [ ] Confirm `docs/USER-GUIDE-B2B.md` exists.
- [ ] Confirm `docs/DESKTOP-PACKAGING.md` exists.
- [ ] Confirm `examples/demo-site/` contains all required demo files.
- [ ] Run `npm run build-release`.
- [ ] Confirm `release/Content-Engine-Lite-v0.2.0.zip` exists.
- [ ] Confirm the release zip includes Windows launcher scripts, desktop shell files, and new guide docs.
- [ ] Confirm the release zip does not include `.env`, `.git`, `node_modules`, `sites/`, `outputs`, logs, `dist`, `site-recycle-bin`, or runtime cache.
- [ ] Run `npm run pack:win` when a desktop exe is required.
- [ ] Confirm `dist/Content-Engine-Lite-0.2.0-x64.exe` exists when desktop packaging succeeds.
- [ ] Confirm generated content will be manually reviewed before use.
