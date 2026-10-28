# 手机与电脑共享资料

正式网址：https://chengphone.github.io/pep-english-reader/

## 学生端

进入单元默写，会加载网站已发布的单元词表、整册词汇和常用表达；音频按英文匹配下载并保存在本机。进入页面、切回页面及联网恢复时会检查资料更新，打开时每分钟检查一次。离线时沿用本机资料，听写轮次使用开始时的内容快照。

## 管理员首次连接

进入“单元默写 → 资料管理 → 手机与电脑共享资料 → 管理员：上传与自动同步”。

1. 在 GitHub 创建 fine-grained personal access token。
2. Resource owner 选择 `chengphone`。
3. Only select repositories 只选择 `pep-english-reader`。
4. Repository permissions 的 Contents 选择 Read and write。
5. 将令牌填写在网站的密码输入框，点击“连接并同步当前资料”。

令牌仅保留在当前页面内存中，不写入 IndexedDB、localStorage、GitHub 文件或构建产物。关闭/刷新页面后需重新连接。学生不需要令牌。GitHub 在电脑命令行中的授权与网页发布授权是独立的，不会自动把命令行凭据交给网页。

## 日常添加资料

管理员连接后，“保存后自动发布”默认开启。保存导入词表、保存单元修改、修改教材/单元名称、删除单元、导入音频成功后，会合并本机变更并提交到 GitHub。可以关闭自动发布，改用“立即发布当前资料”。

上传的是保存后的词句、中文释义、教材/单元名称和音频。原始 PDF、图片、录音和阅读进度不包含在共享资料中。共享资料会公开给该网站的访问者，并出现在公开 GitHub 仓库中。

GitHub Pages 需要构建部署，通常约 1–3 分钟，页面会区分“已保存本机”“正在发布”“已提交网站更新”。提交后，其他设备进入听写页或点击“检查网站更新”。上传期间请保持管理员页面打开。

## 同步与冲突

共享资料有本机基线。远端新增会加入当前设备；远端修改/删除会更新没有本机未发布修改的对应单元。未发布修改会保留，发布时检测同一个单元的并发修改，并要求先校对，防止覆盖。其他设备新增的不同单元会合并。

发布后若 Pages 仍在构建，不会用旧部署内容回滚本机刚提交的词表。音频使用文件内容哈希命名，替换音频后会更新映射并按新文件地址下载；本机自行导入的音频优先保留。

## 部署配置

GitHub Actions 工作流为 `.github/workflows/pages.yml`。网站静态根路径为 `/pep-english-reader/`。词表清单在 `public/data/default-vocabulary.json`；音频清单在 `public/audio/library-manifest.json`；音频文件在 `public/audio/library/`。资料清单使用网络优先、离线缓存回退，避免旧缓存阻止资料同步。
