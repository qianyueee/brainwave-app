import type { ProgramConfig } from "./programs";
import { scheduleRamps } from "./ramp-scheduler";

/**
 * 誘導ビートの音の組み立て（再生の BinauralSession と書き出しの
 * renderBinauralOffline が同じこの1本を通る——聴いた音と書き出した音を揃える）。
 *
 * 左の耳へ流す音（キャリアとその倍音）と右の耳へ流す音（キャリア＋ビートと倍音）を
 * それぞれ1本のバスにまとめ、最後の ChannelMerger でどちらの耳へ送るかを決める：
 *
 *   stereo（バイノーラルビート）：左のバス→左耳、右のバス→右耳。うなりは頭の中で
 *     生まれる。ヘッドホン・イヤホンでないと効かない（スピーカーでは左右が空気中で
 *     混ざってしまう）。
 *   mono（モノラルビート）：両方のバスを半分ずつ混ぜて両耳へ。2つの音が同じ場所で
 *     重なるので、音そのものが「うなり」の周期で大きくなったり小さくなったりする。
 *     スピーカーでも効く。半分ずつにするのは、うなりの山の高さを stereo と同じに
 *     保つため（足したまま流すと最大で2倍＝6dB 大きくなる）。
 *
 * 切り替えは送り先の4つのゲインを動かすだけで、オシレーターは作り直さない
 * （作り直すとビートの位相と相位のスケジュールが途切れる）。再生中でも数十ミリ秒で
 * なめらかに移る。
 *
 * その上に高八度の音（キャリア×2、左右とも同じ）を1本重ね、基音と高八度に同じ速さで
 * 逆向きのトレモロを掛ける——基音が山のとき高八度は谷、高八度が山のとき基音は谷で、
 * 音の重心が低い音と高い音を行き来する。基音の揺れは左右の耳で同じなので、左右の
 * 高さの差＝ビートはそのまま。高八度は左右とも同じ高さで、うなりは作らない。
 */
export type BeatChannelMode = "stereo" | "mono";

export const DEFAULT_BEAT_CHANNEL_MODE: BeatChannelMode = "stereo";

/**
 * 主の組の音色：基音 0.82 ＋ 2倍音 0.12 ＋ 3倍音 0.06 ＝ 1.0。
 * 倍音は左右とも同じ高さ（ビートを足さない）——うなりは基音どうしだけで作る。
 * トレモロを掛けるのは基音だけで、倍音は揺らさない。
 */
const FUNDAMENTAL_GAIN = 0.82;
const OVERTONES: readonly (readonly [number, number])[] = [
  [2, 0.12], // 2nd harmonic — adds warmth
  [3, 0.06], // 3rd harmonic — subtle brightness
];

/** 重ねる組（ProgramConfig.layers）の純音の重み。主の組の基音と同じ。 */
const LAYER_GAIN = 0.82;

/**
 * 高八度の音の重み（トレモロの山のとき）。基音を支える脇役：自分の山で基音の約 -9dB。
 * 2倍音と同じ高さに重なるが、2倍音は揺らさないので、揺れはこの音の分だけ。
 */
const OCTAVE_GAIN = 0.3;

/**
 * トレモロの速さ＝いまのビート×この比（基音も高八度も同じ速さ）。ビートと同じ相位の
 * 曲線で動くので、ビートが上がり下がりすればトレモロも一緒に動き、位相もビートの
 * ちょうど 1/4 に揃ったまま（4拍でひと巡り＝基音の山と高八度の山が2拍ごとに
 * 入れ替わる、ずれていかない）。
 * 1.5Hz（デルタ）→ 0.375Hz・10Hz（アルファ）→ 2.5Hz・40Hz（ガンマ）→ 10Hz。
 * 1/2 だと 40Hz の節目で 20Hz の揺れになり、揺れではなくザラつきに聞こえる。
 */
const TREMOLO_RATIO = 1 / 4;

/**
 * トレモロの谷の音量（山＝1）。基音も高八度も 100% ⇔ 30% を行き来する——音が
 * 消えきると「ブツブツ」と刺激が強くなる（若年層向け音の周波数開発.docx の
 * アイソクロニックの推奨と同じ幅）。
 */
const TREMOLO_FLOOR = 0.3;

/** 送り先のゲインの切り替えの速さ（時定数・秒）。 */
const MODE_TIME_CONSTANT = 0.03;

function routing(mode: BeatChannelMode): { direct: number; cross: number } {
  return mode === "mono" ? { direct: 0.5, cross: 0.5 } : { direct: 1, cross: 0 };
}

export interface BeatGraph {
  /** ステレオの出口。音量・フェードのゲインへ繋ぐ。 */
  output: AudioNode;
  /** 聴き方を切り替える（再生中でもよい）。 */
  setMode(mode: BeatChannelMode): void;
  /** オシレーターを止めて、組み立てたノードをすべて切り離す。 */
  dispose(): void;
}

/**
 * program の誘導ビートを組み立てて startAt から鳴らし始める。周波数の動きは
 * phases を timeScale 倍に伸ばした時間軸でスケジュールする（ramp-scheduler.ts）。
 */
export function buildBeatGraph(
  ctx: BaseAudioContext,
  program: ProgramConfig,
  opts: { timeScale: number; startAt: number; mode: BeatChannelMode }
): BeatGraph {
  const { timeScale, startAt } = opts;
  const carrier = program.carrierFreq;
  const layers = program.layers ?? [];
  // 片耳の振幅の合計が 1 を超えないよう全体を下げる。基音と高八度は逆向きに揺れるので
  // 同時には山にならない——合計がいちばん大きいのは、どちらか一方が山・もう一方が谷のとき。
  const swingPeak = Math.max(
    FUNDAMENTAL_GAIN + OCTAVE_GAIN * TREMOLO_FLOOR,
    FUNDAMENTAL_GAIN * TREMOLO_FLOOR + OCTAVE_GAIN
  );
  const overtoneSum = OVERTONES.reduce((sum, [, weight]) => sum + weight, 0);
  const busLevel = 1 / (swingPeak + overtoneSum + layers.length * LAYER_GAIN);

  const oscillators: OscillatorNode[] = [];
  const nodes: AudioNode[] = [];

  const bus = () => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(busLevel, startAt);
    nodes.push(g);
    return g;
  };
  const leftBus = bus();
  const rightBus = bus();

  const tone = (freq: number, weight: number, ...to: GainNode[]) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startAt);
    const g = ctx.createGain();
    g.gain.setValueAtTime(weight, startAt);
    osc.connect(g);
    for (const dest of to) g.connect(dest);
    oscillators.push(osc);
    nodes.push(g);
    return { osc, gain: g };
  };

  // トレモロ：山と谷の真ん中の音量に、1つの LFO で ±swing を足す。
  const center = (1 + TREMOLO_FLOOR) / 2;
  const swing = (1 - TREMOLO_FLOOR) / 2;

  // 主の組の基音。右だけがキャリア＋ビートで、相位に沿って動く。
  const initBeat = program.phases[0]?.startBeatFreq ?? program.targetBeatFreq;
  const leftFundamental = tone(carrier, FUNDAMENTAL_GAIN * center, leftBus);
  const rightFundamental = tone(carrier + initBeat, FUNDAMENTAL_GAIN * center, rightBus);
  scheduleRamps(rightFundamental.osc.frequency, program.phases, timeScale, startAt, (beat) => carrier + beat);
  for (const [mult, weight] of OVERTONES) {
    tone(carrier * mult, weight, leftBus);
    tone(carrier * mult, weight, rightBus);
  }

  // 高八度：左右とも同じ1本を両方のバスへ（mono で左右を混ぜても同じ音のまま）。
  const octave = tone(carrier * 2, OCTAVE_GAIN * center, leftBus, rightBus);

  // 1つの LFO を基音には＋、高八度には−で掛ける（LFO を2つ持つと少しずつずれていく）。
  // 基音は左右の耳に同じ揺れ——左右の高さの差＝ビートは揺らさない。
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  scheduleRamps(lfo.frequency, program.phases, timeScale, startAt, (beat) => beat * TREMOLO_RATIO);
  oscillators.push(lfo);
  const wobble = (amount: number, ...gains: GainNode[]) => {
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(amount, startAt);
    lfo.connect(depth);
    for (const g of gains) depth.connect(g.gain);
    nodes.push(depth);
  };
  wobble(FUNDAMENTAL_GAIN * swing, leftFundamental.gain, rightFundamental.gain);
  wobble(-OCTAVE_GAIN * swing, octave.gain);

  // 重ねる組：一定のビートの純音（倍音を足すと主の組の音とぶつかる）。
  for (const layer of layers) {
    tone(layer.carrierFreq, LAYER_GAIN, leftBus);
    tone(layer.carrierFreq + layer.beatFreq, LAYER_GAIN, rightBus);
  }

  // 送り先：同じ側へ（direct）と反対側へ（cross）。
  const merger = ctx.createChannelMerger(2);
  const send = (from: GainNode, channel: 0 | 1, level: number) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, startAt);
    from.connect(g);
    g.connect(merger, 0, channel);
    nodes.push(g);
    return g;
  };
  const initial = routing(opts.mode);
  const leftToLeft = send(leftBus, 0, initial.direct);
  const rightToRight = send(rightBus, 1, initial.direct);
  const leftToRight = send(leftBus, 1, initial.cross);
  const rightToLeft = send(rightBus, 0, initial.cross);
  nodes.push(merger);

  for (const osc of oscillators) osc.start(startAt);

  return {
    output: merger,
    setMode(mode) {
      const { direct, cross } = routing(mode);
      const now = ctx.currentTime;
      const moves: [GainNode, number][] = [
        [leftToLeft, direct],
        [rightToRight, direct],
        [leftToRight, cross],
        [rightToLeft, cross],
      ];
      for (const [g, level] of moves) {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.setTargetAtTime(level, now, MODE_TIME_CONSTANT);
      }
    },
    dispose() {
      for (const osc of oscillators) {
        try {
          osc.stop();
        } catch {
          // まだ鳴り始めていない／止めてある——どちらでも切り離せばよい。
        }
        osc.disconnect();
      }
      for (const n of nodes) n.disconnect();
    },
  };
}
