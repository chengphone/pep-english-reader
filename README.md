# 英语阅读 · English Reading

原版教材、绘本点读与跟读 PWA。首页、课本中心、绘本馆、绘本阅读器和练习中心共用一套导航；教材与绘本资源都可以留在本机，不进入公开仓库。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Deploy](https://github.com/chengphone/pep-english-reader/actions/workflows/pages.yml/badge.svg)](https://github.com/chengphone/pep-english-reader/actions/workflows/pages.yml)

在线体验：https://chengphone.github.io/pep-english-reader/

> 在线课本由 E63（dd.e63.cn）提供，本项目不打包或再分发教材 PDF 与页面图片。教材文字、音频、插图及商标的权利归各自权利人所有，详见 [NOTICE.md](NOTICE.md)。

## 功能

- **统一导航**：桌面端为“首页 / 课本 / 绘本馆 / 练习”，手机端为底部四个标签；搜索面板同时检索教材和绘本。
- **首页书架**：按“继续学习 → 我的书架 → 绘本精选 → 全部课本 → 学习工具”排列；继续学习同时显示最近教材和最近绘本，我的书架桌面最多 4 本、手机 2 本，封面保持完整比例。绘本按整套系列聚合，一本连载只占一张卡片，不把每一集单独铺开；支持搜索和 A/B 学习档案切换。
- **在线书架**：3–9 年级、上下册，按年级切换，封面按年级与版次区分。
- **在线点读**：嵌入 E63 阅读器，课本内的点读、翻页、目录由 E63 控制。
- **跟读学习**：三年级上册、六年级上册（PEP 新版），单元词汇 / 常用表达，教材原音、音标、释义、重复遍数与语速。
- **听写练习**：按教材 / 范围 / 单元选择，全部随机或自定义抽取，检查声音后开始，交卷后对答案。
- **本地教材**：PDF / ZIP 导入与离线阅读代码保留，当前通过 `src/features.ts` 的 `LOCAL_BOOKS_ENABLED` 开关暂时关闭；已导入数据仍保留在本机。
- **自建在线教材**：应用读取 `remote-books.json`，直接从远程 URL 加载页面图片、音频和课堂动漫，手机、平板、电脑均可点读，无需导入。`npm run book:serve` 可在局域网内提供构建后的应用和多本教材包；`npm run book:build-begin` 可把学生用书 PDF、课堂音频和动漫整理成教材包。教材清单用 `series` / `publisher` 提供系列信息，用 `tocGroups` 给长目录分组。详见 [docs/ONLINE_BOOK.md](docs/ONLINE_BOOK.md)。
- **绘本馆**：读取 `/picture-data/picture-books.json`，按难度、主题和关键词筛选；原版跨页图、整集原声、逐句文字高亮和跟读录音都在绘本阅读器内完成。难度和主题按整套作品分级（Journey to the West 为封面标注的 Level 5，主题为神话 / 冒险），不按单集或篇章拆分。阅读器顶部可直接进入同一套绘本的下一集（最后一集禁用）。阅读器可以把本集清单、页面图和整集音频“保存到本机”，之后离线继续读。阅读进度、已读完跨页按学习档案保存在本机。绘本馆按 16 个篇章折叠浏览，篇章划分在 `src/pictureArcs.ts` 中维护，不改变单本清单和音频映射。绘本资源、插画和音频只放在仓库外。
- **绘本原声同步**：`npm run book:sync-picture` 用本机 whisper.cpp 转写整集音频，再与 PDF 文字层做逐词序列对齐，把通过覆盖率与顺序校验的句子时间戳写回仓库外的 `book.json`。有这些时间戳时，播放原声会自动高亮当前句，并可开启“跟随”自动翻到该句所在跨页；未对齐的句子仍只支持点击高亮。
- **生词读音与定位**：本集生词列表的喇叭按钮使用浏览器/系统的英文 TTS 朗读单个单词，不发送单词或释义到服务器；没有可用语音包时会给出提示。点击词条会按词典原形匹配正文中的屈折形式和短语（folded his arms、steeper、untying），正文确实没有出现时给出提示。
- **练习中心**：汇总课本跟读、课本听写、绘本词汇小测和已校对的故事理解题；词汇题来自随书生词表，理解题只使用人工校对过的题目。
- **PWA**：可安装，离线缓存应用外壳。

## 快速开始

```sh
npm install
npm run dev
```

打开终端输出的地址（默认 `http://localhost:5173/pep-english-reader/`）。

### 接入绘本

`tools/build-picture-books.mjs` 会把 PDF 跨页、整集 MP3 和生词 PDF 整理到仓库外（默认 `~/Downloads/journey-to-the-west-reader`），并生成 `picture-books.json`、单本清单、裁好的封面 `cover.jpg` 和完整跨页 `art.jpg`。构建后的本地服务器会自动把 `/picture-data/` 指向这个目录：

```sh
npm run book:prepare-picture
npm run book:sync-picture
npm run book:serve
```

构建脚本会修复 PDF 文字层的常见问题：整句加字距导致每个字母被拆成独立词（`O n l y`）、Drop cap 首字母与后续字母分离、跨行连字符和跨页残句。修复只影响生成的句子文本和热区，不改动原版页面图片与音频。

`book:sync-picture` 默认使用 `whisper-cli` 和 `~/.cache/whisper.cpp/ggml-base.en.bin`，把逐句时间戳写回仓库外的单本清单；重建绘本后需要再运行一次。可用 `--model`、`--jobs`、`--limit` 调整模型和并发：

```sh
node tools/sync-picture-audio.mjs --model ~/.cache/whisper.cpp/ggml-small.en.bin --jobs 2
```

如果资源在其他目录，可传参：

```sh
node tools/build-picture-books.mjs --pdf-dir <PDF目录> --audio-dir <MP3目录> --vocab <生词PDF> --out <输出目录> [--quizzes <理解题JSON>]
npm run book:serve -- --picture <输出目录>
```

理解题 JSON 以集数为键，每题包含 `prompt`、`options`、`answer`（从 0 开始）和可选 `explanation`；没有人工校对题目时，练习中心只显示词汇小测。

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

- 本地教材、绘本阅读进度、跟读录音和听写记录保存在浏览器 IndexedDB / localStorage，不上传服务器。绘本页面与音频由本机 `/picture-data/` 提供，Service Worker 只缓存浏览器实际请求过的文件。
- 在线课本通过 iframe 加载 E63，受其服务与隐私政策约束。
- `public/audio/library/` 中的练习录音用于本站演示；fork 部署前请确认你对音频拥有相应权利，或替换为自己的录音。

## 数据说明（六年级 PEP 新版）

在线教材 `tape6a_002015` 的听写资料独立命名为“六年级英语上册 · PEP新版（E63 002015）”，对照印刷页 81–84 的单元词汇与 89–91 的常用表达整理，共 6 组单词、6 组常用表达。旧版六年级资料与新版分开保存；同版下册在 E63 暂不可用，书架以禁用卡片显示“同版资源待上线”。

## 许可证

源代码以 [MIT](LICENSE) 许可证开源。教材内容、练习录音、插图与商标不在 MIT 授权范围内，详见 [NOTICE.md](NOTICE.md)。

## 贡献

欢迎提交 Issue 和 PR。提交前请运行 `npm test` 与 Chromium E2E；涉及教材数据或音频的改动，请同时说明来源与授权情况。
