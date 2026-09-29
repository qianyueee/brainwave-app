/**
 * セッションの始まり：ビートを曲の立ち上がりに合わせて、一緒に強くしていく。
 *
 * 曲のある節目は、ビートを無音で走らせておき、曲が鳴り出した瞬間から曲と同じ
 * 形で上げる（lib/audio-engine.ts の BinauralSession が使う）。「同じ形」とは
 * 曲の聞こえ方そのもの＝曲自身の頭の盛り上がり（録音に入っている）× 頭に掛ける
 * 音量の立ち上げ（START_FADE_SEC）。
 *
 * 納品曲 155 曲の頭を測ると、約 3/4 は無音近くから始まって 3.5〜5 秒ほどで本体の
 * 音量に届き（-3dB に届くまで：中央値 3.5 秒・9 割が 8 秒以内）、残り 1/4 は頭から
 * 本体の音量で鳴る。前者はビートが録音の盛り上がりをなぞり、後者は曲にも
 * START_FADE_SEC の立ち上げを掛けて、同じ立ち上げでビートも上げる。
 *
 * 純関数・import なし（node で直接確かめられる）。
 */

/** 曲とビートに共通で掛ける、音量の立ち上げの長さ（秒）。 */
export const START_FADE_SEC = 4;

/**
 * ビートが曲の盛り上がりをなぞるのはここまで（秒）。これより遅くまで盛り上がり
 * 続ける曲でも、この時刻にはビートは満量——誘導の音はいつまでも小さくしない。
 */
export const MAX_FOLLOW_SEC = 10;

/**
 * ビートが曲を待つ上限（ミリ秒）。/player を開いた時点で曲を取りに行き、デコード
 * まで済ませておく（lib/nature-player.ts の preloadAudio）ので、普段は再生ボタン
 * からすぐに鳴り出す。通信が遅くてこれを過ぎたら、ビートだけ先に立ち上げ、曲は
 * 届いたところから同じ立ち上げで入る。
 */
export const MUSIC_WAIT_MS = 2500;

/** 曲線の点の密度（1 秒あたり）。AudioParam は点の間を直線で結ぶ。 */
export const CURVE_POINTS_PER_SEC = 20;

/** 音量の立ち上げの形：0..1 → 0..1。二乗＝初めはごく小さく、後半ほど dB で見て一定の速さに近い。 */
export function fadeShape(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c;
}

/** 曲線（点の列）が表す長さ（秒）。 */
export function curveDuration(curve: Float32Array): number {
  return (curve.length - 1) / CURVE_POINTS_PER_SEC;
}

/** 曲の頭に掛ける音量の立ち上げ（0 → 1、START_FADE_SEC 秒）。 */
export function startFadeCurve(): Float32Array {
  const n = Math.round(START_FADE_SEC * CURVE_POINTS_PER_SEC) + 1;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = fadeShape(i / (n - 1));
  return curve;
}

/**
 * 曲の頭の盛り上がり：本体の音量に対して、いまどこまで来ているか（振幅の比 0..1）を
 * CURVE_POINTS_PER_SEC 間隔で MAX_FOLLOW_SEC まで返す。
 *
 * - 各点は前後 0.1 秒（計 0.2 秒）の RMS。左右は足し合わせて見る
 * - 本体の音量＝MAX_FOLLOW_SEC から 30 秒間の、0.2 秒ごとの RMS の中央値
 *   （短い曲なら残り全部）。最初の盛り上がりが終わった後の「普段の大きさ」
 * - 途中で静かになってもビートを下げ戻さないよう、累積の最大値にする（単調増加）
 *
 * 本体がほぼ無音（測れない）なら null——呼び手は音量の立ち上げだけにする。
 */
export function measureIntro(channels: readonly Float32Array[], sampleRate: number): Float32Array | null {
  if (channels.length === 0 || !(sampleRate > 0)) return null;
  const length = channels[0].length;
  const hop = Math.max(1, Math.round(sampleRate / CURVE_POINTS_PER_SEC));

  // 0.05 秒ごとの平均パワー（左右の平均）。見るのは頭と本体の窓（最長 40 秒）
  // だけ——8 分の曲でも全体は舐めない。
  const followPoints = Math.round(MAX_FOLLOW_SEC * CURVE_POINTS_PER_SEC);
  const bodyPoints = 30 * CURVE_POINTS_PER_SEC;
  const available = Math.floor(length / hop);
  if (available < 8) return null;
  const hops = Math.min(available, followPoints + bodyPoints + 20);
  const power = new Float64Array(hops);
  for (let k = 0; k < hops; k++) {
    let sum = 0;
    const from = k * hop;
    for (const ch of channels) {
      for (let i = from; i < from + hop; i++) sum += ch[i] * ch[i];
    }
    power[k] = sum / (hop * channels.length);
  }
  // 点 k の RMS＝その前後 2 ホップずつ（0.2 秒）
  const rmsAt = (k: number): number => {
    const lo = Math.max(0, k - 2);
    const hi = Math.min(hops, k + 2);
    let sum = 0;
    for (let j = lo; j < hi; j++) sum += power[j];
    return Math.sqrt(sum / Math.max(1, hi - lo));
  };

  const bodyFrom = hops > followPoints + 20 ? followPoints : Math.floor(hops / 3);
  const bodyTo = Math.min(hops, bodyFrom + bodyPoints);
  const body: number[] = [];
  for (let k = bodyFrom; k < bodyTo; k += 4) body.push(rmsAt(k));
  if (body.length === 0) return null;
  body.sort((a, b) => a - b);
  const bodyRms = body[Math.floor(body.length / 2)];
  if (!(bodyRms > 1e-4)) return null; // ほぼ無音（-80dBFS 未満）は測れない

  const n = followPoints + 1;
  const intro = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const r = i < hops ? rmsAt(i) / bodyRms : 1;
    peak = Math.max(peak, Math.min(1, r));
    intro[i] = peak;
  }
  return intro;
}

/**
 * ビートの始まりの音量曲線（0 から始まり、最後は必ず 1）。
 *
 * 曲の聞こえ方＝曲自身の盛り上がり（intro）× 音量の立ち上げ（fadeShape）を
 * そのままなぞる。曲が無い・間に合わない・測れないときは intro＝null で、
 * 音量の立ち上げだけ（START_FADE_SEC）。
 *
 * 曲が MAX_FOLLOW_SEC を過ぎても本体の音量に届かないときに備え、最後の 3 秒で
 * 満量へ寄せる安全の曲線を下に敷く（大きい方を採る——どちらも単調増加なので
 * 結果も単調増加）。満量（0.98 以上）に届いた点で打ち切り、最後の点は 1。
 */
export function beatStartCurve(intro: Float32Array | null): Float32Array {
  const n = Math.round(MAX_FOLLOW_SEC * CURVE_POINTS_PER_SEC) + 1;
  const safetyFrom = MAX_FOLLOW_SEC - 3;
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / CURVE_POINTS_PER_SEC;
    const followed = fadeShape(t / START_FADE_SEC) * (intro ? intro[Math.min(i, intro.length - 1)] : 1);
    const safety = fadeShape((t - safetyFrom) / 3);
    const v = Math.max(followed, safety);
    if (v >= 0.98) {
      values.push(1);
      break;
    }
    values.push(v);
  }
  values[values.length - 1] = 1;
  return Float32Array.from(values);
}
