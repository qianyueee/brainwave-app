// 规则分类器 —— 浏览器与服务端共用（纯 ESM，无依赖，不含任何 AI）。
//
// 输入是一个「特征包」(见 classify 的 JSDoc)，输出 { category, reason }。
// 分类错了由用户在界面上改；这里只负责给出一个"有依据的第一猜测"，
// 并把依据写成一句人话（reason），让人一眼看出它为什么这么猜。
//
// 想调整规则：改下面的 host 列表 / 阈值即可，不需要动其它文件。

/** 默认分类。key 是程序用的稳定标识，label 同时是磁盘上的文件夹名。 */
export const DEFAULT_CATEGORIES = [
  { key: "cover", label: "封面标题", hint: "上图下文的封面／标题样本" },
  { key: "photo", label: "照片", hint: "觉得美的图片" },
  { key: "video", label: "视频", hint: "视频链接或录屏" },
  { key: "motion", label: "动效", hint: "动画效果的录屏 / GIF（将来交给 AI 复现）" },
  { key: "misc", label: "其他", hint: "暂时归不进去的" },
];

// ---------- 链接：按域名 ----------
export const VIDEO_HOSTS = [
  "youtube.com", "youtu.be", "bilibili.com", "b23.tv", "vimeo.com",
  "tiktok.com", "douyin.com", "kuaishou.com", "twitch.tv", "nicovideo.jp",
  "ixigua.com", "v.qq.com", "youku.com", "dailymotion.com",
];
export const MOTION_HOSTS = [
  "dribbble.com", "codepen.io", "lottiefiles.com", "motion.dev", "uiverse.io",
  "animista.net", "rive.app", "spline.design", "jitter.video", "giphy.com",
  "tenor.com", "framer.com", "mobbin.com", "screenlane.com", "pageflows.com",
  "codesandbox.io", "stackblitz.com",
];
export const PHOTO_HOSTS = [
  "unsplash.com", "pexels.com", "500px.com", "flickr.com", "pinterest.com",
  "pinterest.jp", "pin.it", "behance.net", "artstation.com", "deviantart.com",
  "pixiv.net", "visualhunt.com", "huaban.com",
];

// ---------- 文件名线索 ----------
const SCREEN_RECORD_NAME = /screen ?record|screencast|screen capture|录屏|屏幕录制|画面収録|simulator screen|kapture|cleanshot|loom|gifcap|录制/i;
const SCREENSHOT_NAME = /screen ?shot|screenshot|截图|截屏|スクリーンショット|snipaste|shottr|cleanshot|capture/i;
const CAMERA_NAME = /^(img|dsc|dscf|dscn|pxl|mvimg|p\d{7}|photo)[_\-\s\d]/i;

// 手机录屏的常见分辨率（竖屏）。相机拍的竖屏视频是 1080×1920 / 2160×3840，不在此列。
const PHONE_SCREEN_SIZES = new Set([
  "886x1920", "1170x2532", "1179x2556", "1290x2796", "1206x2622", "1320x2868",
  "1125x2436", "1242x2688", "1284x2778", "828x1792", "750x1334", "1080x2340",
  "1080x2400", "1080x2412", "1440x3200", "1440x3088", "1080x2376",
]);

/** 短于这个秒数的录屏视为「动效」，更长的视为「视频」。 */
export const MOTION_MAX_SECONDS = 20;

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function hostMatches(host, list) {
  return list.find((h) => host === h || host.endsWith("." + h));
}

export function isHttpUrl(text) {
  return /^https?:\/\/\S+$/i.test((text || "").trim());
}

export const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|tiff?|heic|heif|svg)$/i;
export const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|gif)$/i;

/** 从 mime / 文件名推断媒体种类：image | video | lottie | other */
export function mediaKind(mime = "", name = "") {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (/\.(lottie)$/i.test(name)) return "lottie";
  if (/\.json$/i.test(name) && /lottie|anim/i.test(name)) return "lottie";
  if (IMAGE_EXT.test(name)) return "image";
  if (VIDEO_EXT.test(name)) return "video";
  return "other";
}

/**
 * @param {object} f 特征包
 * @param {"image"|"video"|"link"|"text"|"lottie"|"other"} f.kind
 * @param {string} [f.name]      文件名
 * @param {string} [f.mime]
 * @param {number} [f.width]
 * @param {number} [f.height]
 * @param {number} [f.duration]  秒
 * @param {string} [f.url]       链接 / 文件来源 URL
 * @param {object} [f.og]        服务端抓到的 Open Graph：{ type, video, image, siteName }
 * @param {object} [f.analysis]  浏览器端像素分析：{ band: { side, ratio, coverage } | null }
 * @returns {{ category: string, reason: string }}
 */
export function classify(f) {
  const name = f.name || "";
  const host = f.url ? hostOf(f.url) : "";

  // ---------- 链接 ----------
  if (f.kind === "link") {
    let h;
    if ((h = hostMatches(host, VIDEO_HOSTS))) return { category: "video", reason: `视频站点 ${h}` };
    if (host.endsWith("instagram.com") && /\/reels?\//.test(f.url)) return { category: "video", reason: "Instagram Reel" };
    if ((h = hostMatches(host, MOTION_HOSTS))) return { category: "motion", reason: `动效／交互作品站点 ${h}` };
    if ((h = hostMatches(host, PHOTO_HOSTS))) return { category: "photo", reason: `图片站点 ${h}` };
    const ogType = (f.og && f.og.type) || "";
    if (/^video/.test(ogType) || (f.og && f.og.video)) return { category: "video", reason: "网页声明自己是视频 (og:type)" };
    if (host.endsWith("instagram.com") && /\/p\//.test(f.url)) return { category: "photo", reason: "Instagram 图文帖" };
    return { category: "misc", reason: host ? `${host} 不在已知站点表里` : "无法识别的链接" };
  }

  if (f.kind === "text") return { category: "misc", reason: "纯文字片段" };
  if (f.kind === "lottie") return { category: "motion", reason: "Lottie 动画文件" };

  // ---------- 图片 ----------
  if (f.kind === "image") {
    if (/gif$/i.test(f.mime || "") || /\.gif$/i.test(name)) return { category: "motion", reason: "GIF 通常是动画" };
    const band = f.analysis && f.analysis.band;
    if (band) {
      const side = band.side === "bottom" ? "底部" : "顶部";
      return {
        category: "cover",
        reason: `${side} ${Math.round(band.ratio * 100)}% 是均匀底色上的文字，上方是图片 → 上图下文`,
      };
    }
    if (CAMERA_NAME.test(name)) return { category: "photo", reason: "文件名像相机直出" };
    if (SCREENSHOT_NAME.test(name)) return { category: "cover", reason: "文件名像截图（未检测到文字色带，请确认）" };
    return { category: "photo", reason: f.width ? `${ratioLabel(f.width, f.height)} 的普通图片` : "普通图片" };
  }

  // ---------- 视频 ----------
  if (f.kind === "video") {
    const clues = [];
    if (SCREEN_RECORD_NAME.test(name)) clues.push("文件名像录屏");
    if (f.width && f.height && PHONE_SCREEN_SIZES.has(`${f.width}x${f.height}`)) clues.push(`${f.width}×${f.height} 是手机屏幕尺寸`);
    if (/webm$/i.test(f.mime || "") || /\.webm$/i.test(name)) clues.push("WebM 多为浏览器录制");
    if (clues.length) {
      if (f.duration != null && f.duration <= MOTION_MAX_SECONDS) {
        return { category: "motion", reason: `${clues.join("，")}，且只有 ${Math.round(f.duration)} 秒 → 动效片段` };
      }
      return { category: "video", reason: `${clues.join("，")}${f.duration != null ? `，时长 ${Math.round(f.duration)} 秒` : ""}` };
    }
    return { category: "video", reason: f.duration != null ? `普通视频，${Math.round(f.duration)} 秒` : "普通视频" };
  }

  return { category: "misc", reason: "不认识的文件类型" };
}

/** 把宽高归到最近的常见比例，如 "16:9"、"3:4"；对不上就给 "W×H"。 */
export function ratioLabel(w, h) {
  if (!w || !h) return "";
  const r = w / h;
  const known = [
    ["16:9", 16 / 9], ["9:16", 9 / 16], ["4:3", 4 / 3], ["3:4", 3 / 4],
    ["1:1", 1], ["3:2", 3 / 2], ["2:3", 2 / 3], ["21:9", 21 / 9], ["4:5", 4 / 5], ["5:4", 5 / 4],
  ];
  let best = null;
  for (const [label, v] of known) {
    const d = Math.abs(r - v) / v;
    if (d < 0.04 && (!best || d < best.d)) best = { label, d };
  }
  return best ? best.label : `${w}×${h}`;
}
