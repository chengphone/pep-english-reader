# 英语课本点读 · PEP English Reader

人教版 PEP 小学英语的在线点读、跟读与听写 PWA。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Deploy](https://github.com/chengphone/pep-english-reader/actions/workflows/pages.yml/badge.svg)](https://github.com/chengphone/pep-english-reader/actions/workflows/pages.yml)

在线体验：https://chengphone.github.io/pep-english-reader/

> 在线课本由 E63（dd.e63.cn）提供，本项目不打包或再分发教材 PDF 与页面图片。教材文字、音频、插图及商标的权利归各自权利人所有，详见 [NOTICE.md](NOTICE.md)。

## 功能

- **在线书架**：3–9 年级、上下册，按年级切换，封面按年级与版次区分。
- **在线点读**：嵌入 E63 阅读器，课本内的点读、翻页、目录由 E63 控制。
- **跟读学习**：三年级上册、六年级上册（PEP 新版），单元词汇 / 常用表达，教材原音、音标、释义、重复遍数与语速。
- **听写练习**：按教材 / 范围 / 单元选择，全部随机或自定义抽取，检查声音后开始，交卷后对答案。
- **本地教材**：PDF / ZIP 导入与离线阅读代码保留，当前通过 `src/features.ts` 的 `LOCAL_BOOKS_ENABLED` 开关暂时关闭；已导入数据仍保留在本机。
- **自建在线教材**：应用读取 `remote-books.json`，直接从远程 URL 加载页面图片、音频和课堂动漫，手机、平板、电脑均可点读，无需导入。`npm run book:serve` 可在局域网内提供构建后的应用和多本教材包；`npm run book:build-begin` 可把学生用书 PDF、课堂音频和动漫整理成教材包。详见 [docs/ONLINE_BOOK.md](docs/ONLINE_BOOK.md)。
- **PWA**：可安装，离线缓存应用外壳。

## 快速开始

```sh
npm install
npm run dev
```

打开终端输出的地址（默认 `http://localhost:5173/pep-english-reader/`）。

## 构建与部署

```sh
npm run build
npm run preview
```

推送到 `main` 后，`.github/workflows/pages.yml` 会运行测试、构建并部署到 GitHub Pages。站点基路径为 `/pep-english-reader/`；如需部署到其他路径，修改 `vite.config.ts` 的 `base`。

## 项目结构

| 路径 | 说明 |
| --- | --- |
| `src/` | React 应用：书架、跟读、听写、阅读器 |
| `public/` | 静态资源：音频、插图、PDF.js、OCR 数据 |
| `tools/` | 构建、数据生成与校验脚本 |
| `tests/` | Playwright 端到端测试 |
| `docs/` | 教材包格式与在线教材部署说明 |
| `design/` | 设计参考稿 |

## 配置

- `src/features.ts`：`LOCAL_BOOKS_ENABLED` 控制本地教材入口；改为 `true` 恢复导入与深链。
- `src/onlineCatalog.ts`：在线课本目录与待上线书目。
- `vite.config.ts`：部署基路径 `base`。
- `src/index.css`：Google Fonts 引入；如需完全离线或隐私部署，可改为本地字体。

## 测试

```sh
npm test
npm run test:e2e -- --project=chromium
```

Firefox / WebKit 回归需先安装浏览器：

```sh
npx playwright install firefox webkit
npm run test:e2e
```

GitHub Actions 在推送和 PR 时运行基础检查与 Chromium 回归，并在代码变更时运行 Firefox / WebKit 回归。

## 数据与隐私

- 本地教材、阅读进度、听写记录保存在浏览器 IndexedDB / localStorage，不上传服务器。
- 在线课本通过 iframe 加载 E63，受其服务与隐私政策约束。
- `public/audio/library/` 中的练习录音用于本站演示；fork 部署前请确认你对音频拥有相应权利，或替换为自己的录音。

## 数据说明（六年级 PEP 新版）

在线教材 `tape6a_002015` 的听写资料独立命名为“六年级英语上册 · PEP新版（E63 002015）”，对照印刷页 81–84 的单元词汇与 89–91 的常用表达整理，共 6 组单词、6 组常用表达。旧版六年级资料与新版分开保存；同版下册在 E63 暂不可用，书架以禁用卡片显示“同版资源待上线”。

## 许可证

源代码以 [MIT](LICENSE) 许可证开源。教材内容、练习录音、插图与商标不在 MIT 授权范围内，详见 [NOTICE.md](NOTICE.md)。

## 贡献

欢迎提交 Issue 和 PR。提交前请运行 `npm test` 与 Chromium E2E；涉及教材数据或音频的改动，请同时说明来源与授权情况。
