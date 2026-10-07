/**
 * analyze-brain — 脳特性の AI 分析（DeepSeek）の窓口。Supabase Edge Function（Deno）。
 *
 * 画面（Sync Report の大脳特性の下）から測定の**数値だけ**を受け取り、ここで
 * プロンプトを組んで DeepSeek に問い合わせ、結果を user_brain_analyses に保存して
 * 返す。API キーはこの関数の Secrets（DEEPSEEK_API_KEY）にだけ置く——アプリは
 * 静的な書き出しなので、キーを画面側に置くと誰にでも見える。
 *
 * ■ なぜ数値だけ受け取るか
 * クライアントが文章を送れると、この関数は「ログインさえすれば誰でも持ち主の
 * DeepSeek を使える窓口」になる。形を厳密に確かめた数値の束だけを受け取り、
 * 文章はすべてここで組む。メモ・測定者名もそもそも受け取らない。
 *
 * ■ 形は lib/brain-analysis.ts と同じ
 * validateInput はクライアントの BrainAnalysisInput をそのまま写したもの。片方を
 * 変えたらもう片方も直し、INPUT_VERSION を上げる。`pnpm check:analysis` が
 * この検査・プロンプト・返事の読み取り・関数の流れを node で確かめる。
 *
 * ■ 依存なし（fetch だけ）
 * Dashboard のエディタに1ファイルで貼れて、node でもそのまま読めるように、
 * supabase-js も使わず REST（/auth/v1/user・PostgREST）を直接呼ぶ。
 *
 * デプロイ手順は同じフォルダの README.md。
 */

export const INPUT_VERSION = 1;
/** 1人1日（日本時間）の回数。数えるのは claim_ai_analysis()（migration 006）。 */
export const DAILY_LIMIT = 20;
/** 同じ測定を続けて分析し直せるまでの秒数（二度押し・連打よけ）。 */
export const COOLDOWN_SEC = 30;
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";
const UPSTREAM_TIMEOUT_MS = 60_000;
const MAX_BODY_BYTES = 32_000;

const CORS_HEADERS: Record<string, string> = {
  // Web（GitHub Pages）・Android（https://localhost）・Windows（http://127.0.0.1:17860）の
  // どこからでも呼ばれる。どの呼び出しもログインのトークンが要るので * でよい。
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── 受け取る形（lib/brain-analysis.ts の BrainAnalysisInput と同じ） ─────────

export const BAND_KEYS = [
  "delta",
  "theta",
  "lowAlpha",
  "highAlpha",
  "lowBeta",
  "highBeta",
  "lowGamma",
  "highGamma",
] as const;
type BandKey = (typeof BAND_KEYS)[number];
type Bands = Record<BandKey, number>;

export const INDICATOR_KEYS = [
  "focusIntensity",
  "focusSpeed",
  "sustainedFocus",
  "relaxationDepth",
  "calmnessSpeed",
  "calmnessStability",
] as const;
type IndicatorKey = (typeof INDICATOR_KEYS)[number];

export type Locale = "ja" | "en";

export interface TimelineSegment {
  usablePct: number;
  attention: number | null;
  relaxation: number | null;
  bands: Bands | null;
}

export interface AnalysisInput {
  v: number;
  uploadedAt: string;
  locale: Locale;
  hourOfDay: number;
  durationSec: number | null;
  qualityPct: number | null;
  targetHz: number;
  targetHzSet: boolean;
  indicators: Record<IndicatorKey, number>;
  composite: number;
  condition: { rate: number | null; clarity: number | null; reset: number | null };
  bands: Bands | null;
  spectrum: number[] | null;
  features: {
    alphaPeakHz: number | null;
    targetResonance: number | null;
    thetaBetaRatio: number | null;
    slowFastRatio: number | null;
  };
  timeline: { segmentSec: number; segments: TimelineSegment[] } | null;
}

export interface AnalysisContent {
  summary: string;
  strengths: string[];
  cautions: string[];
  course: string | null;
  suggestions: string[];
}

class Invalid extends Error {}

function obj(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Invalid();
  const o = v as Record<string, unknown>;
  // 知らない項目は断る（形を広げるときは版を上げる）。
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw new Invalid();
  return o;
}

function num(v: unknown, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Invalid();
  return v;
}

function numOrNull(v: unknown, min: number, max: number): number | null {
  return v === null ? null : num(v, min, max);
}

function int(v: unknown, min: number, max: number): number {
  const n = num(v, min, max);
  if (!Number.isInteger(n)) throw new Invalid();
  return n;
}

function bands(v: unknown): Bands {
  const o = obj(v, BAND_KEYS);
  const out = {} as Bands;
  for (const k of BAND_KEYS) out[k] = num(o[k], 0, 100);
  return out;
}

/** 受け取った本文 → AnalysisInput。形が1か所でも違えば null。 */
export function validateInput(body: unknown): AnalysisInput | null {
  try {
    const o = obj(body, [
      "v",
      "uploadedAt",
      "locale",
      "hourOfDay",
      "durationSec",
      "qualityPct",
      "targetHz",
      "targetHzSet",
      "indicators",
      "composite",
      "condition",
      "bands",
      "spectrum",
      "features",
      "timeline",
    ]);
    if (o.v !== INPUT_VERSION) throw new Invalid();
    // 測定のキー。DB の照合にしか使わない（プロンプトには入れない）。
    if (typeof o.uploadedAt !== "string" || !/^[\x20-\x7E]{1,64}$/.test(o.uploadedAt)) {
      throw new Invalid();
    }
    if (o.locale !== "ja" && o.locale !== "en") throw new Invalid();
    if (typeof o.targetHzSet !== "boolean") throw new Invalid();

    const ind = obj(o.indicators, INDICATOR_KEYS);
    const indicators = {} as Record<IndicatorKey, number>;
    for (const k of INDICATOR_KEYS) indicators[k] = num(ind[k], 0, 100);

    const cond = obj(o.condition, ["rate", "clarity", "reset"]);
    const f = obj(o.features, ["alphaPeakHz", "targetResonance", "thetaBetaRatio", "slowFastRatio"]);

    let spectrum: number[] | null = null;
    if (o.spectrum !== null) {
      if (!Array.isArray(o.spectrum) || o.spectrum.length < 1 || o.spectrum.length > 50) {
        throw new Invalid();
      }
      spectrum = o.spectrum.map((x) => num(x, 0, 100));
    }

    let timeline: AnalysisInput["timeline"] = null;
    if (o.timeline !== null) {
      const t = obj(o.timeline, ["segmentSec", "segments"]);
      if (!Array.isArray(t.segments) || t.segments.length < 1 || t.segments.length > 10) {
        throw new Invalid();
      }
      timeline = {
        segmentSec: int(t.segmentSec, 1, 86_400),
        segments: t.segments.map((s) => {
          const g = obj(s, ["usablePct", "attention", "relaxation", "bands"]);
          return {
            usablePct: num(g.usablePct, 0, 100),
            attention: numOrNull(g.attention, 0, 100),
            relaxation: numOrNull(g.relaxation, 0, 100),
            bands: g.bands === null ? null : bands(g.bands),
          };
        }),
      };
    }

    return {
      v: INPUT_VERSION,
      uploadedAt: o.uploadedAt,
      locale: o.locale,
      hourOfDay: int(o.hourOfDay, 0, 23),
      durationSec: o.durationSec === null ? null : int(o.durationSec, 0, 86_400),
      qualityPct: numOrNull(o.qualityPct, 0, 100),
      targetHz: num(o.targetHz, 1, 45),
      targetHzSet: o.targetHzSet,
      indicators,
      composite: num(o.composite, 0, 100),
      condition: {
        rate: numOrNull(cond.rate, 0, 100),
        clarity: numOrNull(cond.clarity, 0, 100),
        reset: numOrNull(cond.reset, 0, 100),
      },
      bands: o.bands === null ? null : bands(o.bands),
      spectrum,
      features: {
        alphaPeakHz: numOrNull(f.alphaPeakHz, 8, 13),
        targetResonance: numOrNull(f.targetResonance, 0, 1000),
        thetaBetaRatio: numOrNull(f.thetaBetaRatio, 0, 1000),
        slowFastRatio: numOrNull(f.slowFastRatio, 0, 1000),
      },
      timeline,
    };
  } catch (e) {
    if (e instanceof Invalid) return null;
    throw e;
  }
}

// ─── プロンプト ───────────────────────────────────────────────────────────────

/** 画面と同じ名前（lib/brain-profile.ts の INDICATOR_META・lib/brain-metrics.ts）。 */
const INDICATOR_LABELS: Record<IndicatorKey, { ja: string; en: string; about: string }> = {
  focusIntensity: {
    ja: "集中の強さ",
    en: "Focus strength",
    about: "selective attention: how strongly the brain directs its energy to one goal and shuts out distractions",
  },
  focusSpeed: {
    ja: "集中の速度",
    en: "Focus speed",
    about: "alternating attention: how quickly focus switches on (mental flexibility)",
  },
  sustainedFocus: {
    ja: "集中の持続度",
    en: "Focus endurance",
    about: "sustained attention: how long a steady, focused state is kept",
  },
  relaxationDepth: {
    ja: "リラックスの深さ",
    en: "Relaxation depth",
    about: "how deeply the brain relaxes (alpha / theta activity); recovery power",
  },
  calmnessSpeed: {
    ja: "入定の速度",
    en: "Settling speed",
    about: "how quickly the brain switches from tension to a calm, settled state",
  },
  calmnessStability: {
    ja: "平静の持続度",
    en: "Calm endurance",
    about: "how steadily calm is kept once reached; resilience to stress",
  },
};

const CONDITION_LABELS = {
  rate: {
    ja: "Rate（切り替え力・脳の適応同調度）",
    en: "Rate (switching & adaptability)",
    about: "settling speed blended with how clearly the brain responds at the target frequency",
  },
  clarity: {
    ja: "Clarity（脳の明晰度・ひらめき・集中度）",
    en: "Clarity (sharpness, insight & focus)",
    about: "share of high-beta and gamma activity; alert, clear-headed state",
  },
  reset: {
    ja: "Reset（脳のリフレッシュ度・ディープ休息率）",
    en: "Reset (refresh & deep rest)",
    about: "share of delta and theta activity; deep rest",
  },
} as const;

const BAND_LABELS: Record<BandKey, { ja: string; en: string; hz: string }> = {
  delta: { ja: "δ波", en: "Delta", hz: "1-4Hz" },
  theta: { ja: "θ波", en: "Theta", hz: "4-8Hz" },
  lowAlpha: { ja: "低α波", en: "Low-Alpha", hz: "8-10Hz" },
  highAlpha: { ja: "高α波", en: "High-Alpha", hz: "10-13Hz" },
  lowBeta: { ja: "低β波", en: "Low-Beta", hz: "13-18Hz" },
  highBeta: { ja: "高β波", en: "High-Beta", hz: "18-30Hz" },
  lowGamma: { ja: "低γ波", en: "Low-Gamma", hz: "30-40Hz" },
  highGamma: { ja: "高γ波", en: "Mid-Gamma", hz: "40-45Hz" },
};

const r1 = (v: number) => Math.round(v * 10) / 10;

/** 区間ごとの割合は5つの波にまとめる（8つ×10区間は読み手の AI にも多すぎる）。 */
function groupBands(b: Bands) {
  return {
    delta: r1(b.delta),
    theta: r1(b.theta),
    alpha: r1(b.lowAlpha + b.highAlpha),
    beta: r1(b.lowBeta + b.highBeta),
    gamma: r1(b.lowGamma + b.highGamma),
  };
}

function timeOfDay(hour: number): string {
  if (hour < 5) return "late night";
  if (hour < 11) return "morning";
  if (hour < 17) return "daytime";
  if (hour < 21) return "evening";
  return "night";
}

/** system と user の2通。数値はすべて user 側に、画面と同じ名前を付けて渡す。 */
export function buildMessages(input: AnalysisInput): { system: string; user: string } {
  const L = input.locale;
  const language =
    L === "ja"
      ? "Write every string in natural, gentle Japanese (です・ます調). Use the Japanese names exactly as they appear in the data."
      : "Write every string in plain, friendly English. Use the English names exactly as they appear in the data.";

  const system = [
    "You write short, warm feedback about ONE brainwave measurement for NeuroSync, a self-care app that plays binaural-beat programs and measures brainwaves with a consumer single-channel EEG headband (BrainLink / NeuroSky).",
    "Readers are in their 50s and 60s and are not specialists: short sentences, no jargon, explain any term you use.",
    language,
    "",
    "Rules:",
    "- This is self-care feedback, not medicine. Never diagnose, never name diseases or disorders, never suggest medication or treatment. Do not claim certainty.",
    "- Only use the data given. Do not invent numbers or facts. Quote a score only when it helps (scores are 0-100; higher is better for every indicator and condition score).",
    "- If signal_quality_pct is below 60, say in cautions that the headset fit was unstable and the reading is a rough guide.",
    "- Plain text only: no markdown, no bullet symbols, no emoji.",
    "",
    "How to read the data:",
    `- indicators (0-100): ${INDICATOR_KEYS.map((k) => `${INDICATOR_LABELS[k][L]} = ${INDICATOR_LABELS[k].about}`).join("; ")}.`,
    `- condition (0-100): ${(["rate", "clarity", "reset"] as const).map((k) => `${CONDITION_LABELS[k][L]} = ${CONDITION_LABELS[k].about}`).join("; ")}.`,
    "- band_share_pct: average share (%) of 8 brainwave bands over the measurement, summing to about 100. With this kind of headband delta usually holds the largest share even when awake, so a large delta share alone does not mean drowsiness.",
    "- spectrum_1_50hz: relative amplitude per 1Hz from 1Hz up (largest = 100). Amplitude naturally falls as frequency rises. Values near 50Hz can be electrical noise from the mains; ignore them.",
    "- alpha_peak_hz: the strongest frequency between 8 and 13Hz (a personal alpha rhythm, typically 9-11Hz in adults).",
    "- target_resonance: how much the target frequency stands out from its neighbours (1.0 = flat, 1.2 or more = a clear response). It only means something if a program at that beat frequency was playing. target_hz_set is true when the target is the beat of the program that played during the measurement (on older records, a target the person typed in); false means no program was playing and the default 40Hz is shown.",
    "- theta_beta_ratio and slow_fast_ratio: balance of slow to fast waves (higher = more relaxed or drowsy, lower = more alert).",
    "- timeline (when present): the measurement split into equal stretches in time order, with average attention and relaxation (0-100, from the headset) and grouped band shares. Use it to describe how the state changed from start to end.",
    "",
    "Respond with a single json object with exactly these keys:",
    '{"summary": string (2-3 sentences: the overall picture), "strengths": [1-3 short strings: what went well], "cautions": [0-3 short strings: what to keep an eye on, kindly], "course": string or null (2-3 sentences on how things changed during the measurement; null when there is no timeline), "suggestions": [1-3 short strings: concrete everyday ideas such as breathing, rest, a short walk, or listening to a calming or focusing program]}',
  ].join("\n");

  const indicators: Record<string, number> = {};
  for (const k of INDICATOR_KEYS) indicators[INDICATOR_LABELS[k][L]] = Math.round(input.indicators[k]);

  const condition: Record<string, number | null> = {};
  for (const k of ["rate", "clarity", "reset"] as const) {
    const v = input.condition[k];
    condition[CONDITION_LABELS[k][L]] = v == null ? null : Math.round(v);
  }

  let bandShares: Record<string, number> | null = null;
  if (input.bands) {
    bandShares = {};
    for (const k of BAND_KEYS) bandShares[`${BAND_LABELS[k][L]} (${BAND_LABELS[k].hz})`] = r1(input.bands[k]);
  }

  const seg = input.timeline?.segmentSec ?? 0;
  const data = {
    time_of_day: `${String(input.hourOfDay).padStart(2, "0")}:00 (${timeOfDay(input.hourOfDay)})`,
    duration_min: input.durationSec == null ? null : r1(input.durationSec / 60),
    signal_quality_pct: input.qualityPct == null ? null : Math.round(input.qualityPct),
    target_hz: input.targetHz,
    target_hz_set: input.targetHzSet,
    overall_score: Math.round(input.composite),
    indicators,
    condition,
    band_share_pct: bandShares,
    alpha_peak_hz: input.features.alphaPeakHz,
    target_resonance: input.features.targetResonance,
    theta_beta_ratio: input.features.thetaBetaRatio,
    slow_fast_ratio: input.features.slowFastRatio,
    spectrum_1_50hz: input.spectrum ? input.spectrum.map((v) => Math.round(v)) : null,
    timeline: input.timeline
      ? input.timeline.segments.map((s, i) => ({
          from_min: r1((i * seg) / 60),
          to_min: r1(((i + 1) * seg) / 60),
          readable_pct: Math.round(s.usablePct),
          attention: s.attention,
          relaxation: s.relaxation,
          band_share_pct: s.bands ? groupBands(s.bands) : null,
        }))
      : null,
  };

  const user = `Measurement data (json):\n${JSON.stringify(data)}`;
  return { system, user };
}

// ─── 返事の読み取り ───────────────────────────────────────────────────────────

const MAX_SUMMARY = 600;
const MAX_ITEM = 300;
const MAX_ITEMS = 3;

function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  // 念のため markdown の強調記号だけは落とす（「平文で」と頼んでいても混ざることがある）。
  const s = v.replace(/\*\*/g, "").trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function clipList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => clip(x, MAX_ITEM))
    .filter((x): x is string => x !== null)
    .slice(0, MAX_ITEMS);
}

/** DeepSeek の返事（json の文字列）→ 保存する形。総評が無ければ null。 */
export function parseContent(raw: unknown, hasTimeline: boolean): AnalysisContent | null {
  if (typeof raw !== "string") return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof o !== "object" || o === null || Array.isArray(o)) return null;
  const c = o as Record<string, unknown>;
  const summary = clip(c.summary, MAX_SUMMARY);
  if (!summary) return null;
  return {
    summary,
    strengths: clipList(c.strengths),
    cautions: clipList(c.cautions),
    course: hasTimeline ? clip(c.course, MAX_SUMMARY) : null,
    suggestions: clipList(c.suggestions),
  };
}

// ─── 関数本体 ─────────────────────────────────────────────────────────────────

export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
}

type ErrorCode = "unauthorized" | "bad_input" | "not_saved" | "rate_limited" | "upstream" | "not_configured";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const fail = (status: number, error: ErrorCode) => json(status, { error });

/**
 * 1件の要求に答える。想定外の例外もここで受け止め、CORS 付きの 500 として返す——
 * 受け止めないと実行環境が CORS 無しの 5xx を返し、ブラウザには中身の読めない
 * 「通信エラー」にしか見えない（ログにも理由が残らない）。
 */
export async function handle(req: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  try {
    return await handleRequest(req, env, fetchImpl);
  } catch (e) {
    console.error("analyze-brain: unexpected error", e);
    return fail(500, "upstream");
  }
}

async function handleRequest(req: Request, env: Env, fetchImpl: typeof fetch): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return fail(405, "bad_input");

  const url = env.SUPABASE_URL;
  const anon = env.SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service || !env.DEEPSEEK_API_KEY) return fail(503, "not_configured");

  // ── だれか ──
  const auth = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+$/.test(auth)) return fail(401, "unauthorized");
  const who = await fetchImpl(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: auth },
  });
  if (!who.ok) return fail(401, "unauthorized");
  const userId = ((await who.json()) as { id?: unknown }).id;
  if (typeof userId !== "string" || !userId) return fail(401, "unauthorized");

  // ── 何を ──
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return fail(400, "bad_input");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, "bad_input");
  }
  const input = validateInput(body);
  if (!input) return fail(400, "bad_input");

  // 新しい形式の秘密鍵（sb_secret_…）は JWT ではないので apikey だけで送る。
  // 従来の service_role キー（JWT）は Authorization にも載せる。
  const serviceAuth: Record<string, string> = service.startsWith("sb_secret_")
    ? { apikey: service }
    : { apikey: service, Authorization: `Bearer ${service}` };
  const rest = (path: string, init: RequestInit = {}) =>
    fetchImpl(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        ...serviceAuth,
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  const eq = (v: string) => `eq.${encodeURIComponent(v)}`;
  const rowFilter = `user_id=${eq(userId)}&uploaded_at=${eq(input.uploadedAt)}`;

  // 測定がアカウントに保存されているか（分析は測定の行にぶら下がる）。
  const measured = await rest(`user_brain_measurements?select=uploaded_at&${rowFilter}`);
  if (!measured.ok) return fail(502, "upstream");
  if (((await measured.json()) as unknown[]).length === 0) return fail(409, "not_saved");

  // 同じ測定の分析し直しは少し間を空ける。
  const prev = await rest(`user_brain_analyses?select=created_at&${rowFilter}`);
  if (prev.status === 404) return fail(503, "not_configured"); // 006 がまだ
  if (!prev.ok) return fail(502, "upstream");
  const prevRow = ((await prev.json()) as { created_at?: string }[])[0];
  if (prevRow?.created_at && Date.now() - Date.parse(prevRow.created_at) < COOLDOWN_SEC * 1000) {
    return fail(429, "rate_limited");
  }

  // 1日の回数（DeepSeek に問い合わせる前に数える＝失敗した回も数える。連打よけ）。
  const claim = await rest("rpc/claim_ai_analysis", {
    method: "POST",
    body: JSON.stringify({ p_user_id: userId, p_limit: DAILY_LIMIT }),
  });
  if (claim.status === 404) return fail(503, "not_configured");
  if (!claim.ok) return fail(502, "upstream");
  if ((await claim.json()) !== true) return fail(429, "rate_limited");

  // ── DeepSeek ──
  const model = env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const { system, user } = buildMessages(input);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), UPSTREAM_TIMEOUT_MS);
  let content: AnalysisContent | null = null;
  try {
    const res = await fetchImpl(DEEPSEEK_URL, {
      method: "POST",
      signal: abort.signal,
      headers: {
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.6,
        max_tokens: 1200,
      }),
    });
    if (!res.ok) {
      console.error("deepseek", res.status, await res.text().catch(() => ""));
      return fail(502, "upstream");
    }
    const out = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    content = parseContent(out.choices?.[0]?.message?.content, input.timeline !== null);
  } catch (e) {
    console.error("deepseek", e);
    return fail(502, "upstream");
  } finally {
    clearTimeout(timer);
  }
  if (!content) return fail(502, "upstream");

  // ── 保存（分析し直しは置き換え） ──
  const saved = await rest("user_brain_analyses?on_conflict=user_id,uploaded_at", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      user_id: userId,
      uploaded_at: input.uploadedAt,
      locale: input.locale,
      model,
      content,
      input_version: INPUT_VERSION,
      created_at: new Date().toISOString(),
    }),
  });
  if (!saved.ok) {
    const detail = await saved.text().catch(() => "");
    console.error("save", saved.status, detail);
    // 23503＝外部キー：問い合わせている間に測定が消された。
    return fail(detail.includes("23503") ? 409 : 502, detail.includes("23503") ? "not_saved" : "upstream");
  }
  const row = ((await saved.json()) as unknown[])[0];
  return json(200, { analysis: row });
}

// ─── 待ち受け ─────────────────────────────────────────────────────────────────
//
// Supabase の書き方そのまま、トップレベルで **素の `Deno.serve(...)`** を呼ぶ（形は
// `pnpm check:analysis` が見張る）。`typeof Deno` の確認だけなら node でも例外に
// ならない（未宣言の名前に typeof は使える）ので、node の自己点検もこのファイルを読める。
//
// 一度「起動（booted）はするのに OPTIONS（CORS の下調べ）にすら答えず、150 秒で
// 打ち切られる（546）」ことがあった。原因は Supabase 側の関数がこのファイルの最新・
// 全文になっていなかったことで、全文を貼り直して Deploy したら直った。以前の
// `(globalThis as …).Deno.serve` という書き方でも起きるのかは確かめていない（素の Deno
// では動く）——いまの書き方は Supabase の文書どおりなので、このままにする。
// 下の「analyze-brain: serving」は**ファイルの最後**で出す。Logs にこれが出れば、
// 全文が載って待ち受けまで済んでいる。
if (typeof Deno !== "undefined") {
  const env: Env = {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    DEEPSEEK_API_KEY: Deno.env.get("DEEPSEEK_API_KEY"),
    DEEPSEEK_MODEL: Deno.env.get("DEEPSEEK_MODEL"),
  };
  Deno.serve((req: Request) => handle(req, env));
  console.log("analyze-brain: serving");
}
