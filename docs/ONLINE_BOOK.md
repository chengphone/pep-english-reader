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
- 阅读进度和中文翻译保存在各设备浏览器的 localStorage，按设备分别记录。
- 局域网地址是 HTTP，浏览器可以正常点读，但 PWA 安装和 Service Worker 需要
  HTTPS（`localhost` 除外）。要离线安装，请使用下面的 HTTPS 部署。

## 生成 Let's Go Begin 1 教材包

学生用书 PDF、课堂音频和课堂动漫需要先整理成阅读器教材包：

```sh
npm run book:build-begin
# 或指定源文件和输出目录：
npm run book:build-begin -- \
  --pdf "/path/to/学生用书-SB.pdf" \
  --audio "/path/to/课堂音频" \
  --videos "/path/to/课堂动漫视频" \
  --out "/path/to/lets-go-begin-1-reader"
```

脚本会：

- 把 PDF 每页渲染成 `pages/001.jpg`–`pages/065.jpg`；
- 复制 92 段课堂音频到 `audio/`，24 个课堂动漫到 `video/`；
- 按教材音轨和页码生成 `book.json` 的 `resources`，每个学习页旁边直接出现
  单词跟读、字母歌谣、复习歌曲和情景对话，歌谣页还会出现课堂动漫。

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
      "duration": 79.8
    },
    {
      "id": "v-l1",
      "kind": "video",
      "title": "课堂动漫",
      "subtitle": "Lesson 1 · The A Chant",
      "src": "video/LG5e_LB1_L1_Chant.mp4",
      "poster": "pages/006.jpg",
      "duration": 95.2
    }
  ]
}
```

阅读器右侧会显示“课堂资源”入口。桌面端资源栏在右侧展开，平板为右侧浮层，
手机从底部弹起；音频可以播放、暂停和拖动进度，视频在弹层中播放。普通翻页会停止
当前页的声音。

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

没有点读热区、只有课堂资源的教材会自动隐藏朗读与翻译面板；阅读页的导航和工具
都放在左右两侧，书页区域可以占满整个上下高度。

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
      "cover": "../book-data/lets-go-picture-dictionary/pages/001.jpg",
      "manifest": "../book-data/lets-go-picture-dictionary/book.json"
    },
    {
      "id": "lets-go-begin-1",
      "title": "Let's Go Begin 1 · 学生用书",
      "pages": 65,
      "audio": 92,
      "videos": 24,
      "cover": "../book-data/lets-go-begin-1/pages/001.jpg",
      "manifest": "../book-data/lets-go-begin-1/book.json"
    }
  ]
}
```

相对路径按清单地址解析；也可以写完整的 `https://...` 地址。若清单放在另一个域名，
打开应用时加 `?catalog=<清单 URL>`，该域名需要允许跨域读取（CORS）。如果手工组织
站点，上述目录路径必须保持一致。

视频需要服务器支持 HTTP Range 请求（拖动进度会用到）。`book:serve` 已支持；
大多数静态空间（GitHub Pages、Cloudflare Pages、S3/CDN）也支持。

注意：教材文字、图片、录音和视频的权利归各自权利人所有。请只部署到自己的私有空间，
不要把教材包提交到公开仓库或公开演示站点；本仓库的 MIT 许可证不覆盖教材内容。
