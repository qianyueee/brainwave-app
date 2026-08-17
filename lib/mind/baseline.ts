import type { EegSample } from "./types";
import { BAND_KEYS, POOR_SIGNAL_LIMIT, totalPower } from "./types";

/**
 * 10秒ベースラインチェック（非セッション時の3指標算出）。
 *
 * セッション中の Rate は「音響のターゲット周波数へ脳波が同調するまでの時間
 * （Entrainment Lock Time）」で測る。しかし平常時＝音を聴いていないときは
 * 引き込む先の周波数が無いので、その式はそもそも成立しない。設計書の
 * 「測定モードの自動切り替え構造」に従い、非セッション時は別ロジックへ振る：
 *
 *   セッション中（ターゲット周波数あり）… 引き込み応答速度  ← lib/brain-metrics.ts
 *   日常計測（ベースライン）…………………… ここ
 *
 * 日常計測側は設計書の2パターンを両方実装している：
 *   パターン1 Berger効果（開眼⇄閉眼の応答速度）… 既定。ガイド付き10秒タスク
 *   パターン2 静止時の可塑性（スペクトル・エントロピー × 帯域間移動度）
 *             … パターン1が成立しなかったとき（α波の立ち上がりが検出できない、
 *               閉眼区間が読めない）のフォールバック
 *
 * ⚠ サンプリングは 1 Hz（ブリッジの発行レート）。したがって T_α-rise の分解能は
 * 1秒で、閉眼5秒からは 0〜4秒の5段階しか出ない。設計書の式はそのまま実装して
 * あるが、これより細かく測るにはブリッジ側の発行レートを上げる必要がある。
 */

// ─── Protocol ────────────────────────────────────────────────────────────────

/** 画面の進行。設計書の画面イメージ（DAILY BRAIN CHECK）どおりの3段。 */
export const BASELINE_PROTOCOL = {
  /** 「3・2・1」— 姿勢を整えて静止に入る助走。計測には含めない。 */
  countdownSec: 3,
  /** 開眼：画面を見る。 */
  openSec: 5,
  /** 閉眼：チャイム音で目を閉じる。 */
  closeSec: 5,
} as const;

/** 実際に脳波を採る長さ（＝設計書の「10秒」）。カウントダウンは含まない。 */
export const BASELINE_MEASURE_SEC =
  BASELINE_PROTOCOL.openSec + BASELINE_PROTOCOL.closeSec;

export type BaselinePhase = "idle" | "countdown" | "open" | "close" | "done";

/** どちらのロジックで Rate を出したか。UI とレコードに残す。 */
export type BaselineRateMethod = "berger" | "resting";

// ─── Tunables ────────────────────────────────────────────────────────────────

/**
 * 設計書は式の骨格だけを与えていて、重み（w₁/w₂）・T_max・各比率のスケールは
 * 未指定。ここに集約したのは INDICATOR_CONFIG と同じ理由で、実測が貯まったら
 * 分布に合わせて再標定するため。**現在値は暫定** — 式の形は設計書どおりだが、
 * 係数は「健常な反応が中央付近に来る」ことを狙った初期値にすぎない。
 */
export const BASELINE_CONFIG = {
  berger: {
    /** w₁: α波の立ち上がり速度の重み。 */
    riseWeight: 0.5,
    /** w₂: 開眼⇄閉眼のα波メリハリの重み。 */
    contrastWeight: 0.5,
    /**
     * T_max。閉眼区間そのもの——この中でピークに達しなければ速度点は 0。
     * 区間より長い T_max を置くと「測れなかった」と「遅かった」が混ざる。
     */
    maxRiseSec: BASELINE_PROTOCOL.closeSec,
    /** メリハリ点: 比 1.0（変化なし）で 0点、2.0（α波が倍）で 100点。 */
    contrastFloor: 1.0,
    contrastCeil: 2.0,
  },
  resting: {
    /** 帯域間移動度の基準: 秒ごとの優勢帯域が変わる割合。0.5 で満点。 */
    transitionRef: 0.5,
  },
  clarity: {
    /** (40Hzγ + 高α) / 高β。0.3 で 0点、1.5 で 100点。 */
    ratioFloor: 0.3,
    ratioCeil: 1.5,
  },
  reset: {
    /**
     * ゆらぎ補正の効き幅。設計書は「徐波比率 ✕ 脳波のゆらぎ」とだけ書いていて
     * 向きもスケールも与えていないので、**徐波比率を主、ゆらぎを従**とし、
     * ±15% の補正に留めてある（鎮静に向かう脳は徐波が呼吸するように上下し、
     * 固着した脳は平坦、という読み）。0 を渡せば補正なしに戻せる。
     */
    fluctuationSpan: 0.15,
    /** この変動係数で補正が最大になる。 */
    fluctuationRef: 0.3,
  },
  artifact: {
    /**
     * まばたき・食いしばりの筋電。1秒の総パワーが中央値のこの倍を超えたら
     * その秒を捨てる（設計書の「簡易的なノイズ除去フィルター」）。10秒しか
     * 無いので除去は最小限——外れ値だけを落とし、弱い秒は残す。
     */
    outlierFactor: 3,
  },
} as const;

// ─── Small helpers ───────────────────────────────────────────────────────────

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clamp100 = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** 算出できた値は 5pt を下限に（0 が並ぶと故障に見える。3指標の既存方針と同じ）。 */
const floor5 = (v: number) => Math.max(5, clamp100(v));

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

/** 変動係数（標準偏差 / 平均）。平均 0 なら 0。 */
function cv(xs: number[]): number {
  const m = mean(xs);
  if (m === 0) return 0;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(v) / m;
}

/** 0..1 に正規化した線形マッピング（floor 以下 0、ceil 以上 1）。 */
function ramp(v: number, floor: number, ceil: number): number {
  if (ceil <= floor) return 0;
  return clamp01((v - floor) / (ceil - floor));
}

// ─── Artifact rejection ──────────────────────────────────────────────────────

/**
 * 使える秒だけを残す。電極が読めていない秒（POOR_SIGNAL）と、総パワーが
 * 中央値から突出した秒（まばたき・食いしばり）を落とす。
 */
export function usableSamples(samples: EegSample[]): EegSample[] {
  const contact = samples.filter(
    (s) => (s.signal ?? 0) <= POOR_SIGNAL_LIMIT && totalPower(s) > 0
  );
  if (contact.length < 3) return contact; // 少なすぎると中央値が意味を持たない
  const ceiling = median(contact.map(totalPower)) * BASELINE_CONFIG.artifact.outlierFactor;
  return contact.filter((s) => totalPower(s) <= ceiling);
}

// ─── Band shares ─────────────────────────────────────────────────────────────

/**
 * 1秒の帯域を相対比（合計 1）で返す。生の ASIC 値は無次元で機体ごとに 50倍も
 * 違うので、絶対値ではなく必ず比で扱う——開眼と閉眼の比較も、接触状態の
 * ドリフトに巻き込まれないようここで正規化しておく。
 */
function shares(s: EegSample): Record<(typeof BAND_KEYS)[number], number> {
  const total = totalPower(s);
  const out = {} as Record<(typeof BAND_KEYS)[number], number>;
  for (const k of BAND_KEYS) out[k] = total > 0 ? s[k] / total : 0;
  return out;
}

/**
 * α波（8〜12Hz）の相対パワー。設計書の α は 8〜12Hz、ThinkGear の帯域では
 * 低α(8-10) + 高α(10-13) がこれに最も近い。生パワーではなく相対比を使うのは
 * shares() のとおり——Berger 効果で見たいのは「他の帯域に対してαがどれだけ
 * 立ったか」であって、電極の当たり具合で上下する絶対振幅ではない。
 */
export function alphaShare(s: EegSample): number {
  const b = shares(s);
  return b.lowAlpha + b.highAlpha;
}

// ─── パターン1: Berger効果（開眼⇄閉眼） ──────────────────────────────────────

export interface BergerResult {
  /** T_α-rise: 閉眼開始から α波がピークに達するまでの秒数。検出不能なら null。 */
  alphaRiseSec: number | null;
  /** P_α(Close) / P_α(Open): 切り替えのメリハリ度。開眼側が読めなければ null。 */
  alphaRatio: number | null;
  /** 0-100。成立しなかった（α波の立ち上がりが無い等）場合は null。 */
  score: number | null;
}

/**
 * Rate = ( w₁ × (T_max − T_α-rise)/T_max + w₂ × normalize(P_α(Close)/P_α(Open)) ) × 100
 *
 * 閉眼した瞬間に一気にαが立ち、開眼時との差が大きいほど高得点。自律神経が
 * 硬直していると閉眼してもβ波（緊張）が残り、αの立ち上がりが遅れて点が下がる。
 */
export function bergerRate(open: EegSample[], close: EegSample[]): BergerResult {
  const none: BergerResult = { alphaRiseSec: null, alphaRatio: null, score: null };
  const o = usableSamples(open);
  const c = usableSamples(close);
  if (!o.length || !c.length) return none;

  const openAlpha = mean(o.map(alphaShare));
  const closeAlphas = c.map(alphaShare);
  const peak = Math.max(...closeAlphas);

  // 開眼時より閉眼時のαが高くならなければ Berger 反応そのものが出ていない。
  // 「遅い（低得点）」ではなく「測れていない」なので、静止時ロジックへ渡す。
  if (openAlpha <= 0 || peak <= openAlpha) return none;

  // 1 Hz サンプルなので、配列の添字がそのまま閉眼開始からの経過秒になる。
  const riseSec = closeAlphas.indexOf(peak);
  const ratio = peak / openAlpha;

  const { riseWeight, contrastWeight, maxRiseSec, contrastFloor, contrastCeil } =
    BASELINE_CONFIG.berger;
  const riseTerm = clamp01((maxRiseSec - riseSec) / maxRiseSec);
  const contrastTerm = ramp(ratio, contrastFloor, contrastCeil);

  return {
    alphaRiseSec: riseSec,
    alphaRatio: ratio,
    score: floor5((riseWeight * riseTerm + contrastWeight * contrastTerm) * 100),
  };
}

// ─── パターン2: 静止時の可塑性 ───────────────────────────────────────────────

/**
 * スペクトル・エントロピー（0-1）。8帯域の相対パワー分布のシャノン
 * エントロピーを ln(8) で正規化したもの。特定の周波数に固着していれば低く、
 * 全帯域に散っていれば高い。
 */
export function spectralEntropy(s: EegSample): number {
  const b = shares(s);
  let h = 0;
  for (const k of BAND_KEYS) {
    const p = b[k];
    if (p > 0) h -= p * Math.log(p);
  }
  return clamp01(h / Math.log(BAND_KEYS.length));
}

/** その秒でいちばん強い帯域。 */
function dominantBand(s: EegSample): string {
  const b = shares(s);
  let best = BAND_KEYS[0] as string;
  let bestV = -1;
  for (const k of BAND_KEYS) {
    if (b[k] > bestV) {
      bestV = b[k];
      best = k;
    }
  }
  return best;
}

/** 帯域間移動度: 隣り合う秒で優勢帯域が入れ替わった割合（0-1）。 */
export function bandTransitionRate(samples: EegSample[]): number {
  if (samples.length < 2) return 0;
  const dom = samples.map(dominantBand);
  let changes = 0;
  for (let i = 1; i < dom.length; i++) if (dom[i] !== dom[i - 1]) changes++;
  return changes / (dom.length - 1);
}

/**
 * Rate = Spectral Entropy × Band Transition Rate
 *
 * 可塑性が高い脳は特定の周波数に固着せず滑らかに揺らぐ（高得点）。思考が
 * コリ固まっていると高β（緊張・焦躁）や低θ（慢性疲労）に「フリーズ」する。
 */
export function restingRate(samples: EegSample[]): number | null {
  const s = usableSamples(samples);
  if (s.length < 2) return null;
  const entropy = mean(s.map(spectralEntropy));
  const transition = clamp01(
    bandTransitionRate(s) / BASELINE_CONFIG.resting.transitionRef
  );
  return floor5(entropy * transition * 100);
}

// ─── Clarity / Reset（10秒版） ───────────────────────────────────────────────

/**
 * Brain Clarity: 高β（雑念・ストレスで増える雑音）に対する 40Hz(γ) と
 * 高α(10〜12Hz) の相対パワー比率。
 *
 * ⚠ セッション由来の Clarity（lib/brain-metrics.ts）とは式が違う。あちらは
 * 高β+γの占有率＝覚醒帯域の量を見るのに対し、こちらは設計書どおり高βを
 * **分母**（雑音）に置く。平常時は「冴えているか」を雑音との比で見るという
 * 判断で、セッション中の「どれだけ活性しているか」とは問いが別。
 */
export function baselineClarity(samples: EegSample[]): number | null {
  const s = usableSamples(samples);
  if (!s.length) return null;
  const ratios = s.map((x) => {
    const b = shares(x);
    // 高γ(40-45Hz) が設計書の「40Hz（ガンマ波）」を含む帯域。
    const signal = b.highGamma + b.highAlpha;
    return b.highBeta > 0 ? signal / b.highBeta : 0;
  });
  const { ratioFloor, ratioCeil } = BASELINE_CONFIG.clarity;
  return floor5(ramp(mean(ratios), ratioFloor, ratioCeil) * 100);
}

/**
 * Brain Reset: 徐波（θ・δ）比率 ✕ 脳波のゆらぎ。過剰な覚醒βが抑えられ、
 * 低周波が優位になっているほど高い。
 */
export function baselineReset(samples: EegSample[]): number | null {
  const s = usableSamples(samples);
  if (!s.length) return null;
  const slowShares = s.map((x) => {
    const b = shares(x);
    return b.delta + b.theta;
  });
  const base = mean(slowShares) * 100;

  const { fluctuationSpan, fluctuationRef } = BASELINE_CONFIG.reset;
  const fluct = clamp01(cv(slowShares) / fluctuationRef);
  const gain = 1 - fluctuationSpan + 2 * fluctuationSpan * fluct;

  return floor5(base * gain);
}

// ─── 3指標をまとめて ─────────────────────────────────────────────────────────

export interface BaselineScores {
  rate: number | null;
  clarity: number | null;
  reset: number | null;
  method: BaselineRateMethod;
  /** T_α-rise（秒）。Berger で算出できたときのみ。 */
  alphaRiseSec: number | null;
  /** P_α(Close)/P_α(Open)。Berger で算出できたときのみ。 */
  alphaRatio: number | null;
  /** アーティファクト除去後に残った秒数。0 ならこの計測は使えない。 */
  usableSec: number;
}

/**
 * 開眼5秒・閉眼5秒から3指標を出す。Rate はまず Berger（パターン1）で試み、
 * 成立しなければ10秒全体の静止時可塑性（パターン2）へ落ちる。Clarity と
 * Reset は10秒全体を使う（設計書どおり、こちらはタスクに依存しない）。
 */
export function computeBaselineScores(
  open: EegSample[],
  close: EegSample[]
): BaselineScores {
  const all = [...open, ...close];
  const usableSec = usableSamples(all).length;

  const berger = bergerRate(open, close);
  const useBerger = berger.score != null;

  return {
    rate: useBerger ? berger.score : restingRate(all),
    clarity: baselineClarity(all),
    reset: baselineReset(all),
    method: useBerger ? "berger" : "resting",
    alphaRiseSec: useBerger ? berger.alphaRiseSec : null,
    alphaRatio: useBerger ? berger.alphaRatio : null,
    usableSec,
  };
}

/** 「開眼⇄閉眼テスト」/「静止時脳波の可塑性」— レコードと UI の表示名。 */
export function rateMethodLabel(method: BaselineRateMethod): string {
  return method === "berger"
    ? "開眼⇄閉眼テスト（Berger応答）"
    : "静止時脳波の可塑性（ゆらぎ）";
}
