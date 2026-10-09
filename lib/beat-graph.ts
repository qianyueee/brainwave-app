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
 * その上に高八度の音（キャリア×2）を1本重ね、左右交互のトレモロを掛ける——左の耳で
 * 大きくなるとき右の耳では小さくなり、音が左右を行き来する。うなりは作らない
 * （左右とも同じ高さ）ので、ビートは今までどおり基音どうしの1つだけ。
 */
export type BeatChannelMode = "stereo" | "mono";

export const DEFAULT_BEAT_CHANNEL_MODE: BeatChannelMode = "stereo";

/**
 * キャリアに足す倍音 [倍率, 重み]。基音 0.82 ＋ 2倍音 0.12 ＋ 3倍音 0.06 ＝ 1.0。
 * 倍音は左右とも同じ高さ（ビートを足さない）——うなりは基音どうしだけで作る。
 */
const HARMONICS: readonly (readonly [number, number])[] = [
  [1, 0.82], // fundamental
  [2, 0.12], // 2nd harmonic — adds warmth
  [3, 0.06], // 3rd harmonic — subtle brightness
];

/** 重ねる組（ProgramConfig.layers）の純音の重み。主の組の基音と同じ。 */
const LAYER_GAIN = 0.82;

/**
 * 高八度の音の重み（トレモロの山のとき）。基音を支える脇役：山で基音の約 -9dB、
 * 谷で約 -19dB。倍音と同じく左右とも同じ高さで、ビートは足さない。
 */
const OCTAVE_GAIN = 0.3;

/**
 * トレモロの速さ＝いまのビート×この比。ビートと同じ相位の曲線で動くので、
 * ビートが上がり下がりすればトレモロも一緒に動き、位相もビートのちょうど 1/4 に
 * 揃ったまま（4拍で左右がひと巡り＝左右どちらかの山が2拍ごと、ずれていかない）。
 * 1.5Hz（デルタ）→ 0.375Hz・10Hz（アルファ）→ 2.5Hz・40Hz（ガンマ）→ 10Hz。
 * 1/2 だと 40Hz の節目で片耳 20Hz の揺れになり、揺れではなくザラつきに聞こえる。
 */
const TREMOLO_RATIO = 1 / 4;

/**
 * トレモロの谷の音量（山＝1）。100% ⇔ 30% を行き来する——音が消えきると
 * 「ブツブツ」と刺激が強くなる（若年層向け音の周波数開発.docx のアイソクロニック
 * の推奨と同じ幅）。左右が逆向きなので、片耳が山のときもう片耳は谷（約 10dB 差）。
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
  // 片耳の振幅の合計（主の組 1・重ねる組・高八度の山）が 1 を超えないよう全体を下げる。
  const busLevel = 1 / (1 + layers.length * LAYER_GAIN + OCTAVE_GAIN);

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

  const tone = (freq: number, weight: number, to: GainNode): OscillatorNode => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startAt);
    const g = ctx.createGain();
    g.gain.setValueAtTime(weight, startAt);
    osc.connect(g);
    g.connect(to);
    oscillators.push(osc);
    nodes.push(g);
    return osc;
  };

  // 主の組。右の基音だけがキャリア＋ビートで、相位に沿って動く。
  const initBeat = program.phases[0]?.startBeatFreq ?? program.targetBeatFreq;
  let rightFundamental: OscillatorNode | null = null;
  for (const [mult, weight] of HARMONICS) {
    tone(carrier * mult, weight, leftBus);
    const r = tone(mult === 1 ? carrier + initBeat : carrier * mult, weight, rightBus);
    if (mult === 1) rightFundamental = r;
  }
  if (rightFundamental) {
    scheduleRamps(rightFundamental.frequency, program.phases, timeScale, startAt, (beat) => carrier + beat);
  }

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

  // 高八度：1つの音を左右へ分け、1つの LFO を左には＋、右には−で掛ける（LFO を
  // 左右で2つ持つと少しずつずれていく）。聴き方の送り先は通さず左右別々に送る——
  // mono の送り先で左右を半分ずつ混ぜると、逆向きの揺れが打ち消し合って消える。
  // スピーカーでも左右のスピーカーの間を行き来する（1つのスピーカーでは揺れの無い
  // 高八度になるだけ）。
  const octave = ctx.createOscillator();
  octave.type = "sine";
  octave.frequency.setValueAtTime(carrier * 2, startAt);
  oscillators.push(octave);
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  scheduleRamps(lfo.frequency, program.phases, timeScale, startAt, (beat) => beat * TREMOLO_RATIO);
  oscillators.push(lfo);
  const octaveLevel = OCTAVE_GAIN * busLevel;
  const center = (1 + TREMOLO_FLOOR) / 2;
  const swing = (1 - TREMOLO_FLOOR) / 2;
  const octaveSide = (channel: 0 | 1, sign: 1 | -1) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(octaveLevel * center, startAt);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(sign * octaveLevel * swing, startAt);
    lfo.connect(depth);
    depth.connect(g.gain);
    octave.connect(g);
    g.connect(merger, 0, channel);
    nodes.push(g, depth);
  };
  octaveSide(0, 1);
  octaveSide(1, -1);

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
