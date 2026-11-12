# 在线教材

应用支持从远程清单打开教材：页面图片、音频和课堂动漫直接走 URL，不导入 IndexedDB。
教材资源可以放在同一台电脑的局域网服务里，也可以放到任意 HTTPS 静态空间。

## 本机 / 局域网（手机、平板、电脑）

```sh
npm run build
npm run book:serve
# 或指定一本 / 多本教材（目录或 ZIP）：
npm run book:serve -- --book /path/to/book --book /path/to/another-book
```

默认会自动加入本机已有的两本教材：

- `~/Downloads/lets-go-picture-dictionary-reader.zip`（图画词典）
- `~/Downloads/lets-go-begin-1-reader`（Let's Go Begin 1 学生用书）

只有存在的教材才会进入目录。终端会打印书架地址和每本教材的直接地址：

- 电脑：`http://localhost:4173/pep-english-reader/`
- 手机 / 平板：`http://<局域网 IP>:4173/pep-english-reader/`（与电脑同一 Wi-Fi）
- 直接打开课本：地址后加 `?view=remote&book=<bookId>`

说明：

- ZIP 首次启动会解压到 `~/Library/Caches/pep-reader-online/`，之后复用。
- 页面、音频和视频位于 `/book-data/<bookId>/`，不进入 `dist`，也不会写入 Git。
- 阅读进度、书签、练习和中文翻译保存在各设备浏览器的 localStorage；学习进度按 A/B 两个用户分别记录。
- 局域网地址是 HTTP，浏览器可以正常点读，但 PWA 安装和 Service Worker 需要
  HTTPS（`localhost` 除外）。要离线安装，请使用下面的 HTTPS 部署。

## 绘本（/picture-data）

绘本和教材使用两套目录。`npm run book:prepare-picture` 生成到仓库外，`npm run book:serve`
默认把 `/picture-data/` 指向 `~/Downloads/journey-to-the-west-reader`；可用
`npm run book:serve -- --picture /path/to/picture-root` 改路径。目录结构：

```text
picture-books.json
books/jtw-001/book.json
books/jtw-001/cover.jpg     # 右侧单封面，用于书架和搜索
books/jtw-001/art.jpg       # 完整封底+封面跨页，用于横版卡片
books/jtw-001/pages/001.jpg
books/jtw-001/audio/episode.mp3
```

单本清单里的句子坐标是 0–1 归一化矩形，来自 PDF 文字层；构建脚本会修复文字层里
拆成单个字母的加字距单词、Drop cap 首字母、跨行连字符和跨页残句。生词 PDF 的词条列
较窄，长短语会把最后一个词折到下一行（`fold one's` / `arms`），构建脚本会把这种续行
并回词条。构建本身不写 `start` / `end`，逐句时间戳由下面的 `book:sync-picture` 单独生成。
理解题只在 `--quizzes` 提供人工校对 JSON 时写入；词汇题由随书生词表确定性生成。

绘本馆用 `src/pictureArcs.ts` 把 108 集按 `episode` 归入 16 个篇章，页面默认展开最近读过的
篇章，也可以全部展开或收起。篇章只影响馆内导航和搜索，不修改 `book.json`、音频映射或离线缓存；
没有对应集数的条目会归入“其他绘本”。

难度和主题按整套作品记录在绘本目录中：Journey to the West 的封面统一标注 Little Fox Level 5，
因此 108 集共用 `levelLabel: "Level 5"` 和主题 `神话 / 冒险`，不按单集词量或标题关键词重新分级。

逐句音频时间戳由 `npm run book:sync-picture` 生成：

```sh
npm run book:sync-picture -- --jobs 3
```

工具用 `whisper-cli -ml 1` 得到词级转写和时间，再用 PDF 文字层的词序列做全局对齐；只有覆盖率、
顺序和时长检查通过的句子才写入 `start` / `end`，其余句子保留为未同步。转写 JSON 缓存在
`<绘本目录>/sync-cache/`，报告写在 `<绘本目录>/sync-report.json`。阅读器根据 `start` 自动高亮，
“跟随”按钮控制是否自动翻页；没有时间戳时只做点击高亮，不伪造同步。
顶部导航在页码进度右侧提供“下一集”，只在同一套绘本内按集数前进；最后一集按钮禁用并提示
“已经是最后一集”。

生词读音按钮使用浏览器的 `speechSynthesis` 朗读单个英文单词，属于本机系统 TTS，不生成或上传音频文件。
可在 `PictureReader` 的生词区域看到语音包错误提示。点击生词定位时，`src/picture/wordLocator.ts`
会把词典原形展开成常见屈折形式（steeper、untying、shattered），并允许短语中间插入代词或宾语
（folded his arms、chased the demon away、took baths）；正文确实没有出现这个词时，生词区域会显示提示。

## 书架首页

书架顶栏高 76px（手机 63px），只保留品牌、搜索和学习档案按钮；页面按
“继续学习 → 我的书架 → 绘本精选 → 全部课本 → 学习工具”排列，减少首屏的说明性文案。

- **继续学习**：优先显示当前学习档案最近打开的教材。如果直接通过课本地址进入阅读页，
  则按最近章节的时间取更晚的一本。卡片显示最近章节、当前页 / 总页数和进度条。
- **我的书架**：最多 4 本，桌面 4 列、平板 3–4 列、手机 2 列；教材封面按 3:4 完整显示，
  不横向裁切或拉伸。绘本按 `series` 聚合，整套连载只占一张卡片，副标题显示最近读到的集数。
- **绘本精选**：同样按整套绘本展示；只有一个系列时使用横版全套卡片，点击继续最近一集，
  “全部绘本”进入绘本馆按篇章浏览单集。
- **浏览全部教材**：推荐区约 240px，年级按钮切换后自动展开完整目录；目录按
  “牛津系列 / 人教 PEP”分组，并保留待上线课本的禁用状态。
- **搜索**：顶栏搜索同时检索远程教材、本机离线教材和全部 PEP 在线目录，支持书名、
  系列、出版社和年级。
- **学习档案**：书架顶栏的用户按钮可切换学习者 A / B；继续学习、最近章节、阅读进度、
  书签、练习和录音都按档案隔离。

最近打开和最近章节分别保存在 `pep:shelf-last-open:<profile>` 与
`pep:last-chapter:<profile>:<bookId>`，只用于书架推荐，不写入学习库主状态。
本地教材入口仍由 `LOCAL_BOOKS_ENABLED` 控制，关闭时首页不渲染导入、管理和离线教材区域。

## 生成 Let's Go Begin 1 教材包

学生用书 PDF、课堂音频和课堂动漫需要先整理成阅读器教材包：

```sh
npm run book:build-begin
# 或指定源文件、输出目录和仓库外的点读热区数据：
npm run book:build-begin -- \
  --pdf "/path/to/学生用书-SB.pdf" \
  --audio "/path/to/课堂音频" \
  --videos "/path/to/课堂动漫视频" \
  --out "/path/to/lets-go-begin-1-reader" \
  --items "/path/to/lets-go-begin-1-items.json"
```

脚本会：

- 把 PDF 每页渲染成 `pages/001.jpg`–`pages/065.jpg`；
- 复制 92 段课堂音频到 `audio/`，24 个课堂动漫到 `video/`；
- 按教材音轨和页码生成 `book.json` 的 `resources`，每个学习页旁边直接出现
  单词跟读、字母歌谣、复习歌曲和情景对话，歌谣页还会出现课堂动漫；
- 写入 `toc` 目录：开场、Let's Get Ready!、Lesson 1–28 和 The Goodbye Song，
  阅读页左侧可以直接跳转；
- 写入 `series` / `publisher` 教材元数据和 `tocGroups` 主题分组，书架只显示元数据里的
  系列名，不把某个出版社写死在应用层；
- 可选读取 `--items` 指定的外部 JSON，把页码对应的点读条目写入每页的 `items`。
  这个文件应放在仓库外，不要把教材词表、热区坐标或音频时间戳提交到公开仓库。

依赖 `pdftoppm` / `pdfinfo`（poppler）和 `ffprobe`（ffmpeg）。生成物默认在
`~/Downloads/lets-go-begin-1-reader`，约 430 MB，只保存在本机。

## 页面课堂资源

教材清单的每一页可以在 `items`（点读热区）之外再带 `resources`：

```json
{
  "page": 6,
  "image": "pages/006.jpg",
  "items": [],
  "resources": [
    {
      "id": "a03",
      "kind": "audio",
      "title": "单词跟读",
      "subtitle": "Lesson 1 Aa · Learn the words",
      "src": "audio/LG5e_LB1_CD1_03.mp3",
      "track": 3,
      "duration": 43.1
    },
    {
      "id": "v-l1",
      "kind": "video",
      "title": "课堂动漫",
      "subtitle": "Lesson 1 · The A Chant",
      "src": "video/LG5e_LB1_L1_Chant.mp4",
      "poster": "pages/006.jpg",
      "duration": 48.8
    }
  ]
}
```

阅读器右侧的“本页学习”面板用标签页组织“单词学习”和“课堂资源”。桌面端它是右侧一列，
平板和手机是覆盖式抽屉；抽屉标题栏带有课本上一页/下一页，翻页时不必先关闭面板。
音频可以播放、暂停和拖动进度，视频在弹层中播放。普通翻页会停止当前页的声音，
跨页连播的音频除外。

课堂音频和点读共用底部全局播放条。播放条只在有活动媒体时出现，包含播放/暂停、
进度、上一段/下一段、语速、循环、音量和关闭。点读会先停止整页音频，打开视频会
停止点读和课堂音频；关闭视频后不会留下第二路声音。这个互斥关系由 `LocalReader`
统一调度，资源面板本身不再创建独立的 `Audio`。

如果一段录音连续覆盖相邻两页，可以在两页放同一个 `id`、同一个 `src` 的音频资源，
并标记 `continuous: true`：

```json
{
  "id": "a02",
  "kind": "audio",
  "title": "字母与发音",
  "subtitle": "第 4–5 页 · 从 0:44 开始",
  "src": "audio/LG5e_LB1_CD1_02.mp3",
  "continuous": true,
  "startAt": 44.4
}
```

两页的 `id` 和 `src` 必须一致。翻页时阅读器会保留同一个播放器，声音不会中断；
`startAt` 只在该页重新开始播放时生效，从上一页连续播过来时不会跳回。
目录里的音频数量按独立音轨统计，不会把跨页重复挂载算成多段。

阅读页采用五区布局：顶部导航只保留书架、目录、学习和“更多”（能听写的教材还保留听写）；
左侧是可折叠目录（折叠后是 64px 迷你栏）；中间是书页，上一页 / 下一页贴在书页左右两侧；右侧是
“本页学习”；底部是全局播放条。宽屏默认展开目录和学习面板，平板/手机从顶部导航
打开覆盖式抽屉。

书页右上角默认只露出一个“视图”按钮，避免低频设置压住课本。弹出菜单按四组组织：

- **页面**：整页 / 宽度、缩放和恢复 100%；
- **学习**：点读区域、局部聚焦；
- **显示**：纯净阅读、全屏；
- **管理**：热区标注，仅在教师管理模式解锁后出现。

“纯读”会隐藏所有工具，只保留课本、翻页键和退出/播放小按钮；按 Esc 退出。
全局播放条没有活动媒体时自动隐藏，因此翻页和阅读时不会长期占用书页上下两端。

## 学习功能（P1 / P2）

学习数据全部留在本机，不接入远端账号或统计服务：

- **双用户**：书架顶栏的学习档案按钮，或阅读页顶栏“更多”里切换学习者 A / B。阅读进度、书签、词条掌握度、练习记录、
  录音和学习时长都按用户隔离；切换用户后书架“继续学习”和最近章节也会跟着变。
- **书签**：收藏当前页，在“更多 → 书签列表”里跳转或删除。
- **局部聚焦**：选中一个词后打开“视图 → 局部聚焦”，书页会放大到约 2.15 倍并把该词
  滚到阅读区中央；按 Esc 退出。聚焦只改变视图，不替换课本插图。
- **单词练习**：每页 8 题，混合“听音选词 / 看词选义 / 听音拼写”，干扰项从全书词条里取。
  每道题的结果进入间隔复习排期。
- **跟读录音**：使用浏览器 MediaRecorder 录音，可回放、删除；录音 blob 存在独立的
  IndexedDB `pep-reader-learning-v1`，元数据在 `pep:recordings:v1`，不上传服务器。
  可选的“浏览器语音评分”默认关闭；没有识别分数时只保存录音，不把这次跟读算成答对。
- **智能复习**：简化版 SM-2。答对把间隔从 1 天拉到 3 天，再按 ease 逐步延长；答错回到
  1 天后。复习面板按“本书”统计到期词，并推荐下一处还没学过的词页。
- **学情统计**：累计学习时长、连续天数、掌握词、练习正确率、最近 7 天柱状图、本书进度、
  薄弱词和最近练习记录。
- **分级对话**：练习标签里的“分级对话”提供听读、跟读、挑战三级；挑战模式先遮住原文，
  整段对话可以连续播放。
- **离线保存**：“更多 → 离线保存”把页面图片、课堂音频、动漫视频写入 Cache API
  `pep-reader-books-v1`，并记录在 `pep:offline-books:v1`。阅读时经 Service Worker
  取过的 `/book-data/` 文件也会自动进入这个缓存。
- **热区标注**：教师管理模式解锁后，在“视图 → 管理 → 标注热区”进入内容管理。可以直接
  在书页上拖拽画矩形，修改词条、释义、绑定音频和起止时间，保存到本机覆盖层，或导出
  本页 / 全书 JSON。儿童端默认看不到这个入口。

学习库使用 `pep:learning:v1`（双用户、词条记录、书签、练习事件、每日时长、最近页码）。
远程教材的在线热区覆盖使用 `pep:remote-items:<bookId>:<page>`，不会改动远端 `book.json`。

### 教师管理模式

管理入口放在顶栏“更多 → 教师管理”。第一次进入时设置 4 位数字密码，之后凭密码解锁；
模式状态保存在 `pep:teacher-mode`，密码只以哈希值保存在本机 `pep:teacher-pin`。
这是防止儿童误触的本机锁，不是账号权限系统；忘记密码时清除本站点数据即可重新设置。
解锁后才显示“编辑释义”和“标注热区”，退出管理模式会立即关闭热区编辑器和释义编辑框。

## 点读热区与单词学习

在页面 `items` 里可以给一个单词同时挂多个热区。下面的例子用 `word` / `释义`
表示实际词条，`rects` 的第一块是书上的单词标签，第二块是旁边的插图；点标签或
插图都会播放同一条音频区间：

```json
{
  "page": 6,
  "items": [
    {
      "id": "p006_w1",
      "text": "word",
      "translation": "释义",
      "order": 1,
      "rects": [
        [0.27, 0.43, 0.39, 0.46],
        [0.19, 0.25, 0.43, 0.43]
      ],
      "audio": "audio/LG5e_LB1_CD1_03.mp3",
      "audioStart": 14.62,
      "audioEnd": 19.98
    }
  ]
}
```

- `audioStart` / `audioEnd` 必须从真实教材音轨里切分并复核，不能按图片或文字位置猜；
- 一个词条可以有两段或多段 `rects`，阅读器会同步选中所有热区；
- “单词学习”标签页列出本页词条，点列表项和点书页热区播放同一段音频；
- 没有词条、只有课堂资源的页面会自动只显示“课堂资源”标签页。

Begin 1 构建脚本支持把这类数据放在仓库外，通过 `--items` 读取：

```json
{
  "6": [
    { "id": "p006_w1", "text": "word", "translation": "释义", "order": 1, "rects": [[0.27, 0.43, 0.39, 0.46]], "audio": "audio/LG5e_LB1_CD1_03.mp3", "audioStart": 14.62, "audioEnd": 19.98 }
  ]
}
```

```sh
npm run book:build-begin -- --items ~/Downloads/lets-go-begin-1-items.json
```

Begin 1 的本书数据已经补全 26 个单词页（书上第 6–56 页），共 104 个主词、208 个热区。
每个词有两个热区：书上的单词标签和对应插图；两处都会播放同一段真实教材音频区间。
第 8 页里的 `Eddie` 同时还带中文释义“埃迪（人名）”，方便双用户学习和复习。

热区与时间戳的生成流程（只在仓库外进行）：

1. macOS Vision OCR 识别单词标签和四宫格位置，得到归一化矩形；
2. 用 `whisper.cpp` + `ggml-base.en.bin` 转写课堂音频，按 “Number N” 和词条顺序定位
   每个词的起止时间；
3. 用 `ffmpeg` 对每个区间做响度抽查，剔除静音或串到下一词的区间；单词只读一次时允许
   `start == end`，但仍要求区间非静音；
4. 把结果写到仓库外的 `~/Downloads/lets-go-begin-1-items.json`，再用 `--items` 构建。

本机当前数据位于 `~/Downloads/lets-go-begin-1-items.json`，构建后的 `book.json` 在
`~/Downloads/lets-go-begin-1-reader/book.json`。这两个文件以及完整词表、热区坐标和
音频时间戳都不能提交到公开仓库；仓库里只保留构建脚本和 `--items` 接口。

## 书籍目录

阅读页左侧有可点击的书籍目录，条目显示书上的印刷页码，点一下直接跳到对应页。
宽屏默认展开为目录列，收起后变成 64px 迷你栏；平板和手机从顶部导航的“目录”
按钮打开覆盖式目录，选完自动收起。

目录按以下顺序生成：

1. 清单里显式声明的 `toc`（推荐新教材使用）；
2. 点读条目 id 以 `_t` 结尾的主题标题，和以 `_h1`、`_h2`… 结尾的小节标题；
3. 没有标题条目时，按课堂资源里的 `Lesson N` 编号归并，每课取第一次出现的页面。

在 `book.json` 根对象里显式声明 `toc` 时，`page` 是 `pages` 数组里的物理页码
（从 1 开始），不是书上印刷的页码：

```json
{
  "toc": [
    { "title": "Let's Get Ready!", "page": 4, "level": 1, "subtitle": "第 4–5 页 · Listen and point" },
    { "title": "Lesson 1 · Aa", "page": 6, "level": 1 },
    { "title": "Lesson 28 · Let's Talk", "page": 61, "level": 1 },
    { "title": "The Goodbye Song", "page": 61, "level": 2 }
  ]
}
```

`level: 2` 表示小节，会缩进显示。条目页码不存在时会被忽略；图画词典的目录
直接从页面上的主题标题和日历小节生成，不需要手工维护。

目录较长时，用根对象的 `tocGroups` 按物理页码区间归组：

```json
{
  "tocGroups": [
    { "title": "入门与数字", "from": 1, "to": 15 },
    { "title": "形状、身体与家庭", "from": 16, "to": 35 },
    { "title": "家居与衣物", "from": 36, "to": 53 }
  ]
}
```

条目没有显式 `group` 时，按 `page` 落进第一个匹配的区间。没有 `tocGroups` 且一级条目
超过 30 条时，阅读器会按每 10 条自动分页段，保证长目录不会平铺成一大列。目录面板还提供
章节/页码搜索、“当前章节”定位和分组折叠；同一页下的 `level: 2` 小节用竖线和缩进区分。

## 离线阅读与缓存

阅读器使用 Service Worker 缓存远程教材：

- 应用壳（HTML、JS、CSS、字体）放在 `pep-reader-shell-<hash>`，每次构建按产物哈希清理旧版本；
- `/book-data/` 下的页面图片、音频和视频放在 `pep-reader-books-v1`。正常翻页、点读、
  播放课堂资源时，取过的文件会自动缓存；
- “更多 → 离线保存”会遍历当前教材清单，把尚未缓存的页面和媒体补齐，并在
  `pep:offline-books:v1` 记录大小、时间和资源列表；可以随时移除这本教材的缓存；
- 离线下载按完整文件保存，视频拖动进度仍需要服务器支持 Range 请求；缓存完整文件后，
  离线播放不受影响。

Service Worker 和 Cache API 要求安全上下文：`localhost` 或 HTTPS。手机通过局域网
`http://<局域网 IP>:4173` 阅读时，点读和在线播放正常，但不能安装 PWA，也不能依赖
Service Worker 离线打开；需要离线时请按下一节导出到私有 HTTPS 空间。

## 放到 HTTPS 静态空间

运行下面一条命令，会生成可直接上传的目录（默认在
`~/Downloads/pep-english-reader-site/`）：

```sh
npm run build
npm run book:export
# 或指定教材位置和输出目录：
npm run book:export -- --book /path/to/book --book /path/to/another-book --out /path/to/site
```

生成的目录结构如下。把整个目录上传到任意静态空间，访问
`https://<域名>/pep-english-reader/` 即可：

```text
站点根目录/
├── pep-english-reader/          ← dist/ 的内容
│   └── remote-books.json
└── book-data/
    ├── lets-go-picture-dictionary/
    │   ├── book.json
    │   ├── pages/
    │   └── audio/
    └── lets-go-begin-1/
        ├── book.json
        ├── pages/
        ├── audio/
        └── video/
```

`remote-books.json` 内容（`book:export` 已自动生成）：

```json
{
  "books": [
    {
      "id": "lets-go-picture-dictionary",
      "title": "Let's Go Picture Dictionary",
      "pages": 126,
      "items": 1150,
      "series": "Oxford Let's Go",
      "publisher": "Oxford University Press",
      "cover": "../book-data/lets-go-picture-dictionary/pages/001.jpg",
      "manifest": "../book-data/lets-go-picture-dictionary/book.json"
    },
    {
      "id": "lets-go-begin-1",
      "title": "Let's Go Begin 1 · 学生用书",
      "pages": 65,
      "items": 104,
      "audio": 92,
      "videos": 24,
      "series": "Oxford Let's Go",
      "publisher": "Oxford University Press",
      "cover": "../book-data/lets-go-begin-1/pages/001.jpg",
      "manifest": "../book-data/lets-go-begin-1/book.json"
    }
  ]
}
```

相对路径按清单地址解析；也可以写完整的 `https://...` 地址。若清单放在另一个域名，
打开应用时加 `?catalog=<清单 URL>`，该域名需要允许跨域读取（CORS）。如果手工组织
站点，上述目录路径必须保持一致。`series` / `publisher` 只用于书架和阅读页展示，
产品标题始终是通用的“英语教材点读”，不会把某一套教材写死在应用层。

视频需要服务器支持 HTTP Range 请求（拖动进度会用到）。`book:serve` 已支持；
大多数静态空间（GitHub Pages、Cloudflare Pages、S3/CDN）也支持。

注意：教材文字、图片、录音和视频的权利归各自权利人所有。请只部署到自己的私有空间，
不要把教材包提交到公开仓库或公开演示站点；本仓库的 MIT 许可证不覆盖教材内容。
