# 人教 PEP 本地教材包

ZIP 文件根目录必须包含 `book.json`。清单和资源都在浏览器本地处理，目录中的媒体内容以清单相对路径引用。

```json
{
  "schemaVersion": 1,
  "bookId": "pep_g5_a_edition_id",
  "title": "人教 PEP 五年级上册",
  "publisherId": "pep",
  "grade": 5,
  "term": "a",
  "pages": [
    {
      "page": 1,
      "printedPage": 1,
      "image": "pages/001.webp",
      "items": [
        {
          "id": "p001_s001",
          "text": "Good morning!",
          "translation": "早上好！",
          "order": 1,
          "rects": [[0.1, 0.2, 0.8, 0.3]],
          "audio": "audio/p001_s001.mp3",
          "audioStart": 0.5,
          "audioEnd": 3.2
        }
      ]
    }
  ]
}
```

`rects` 是归一化坐标 `[left, top, right, bottom]`，取值 0 到 1；一句跨行时传多个矩形。`audio` 与 `image` 为 ZIP 内相对路径。页序由 `pages` 数组决定，页内句序由 `order` 决定。

`items[].audioStart` 与 `audioEnd` 是可选的点读播放区间，单位秒。`audioEnd` 大于 `audioStart` 时只播放这段音频；省略任一字段（或终点不大于起点）时播放整段音频，与旧清单完全兼容。缺少 `audioStart` 时默认从 0 秒开始。

图片和音频应为用户有权使用/导入的内容；应用不会从 E63 抓取或复制教材资源。

当前导入器要求 `publisherId` 为 `pep`，并要求 ZIP 含 `book.json` 或 `manifest.json`。PDF 转页图、OCR 和热区可视化校对工具尚未实现；应先在外部制作好页面图片与热区，再打包导入。
