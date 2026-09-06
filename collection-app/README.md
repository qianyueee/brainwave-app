# 素材收藏（collection-app）

把平时收藏的**封面标题样本、好看的照片、好的视频（链接或录屏）、动画效果录屏**拖进一个窗口，
按规则自动归类，原文件原样保存，分错了点一下改，下面有框写评述。

- 零依赖：只要 Node ≥ 18，`node server.mjs` 就能跑；没有 AI、没有数据库、没有构建步骤。
- 素材库就是磁盘上一个普通文件夹：人用 Finder 翻，程序读 `library.json`。以后要做"消化这些素材"的配套 App，直接读这个文件夹即可。
- 与仓库里的 NeuroSync（脑波应用）完全无关，只是放在同一个仓库里。

## 运行

```bash
cd collection-app
node server.mjs                 # 默认素材库：./library，地址 http://127.0.0.1:7788
node server.mjs --dir ~/素材库   # 指定素材库文件夹
node server.mjs --port 7789     # 换端口
pnpm test                       # 规则 + 接口测试（node --test）
```

打开浏览器后，可以：

| 动作 | 效果 |
|---|---|
| 把图片 / 视频 / GIF 文件拖进窗口 | 浏览器先读尺寸、时长、检测「上图下文」结构 → 分类 → 上传保存 |
| 把网址拖进来 / 粘贴 / 在顶部输入框回车 | 服务端抓 Open Graph（标题、封面图、站点），封面图缓存到本地 |
| 从网页上把图片直接拖进来 | 保存图片本身，同时记下它来自哪个网址 |
| 拖一段选中的文字进来 / 粘贴文字 | 存成「其他」里的文字条目（比如一句好标题） |
| 点卡片 → 右侧抽屉 | 改分类（文件随之移到对应文件夹）、改标题、写评述（自动保存）、打开原文件、在 Finder 中显示、删除（进回收站） |
| 「＋ 新分类」 | 新建分类，同时在素材库里建同名文件夹 |

只监听 `127.0.0.1`，不会暴露到局域网。

## 自动分类的依据（没有 AI，全是可读的规则）

规则都在 `public/classify.js`，一个文件，浏览器和服务端共用。每条结果都会附一句「理由」，显示在提示和抽屉里，所以分错时能看出是哪条规则错了。

| 输入 | 判断 | 分类 |
|---|---|---|
| 图片，检测到底部（或顶部）有一条**均匀底色 + 稀疏文字**的带子，另一侧是图片，交界是一条清楚的直线 | `public/analyze.js` 的 `detectBand`：缩到 96px 宽逐行扫描 | 封面标题 |
| 图片，文件名像截图（Screenshot / 截屏 / スクリーンショット…），但没检测到文字带 | 弱线索，理由里会写「请确认」 | 封面标题 |
| 图片，文件名像相机直出（IMG_ / DSC / PXL_…）或没有其它线索 | — | 照片 |
| GIF / Lottie | — | 动效 |
| 视频，文件名像录屏、或分辨率是手机屏幕尺寸、或 WebM，且 ≤ 20 秒 | `MOTION_MAX_SECONDS` | 动效 |
| 视频，其它 | — | 视频 |
| 链接，域名在 `VIDEO_HOSTS`（YouTube / B站 / Vimeo / 抖音…） | — | 视频 |
| 链接，域名在 `MOTION_HOSTS`（Dribbble / CodePen / LottieFiles / Mobbin…） | — | 动效 |
| 链接，域名在 `PHOTO_HOSTS`（Unsplash / Pinterest / Behance…） | — | 照片 |
| 链接，网页声明 `og:type` 是 video | — | 视频 |
| 链接，其它 | 理由会写「xx 不在已知站点表里」 | 其他 |

改规则：加域名往三个数组里塞；调阈值改 `analyze.js` 顶部的常量。

**已知局限**：文字带检测是启发式的。一张"平坦的天空 + 清楚的地平线 + 几朵云"的照片会被当成"上方有文字带"（天空均匀、云像文字、地平线像交界），测试里专门留了这个用例作为提醒。这类误判点一下改掉即可，`autoCategory` 和 `category` 都会保留，将来想训练一个真正的分类器，这就是现成的标注数据。

## 素材库文件夹结构

```
library/
├── library.json        索引（唯一真源）
├── 封面标题/            原文件按分类放，文件名 = <id>-<原文件名>
├── 照片/
├── 视频/
├── 动效/
├── 其他/
├── _previews/          链接的 og:image 缓存（派生数据，删了也没事）
├── .trash/             删除的条目挪到这里（原文件 + <id>.json 元数据副本），不真删
└── .tmp/               上传中的临时文件
```

`library.json`：

```jsonc
{
  "version": 1,
  "categories": [ { "key": "cover", "label": "封面标题", "hint": "…" }, … ],
  "items": [
    {
      "id": "mtqepnpo-db7f7c",
      "kind": "image",              // image | video | link | text | lottie | other
      "category": "cover",          // 现在的分类（用户可能改过）
      "autoCategory": "cover",      // 规则给出的分类（永远保留，用来对照）
      "autoReason": "底部 29% 是均匀底色上的文字，上方是图片 → 上图下文",
      "title": "…", "note": "评述正文",
      "file": "封面标题/mtqepnpo-db7f7c-xxx.png",   // 相对素材库的路径；链接和文字条目为 null
      "preview": null,              // 链接的封面图缓存路径
      "url": null,                  // 链接本身，或文件的来源网址
      "text": null,                 // 文字条目的正文
      "mime": "image/png", "size": 282624, "sha256": "…",   // sha256 用来去重
      "width": 1080, "height": 1140, "duration": null,
      "analysis": { "band": { "side": "bottom", "ratio": 0.29, "coverage": 0.91 } },
      "og": null,                   // 链接：{ title, description, siteName, type, image, video }
      "addedAt": "2026-09-06T…", "updatedAt": "…"
    }
  ]
}
```

## 接口（给配套工具用）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/library` | 整个索引 + 素材库路径 |
| POST | `/api/items/file` | body 是文件字节，头 `x-item-meta` 是 `encodeURIComponent(JSON)`（name / mime / width / height / duration / category / autoCategory / autoReason / analysis / url） |
| POST | `/api/items/link` | `{ url }`：网页 → 抓 OG；直接指向图片/视频 → 下载成文件条目 |
| POST | `/api/items/text` | `{ text }` |
| PATCH | `/api/items/:id` | `{ category?, title?, note?, … }`，改 category 会移动文件 |
| DELETE | `/api/items/:id` | 移到 `.trash/` |
| POST | `/api/items/:id/reveal` | 在 Finder / 资源管理器里显示 |
| POST | `/api/categories` | `{ label }` |
| GET | `/files/<相对路径>` | 读原文件（支持 Range，视频可拖进度条） |

## 文件

```
server.mjs          本地服务：静态文件、接口、素材库读写、OG 抓取
public/index.html   页面骨架
public/style.css
public/app.js       拖放 / 粘贴 / 卡片 / 抽屉 / 自动保存
public/classify.js  分类规则（浏览器 + 服务端共用）
public/analyze.js   浏览器端媒体分析：尺寸、时长、「上图下文」检测
test/run.mjs        规则与接口测试
```
