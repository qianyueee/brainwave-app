// 浏览器端媒体分析（无 AI）：读尺寸 / 时长，并检测「上图下文」结构。
//
// 上图下文的封面：图片占上方大部分，下面（或上面）有一条均匀底色的带子，
// 带子上稀疏地放着文字。做法：把图缩到 96px 宽，逐行扫描——找一个分割线，
// 使一侧几乎全是同一个颜色（底色覆盖率高、但不是 100%，因为有字），
// 另一侧色彩丰富（照片）。找到就返回 band，找不到返回 null。

const SCAN_WIDTH = 96;
const BG_TOLERANCE = 34;        // 与底色的最大通道差，超过就不算"底色"
const MIN_BAND = 0.10;          // 带子至少占整图高度的比例
const MAX_BAND = 0.5;           // 带子最多占的比例
const BAND_MIN_COVERAGE = 0.62; // 带子里底色至少要覆盖这么多（其余是文字）
const BAND_MIN_TEXT = 0.008;    // 带子内部（不含紧挨图片的那一行）至少要有这么多非底色像素＝有字；纯留白/边框不算封面
const PICTURE_MAX_COVERAGE = 0.4; // 图片那一侧不能也全是这个底色
const PICTURE_MIN_ACTIVITY = 5;  // 图片那一侧的行内平均相邻像素差（0-255）
const TIGHT_TOLERANCE = 12;      // 底色要"真的一样"：渐变的天空过不了这一关
const TIGHT_MIN_COVERAGE = 0.5;
const EDGE_MIN_DIFF = 24;        // 图片与带子的交界要是一条清楚的直线
const EDGE_MIN_FRACTION = 0.5;   // 交界行至少这么多列有明显跳变

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
    img.src = url;
  });
}

export function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = url;
  });
}

/** @returns {Promise<{width:number,height:number,analysis:{band:object|null}}|null>} */
export async function analyzeImageFile(file) {
  let img;
  try { img = await loadImage(file); } catch { return null; }
  return analyzeImageElement(img);
}

export function analyzeImageElement(img) {
  const width = img.naturalWidth, height = img.naturalHeight;
  if (!width || !height) return null;
  let band = null;
  try { band = detectBand(img, width, height); } catch { band = null; }
  return { width, height, analysis: { band } };
}

export function detectBand(img, width, height) {
  const W = Math.min(SCAN_WIDTH, width);
  const H = Math.max(12, Math.round(height * (W / width)));
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const nearTol = (a, b, t) => Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t;
  const near = (a, b) => nearTol(a, b, BG_TOLERANCE);

  // 每行的活动度：相邻像素亮度差的平均
  const activity = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = 1; x < W; x++) {
      const a = px(x, y), b = px(x - 1, y);
      s += Math.abs((a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2])) / 3;
    }
    activity[y] = s / (W - 1);
  }

  // 估计某个行区间的底色：取区间左右两列 + 端行的众数颜色（量化到 8 级）
  function estimateBg(y0, y1, edgeRow) {
    const counts = new Map(); const samples = [];
    const push = (c) => { samples.push(c); const k = `${c[0] >> 4},${c[1] >> 4},${c[2] >> 4}`; counts.set(k, (counts.get(k) || 0) + 1); };
    for (let y = y0; y < y1; y++) { push(px(0, y)); push(px(1, y)); push(px(W - 1, y)); push(px(W - 2, y)); }
    for (let x = 0; x < W; x++) push(px(x, edgeRow));
    let bestK = null, bestN = -1;
    for (const [k, n] of counts) if (n > bestN) { bestN = n; bestK = k; }
    // 众数桶的平均值作为底色
    let r = 0, g = 0, b = 0, n = 0;
    for (const c of samples) { if (`${c[0] >> 4},${c[1] >> 4},${c[2] >> 4}` === bestK) { r += c[0]; g += c[1]; b += c[2]; n++; } }
    return [r / n, g / n, b / n];
  }
  function coverage(y0, y1, bg, tol = BG_TOLERANCE) {
    let hit = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) if (nearTol(px(x, y), bg, tol)) hit++;
    return hit / ((y1 - y0) * W);
  }
  // 交界处：有多少列在相邻两行之间发生了明显跳变
  function edgeFraction(yA, yB) {
    let n = 0;
    for (let x = 0; x < W; x++) {
      const a = px(x, yA), b = px(x, yB);
      if (Math.abs((a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2])) / 3 >= EDGE_MIN_DIFF) n++;
    }
    return n / W;
  }
  function meanActivity(y0, y1) {
    let s = 0; for (let y = y0; y < y1; y++) s += activity[y]; return s / (y1 - y0);
  }

  let best = null;
  const minRows = Math.max(3, Math.round(H * MIN_BAND));
  const maxRows = Math.round(H * MAX_BAND);
  for (let rows = minRows; rows <= maxRows; rows++) {
    // 底部带
    {
      const y0 = H - rows;
      const bg = estimateBg(y0, H, H - 1);
      const cov = coverage(y0, H, bg);
      const picCov = coverage(0, y0, bg);
      const act = meanActivity(0, y0);
      const text = 1 - coverage(y0 + 1, H, bg);
      const score = cov - picCov;
      if (cov >= BAND_MIN_COVERAGE && text >= BAND_MIN_TEXT && picCov <= PICTURE_MAX_COVERAGE && act >= PICTURE_MIN_ACTIVITY
        && coverage(y0, H, bg, TIGHT_TOLERANCE) >= TIGHT_MIN_COVERAGE && edgeFraction(y0 - 1, y0) >= EDGE_MIN_FRACTION) {
        if (!best || score > best.score) best = { side: "bottom", ratio: rows / H, coverage: cov, score };
      }
    }
    // 顶部带
    {
      const y1 = rows;
      const bg = estimateBg(0, y1, 0);
      const cov = coverage(0, y1, bg);
      const picCov = coverage(y1, H, bg);
      const act = meanActivity(y1, H);
      const text = 1 - coverage(0, y1 - 1, bg);
      const score = cov - picCov;
      if (cov >= BAND_MIN_COVERAGE && text >= BAND_MIN_TEXT && picCov <= PICTURE_MAX_COVERAGE && act >= PICTURE_MIN_ACTIVITY
        && coverage(0, y1, bg, TIGHT_TOLERANCE) >= TIGHT_MIN_COVERAGE && edgeFraction(y1 - 1, y1) >= EDGE_MIN_FRACTION) {
        if (!best || score > best.score) best = { side: "top", ratio: rows / H, coverage: cov, score };
      }
    }
  }
  if (!best) return null;
  return { side: best.side, ratio: round2(best.ratio), coverage: round2(best.coverage) };
}

const round2 = (v) => Math.round(v * 100) / 100;

/** 读视频的宽高 / 时长；解不开（如 HEVC）或超时则返回 null。 */
export function analyzeVideoFile(file, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata"; v.muted = true;
    const done = (r) => { clearTimeout(t); URL.revokeObjectURL(url); v.removeAttribute("src"); resolve(r); };
    const t = setTimeout(() => done(null), timeoutMs);
    v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight, duration: isFinite(v.duration) ? v.duration : null });
    v.onerror = () => done(null);
    v.src = url;
  });
}
