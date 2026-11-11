# 在线教材

应用支持从远程清单打开教材：页面图片和音频直接走 URL，不导入 IndexedDB。
教材资源可以放在同一台电脑的局域网服务里，也可以放到任意 HTTPS 静态空间。

## 本机 / 局域网（手机、平板、电脑）

```sh
npm run build
npm run book:serve
# 或指定目录 / ZIP：
npm run book:serve -- --book /path/to/book
# 默认读取 ~/Downloads/lets-go-picture-dictionary-reader.zip
```

终端会打印地址：

- 电脑：`http://localhost:4173/pep-english-reader/`
- 手机 / 平板：`http://<局域网 IP>:4173/pep-english-reader/`（与电脑同一 Wi-Fi）
- 直接打开课本：地址后加 `?view=remote&book=lets-go-picture-dictionary`

说明：

- 首次启动会把 ZIP 解压到 `~/Library/Caches/pep-reader-online/`，之后复用。
- 页面图片和音频位于 `/book-data/<bookId>/`，不进入 `dist`，也不会写入 Git。
- 阅读进度和中文翻译保存在各设备浏览器的 localStorage，按设备分别记录。
- 局域网地址是 HTTP，浏览器可以正常点读，但 PWA 安装和 Service Worker 需要
  HTTPS（`localhost` 除外）。要离线安装，请使用下面的 HTTPS 部署。

## 放到 HTTPS 静态空间

运行下面一条命令，会生成可直接上传的目录（默认在
`~/Downloads/lets-go-picture-dictionary-site/`）：

```sh
npm run build
npm run book:export
# 或指定教材位置和输出目录：
npm run book:export -- --book /path/to/book --out /path/to/site
```

生成的目录结构如下。把整个目录上传到任意静态空间，访问
`https://<域名>/pep-english-reader/` 即可：

```text
站点根目录/
├── pep-english-reader/          ← dist/ 的内容
│   └── remote-books.json
└── book-data/
    └── lets-go-picture-dictionary/
        ├── book.json
        ├── pages/
        └── audio/
```

`remote-books.json` 内容（`book:export` 已自动生成）：

```json
{
  "books": [
    {
      "id": "lets-go-picture-dictionary",
      "title": "Let's Go Picture Dictionary",
      "pages": 126,
      "manifest": "../book-data/lets-go-picture-dictionary/book.json"
    }
  ]
}
```

相对路径按清单地址解析；也可以写完整的 `https://...` 地址。若清单放在另一个域名，
打开应用时加 `?catalog=<清单 URL>`，该域名需要允许跨域读取（CORS）。如果手工组织
站点，上述目录路径必须保持一致。

注意：教材文字、图片和录音的权利归各自权利人所有。请只部署到自己的私有空间，
不要把教材包提交到公开仓库或公开演示站点；本仓库的 MIT 许可证不覆盖教材内容。
