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
 * 主の組は基音（左 キャリア／右 キャリア＋ビート）と高八度（左 キャリア×2／
 * 右 キャリア×2＋ビート）の2組——高八度も基音と同じビートだけ左右がずれ、同じ速さの
 * うなりが1オクターブ上にもう1つ鳴る。この2組に同じ速さで逆向きのトレモロを掛ける：
 * 基音が山のとき高八度は谷、高八度が山のとき基音は谷で、音の重心が低い音と高い音を
 * 行き来する。揺れは左右の耳で同じなので、左右の高さの差＝ビートは揺らさない。
 */
export type BeatChannelMode = "stereo" | "mono";

export const DEFAULT_BEAT_CHANNEL_MODE: BeatChannelMode = "stereo";

/** 主の組の基音の重み（トレモロの山のとき）。 */
const FUNDAMENTAL_GAIN = 0.82;

/**
 * 揺らさない倍音 [倍率, 重み]。左右とも同じ高さ（ビートを足さない）。2倍音の座は
 * 高八度が持つ——左右同じ高さの2倍音を残すと、右耳で高八度（キャリア×2＋ビート）と
 * ぶつかって片耳だけのうなりが出る。
 */
const OVERTONES: readonly (readonly [number, number])[] = [
  [3, 0.06], // 3rd harmonic — subtle brightness
];

/** 重ねる組（ProgramConfig.layers）の純音の重み。主の組の基音と同じ。 */
const LAYER_GAIN = 0.82;

/**
 * 高八度の組の重み（トレモロの山のとき）。基音を支える脇役：自分の山で基音の約 -9dB。
 */
const OCTAVE_GAIN = 0.3;

/**
 * トレモロの速さ＝いまのビート×この比（基音も高八度も同じ速さ）。ビートと同じ相位の
 * 曲線で動くので、ビートが上がり下がりすればトレモロも一緒に動き、位相もビートの
 * ちょうど 1/8 に揃ったまま（8拍でひと巡り＝基音の山と高八度の山が4拍ごとに
 * 入れ替わる、ずれていかない）。
 * 1.5Hz（デルタ）→ 0.19Hz（約5秒でひと巡り）・10Hz（アルファ）→ 1.25Hz・40Hz（ガンマ）→ 5Hz。
 */
const TREMOLO_RATIO = 1 / 8;

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

  const tone = (freq: number, weight: number, to: GainNode) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startAt);
    const g = ctx.createGain();
    g.gain.setValueAtTime(weight, startAt);
    osc.connect(g);
    g.connect(to);
    oscillators.push(osc);
    nodes.push(g);
    return { osc, gain: g };
  };

  // トレモロ：山と谷の真ん中の音量に、1つの LFO で ±swing を足す。
  const center = (1 + TREMOLO_FLOOR) / 2;
  const swing = (1 - TREMOLO_FLOOR) / 2;

  // 主の組：基音と高八度。どちらも右だけが＋ビートで、相位に沿って動く。
  const initBeat = program.phases[0]?.startBeatFreq ?? program.targetBeatFreq;
  const beatPair = (freq: number, weight: number): [GainNode, GainNode] => {
    const left = tone(freq, weight, leftBus);
    const right = tone(freq + initBeat, weight, rightBus);
    scheduleRamps(right.osc.frequency, program.phases, timeScale, startAt, (beat) => freq + beat);
    return [left.gain, right.gain];
  };
  const fundamental = beatPair(carrier, FUNDAMENTAL_GAIN * center);
  const octave = beatPair(carrier * 2, OCTAVE_GAIN * center);
  for (const [mult, weight] of OVERTONES) {
    tone(carrier * mult, weight, leftBus);
    tone(carrier * mult, weight, rightBus);
  }

  // 1つの LFO を基音には＋、高八度には−で掛ける（LFO を2つ持つと少しずつずれていく）。
  // 左右の耳には同じ揺れ——左右の高さの差＝ビートは揺らさない。
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
  wobble(FUNDAMENTAL_GAIN * swing, ...fundamental);
  wobble(-OCTAVE_GAIN * swing, ...octave);

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
