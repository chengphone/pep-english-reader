# 英语课本点读

面向人教 PEP 小学英语教材的本地优先 PWA 原型。首屏提供 E63 五年级上册在线入口；导入符合格式的 PEP 教材 ZIP 后，可在本机显示页面、点读热区、顺序连读并离线使用。教材文件不会上传。

## 开发

```sh
npm install
npm run dev
```

部署到 HTTPS 后可安装为 PWA。E63 在线教材由 `dd.e63.cn` 提供，需要联网；应用的离线阅读仅适用于完整导入本机的教材包。浏览器清理站点数据会清除本地教材。

## 教材资源

在线入口指向 E63 的人教 PEP 五年级上册候选资源（书目 ID `tape5a_002113`，页面标注新课标版）。使用前请按纸质书 ISBN、版次确认版本。本站不打包或再分发教材 PDF、页面图片和配套音频。

本地导入格式见 [docs/BOOK_PACKAGE.md](docs/BOOK_PACKAGE.md)。

## 听音默写：固定音频（Edge TTS）

采用“电脑预生成 MP3 → 导入浏览器 → 本地离线播放”。不需要自建服务器、API 密钥或在学生设备上安装 Python。

1. 打开 **单元默写 → 管理词表 → 单词音频**。
2. 选择当前单元 / 本教材全部已保存词表，选择美式 / 英式男声或女声，点击 **导出音频制作包**。
3. 解压 ZIP，在解压目录打开终端。macOS 运行：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install edge-tts
.venv/bin/python build_word_audio.py request.json
```

Windows 使用 `.venv\Scripts\python` 替换 `.venv/bin/python`（创建环境时可用 `py -3 -m venv .venv`）。

4. 将生成的 `word-audio.zip` 导入应用，展开试听检查。生成失败重跑即可，已完成文件会复用。
5. 开始听写：每词默认播放三遍，默认手动下一词，可开启自动下一词。缺少本地音频会提示，只有主动开启备用朗读才使用浏览器 TTS。

也支持批量导入以英文命名的散装音频，例如 `apple.mp3`、`good morning.mp3`。ZIP 使用 manifest 文本对应，不依赖复杂文件名。再次导入替换同词音频，可修正多音词或错误发音。当前音频按规范化英文跨单元复用，同一拼写暂只保存一份读音，需区分词义的多音词应分别管理后续版本。

音频保存在独立 IndexedDB `pep-word-audio`，不会修改原教材和词表。每次导入先验证所有匹配音频可播放，再一次性保存，避免错误文件导致半导入。可导出音频备份 ZIP；词表需另行保留。清理网站数据会删除本地音频。

音频制作时需联网，只有英文文本发送到微软在线语音服务；PDF、图片和中文释义不上传。`edge-tts` 是第三方客户端，在线服务变化可能影响生成，已保存 MP3 播放不受影响。原理参考 [edge-tts 上游文档](https://github.com/rany2/edge-tts)。

## 图片常用表达识别

词表图片导入支持自动区分 `Words in each unit` 与 `Useful expressions`。在“图片内容”中也可手动选择“常用表达（完整句子）”，用于没有标题的接页。多张图片按文件名自然顺序处理，句子与下方中文按坐标配对；跨行英文合并，右栏开头延续左栏所在单元，后页延续前页分类。结果保存到独立“常用表达 · Unit N”分组，不覆盖单元单词。

图片较小时，中文 OCR 的准确率有限；低分辨率候选必须核对后确认，英文、中文都可修改。程序不会把局部识别结果当作校对完成的教材数据。回归检查：`npm run test:expressions`。

## 听写与资料管理

“听写练习”只使用已保存的词表。先选教材、内容类型（单元单词 / 整册词汇 / 常用表达）和单元，再勾选具体词句；支持搜索、全选、清空，以及在已选词句中全部随机或按自定义数量抽取。开始后按本次选项创建独立题目快照，默认每题播放三遍、手动下一题；答案只在完成并点击“对答案”后显示。

“资料管理”分为三个标签：

- **导入识别**：先选目标教材及 PDF / 图片 / TXT，识别后逐分组直接修改英文与中文，确认后保存。原始识别文本默认收起。保存采用追加合并，不删除原有其他单元。
- **词表校对**：按教材、类型选择已保存单元，修改、添加或删除词句。保存前的修改不进入听写。
- **单词音频**：集中制作、导入、试听与备份 MP3 音频。

听写选择与资料草稿分别维护；导入目标教材也独立保存，切换词表校对不会把待导入资料移入另一册教材。本地 IndexedDB 数据库和既有音频保持兼容，无需重新导入原有资料。回归检查：`npm run test:selection`。

按字母排列的 Vocabulary 图片不要求 Unit 标题，可多页合并到“整册词汇”。自动模式也会根据字母索引及音标词条识别无标题的续页；必要时手动选“整册词汇表（按字母）”。字母标题不加入听写，已知复合词支持第一词音标夹在词组中间的排版（如 `red /red/ panda`）。回归检查：`npm run test:vocabulary`。

## 新阅读界面

在线课本和本地课本共用顶部标题、返回书架及单元默写入口，不再显示旧侧栏。本地阅读默认适合宽度，较长页面可在中央区域上下滚动；选“适合整页”可一次看完本页。支持输入 PDF 页码跳转、左右箭头键翻页、缩放、点读区域提示、全屏和原有阅读进度。

PDF 原文件保存在 IndexedDB，页面由 PDF.js 原样渲染；透明点读层与同一纸张容器同步缩放。渲染使用独立临时 Canvas，完成后再显示，快速翻页会取消过期任务。重排页面尺寸不会改动原教材、词表或音频。

底部播放栏显示选中的英文和中文释义，可编辑保存翻译。阅读发音优先级为教材包音频 → 已导入本地词句 MP3 → 浏览器英文朗读。支持暂停继续、循环、调速及整页顺序朗读，翻页或离开阅读页会停止队列。浏览器朗读不保证所有设备都能离线使用。

在线阅读仍嵌入 E63，外层可切换教材、重试、专注阅读、全屏或新窗口打开；课本内部的点读、翻页、目录由 E63 控制。在线资源是否可用取决于网络和原站。本地阅读不依赖 E63。检查页面尺寸逻辑：`npm run test:reader`。

### GitHub Pages

This app is published as a static site under `/pep-english-reader/`. The Pages workflow builds `dist` on each push to `main`. The public `public/audio/library-manifest.json` and `public/audio/library/` host the 156 user-provided practice MP3s; the reader fetches and saves matching audio locally on first use, so students do not need to import that audio ZIP. Their textbooks and learning progress remain on each device. No custom domain is configured.
