/**
 * プログラム一覧（xlsx）の写しと、それをどう鳴らすか。
 *
 * 元の一覧は docs/program-lists/ にある4つの xlsx（Target・Energy・
 * Morning Tuning & Energize・Astro）。ここに写しているのは Target 42・Energy 13・
 * Morning Tuning 1 の「周波数（キャリア）」と「脳波誘導波（ビート）」——名前・よみ・
 * アイコン・並びは人が決めたものなので target.ts / energy.ts / programs.ts 側が持つ。
 * Astro の 96 行は星座マスタ（lib/zodiac.ts の ZODIAC_SIGNS × MODULAR_BEATS）が
 * そのまま同じ値を持っているので、ここには写さない。
 *
 * 一覧の原文（listName・carrierText・beatText）も残してある。`pnpm check:programs`
 * （scripts/check-program-lists.mjs）が xlsx と1行ずつ突き合わせ、原文が変わって
 * いれば（＝一覧が更新された）・数値が写し間違っていれば止まる。
 *
 * ■ 「脳波誘導波」欄の読み方（beat）
 * - 「40.0 Hz」          → steady：10Hz から入って滑らせ、その周波数を保つ。
 * - 「10Hz×40Hz」「5Hz・40Hz重なり」→ layered：1つ目が主（相位で動く）、2つ目は
 *   キャリアを1オクターブ下げた別の組で同時に鳴らす（同じキャリアに2つ重ねると、
 *   片耳の中で2音がぶつかって第3のうなりが出来てしまう）。
 * - 「1.0〜2.0Hz」などデルタの幅 → sweep：上から下へゆっくり下げる（設計書の
 *   Flow Sleep「デルタ波へ段階的に下降」と同じ）。
 * - 「8.0Hz〜10.0Hz（ゾーン波形）」などそれ以外の幅 → wave：幅の中を往復する。
 * - 「10Hz→3Hz→15Hz」    → path：一覧が道筋を決めているので、その折れ線どおりに
 *   （[尺に対する割合, Hz] のキーフレーム）。
 *
 * target は「この節目の誘導周波数」＝ProgramConfig.targetBeatFreq。一覧が1つの
 * 数字ならそれ、道筋・幅のものは同調させる周波数（path は明示、sweep・wave・
 * layered は phases.ts の決まり）。Sync Brain の共鳴率もこの値で見る。
 *
 * ■ 一覧どおりに鳴らさないもの
 * - キャリアが 1000Hz を超える行（Energy 第8〜第12）：ここには一覧の値のまま
 *   書き、鳴らすときに1オクターブずつ下げて 1000Hz 以下にする（factory.ts の
 *   playableCarrier）。50〜60代の聴覚に高すぎる音を避ける設計書の決まりで、
 *   バイノーラルビートは 1000Hz を超えるキャリアだと聞き取りにくくもなる。
 * - provisional：一覧に鳴らせる値が無い行。beat は暫定値。
 * - note：一覧の値をどう読んだか・なぜそのまま鳴らさないか。照合スクリプトは
 *   note のある行だけ、一覧と数値が食い違っていても止めずに表示する。
 *
 * 値だけのモジュール（import なし）。node が直接読む（check:programs）ので、
 * 型の import すら足さないこと。
 */

/** ビートの鳴らし方。phases.ts の planTimeline が相位列に組み立てる。 */
export type BeatPlan =
  /** 一定のビート。 */
  | { kind: "steady"; hz: number }
  /** 2つのビートを同時に。hz が主、extra はキャリアを1オクターブ下げた組で一定に。 */
  | { kind: "layered"; hz: number; extra: number }
  /** from から to へ一方向に滑らせる。target を省くと中間。 */
  | { kind: "sweep"; from: number; to: number; target?: number }
  /** lo〜hi の幅を往復する。target は中間。 */
  | { kind: "wave"; lo: number; hi: number }
  /** [尺に対する割合 0〜1, Hz] の折れ線。最初は 0、最後は 1。 */
  | { kind: "path"; keys: readonly (readonly [number, number])[]; target: number };

export interface ListedProgram {
  /** 一覧の「プログラム名」（空白を1つに詰めた原文）。照合はこれで行を探す。 */
  listName: string;
  /** 一覧の「周波数」欄の原文。 */
  carrierText: string;
  /** 一覧の「脳波誘導波」欄の原文。 */
  beatText: string;
  /** キャリア Hz（一覧の値。1000Hz を超えるものは鳴らすときに下げる）。 */
  carrier: number;
  beat: BeatPlan;
  /**
   * 終わりのビート。省略＝10Hz へ戻して起こして終える。"hold"＝最後のビートの
   * まま終える（睡眠系——寝入りかけた人を最後にアルファへ引き上げない）。
   * path は道筋そのものが終わりを決めるので使わない。
   */
  outro?: number | "hold";
  /** beat が一覧の値ではない（一覧に鳴らせる値が無い）。 */
  provisional?: true;
  /** 一覧の値をどう読んだか・なぜそのまま鳴らさないか。 */
  note?: string;
}

export const PROGRAM_LIST: Readonly<Record<string, ListedProgram>> = {
  "target-gamma-peak-focus": {
    listName: "40Hz Gamma Peak & Focus（明晰集中・ひらめき統合）",
    carrierText: "432Hz/160Hz",
    beatText: "40.0 Hz",
    carrier: 160,
    beat: { kind: "steady", hz: 40 },
    note: "主キャリアは一覧の説明どおり 160Hz（40Hz のちょうど4倍）。432Hz は副キャリア＝穏やかなベースラインと説明されていて、曲がそれを担うので、合成するのは 160Hz × 40Hz の組だけ",
  },
  "target-afternoon-power-nap": {
    listName: "Afternoon Power Nap (15分_20分 高速仮眠)",
    carrierText: "432Hz",
    beatText: "10Hz→3Hz→15Hz",
    carrier: 432,
    beat: { kind: "path", target: 3, keys: [[0, 10], [2 / 15, 10], [5 / 15, 3], [12 / 15, 3], [13.5 / 15, 15], [1, 15]] },
  },
  "target-brain-fog-clarity": {
    listName: "Brain Fog & Mental Clarity（ブレインフォグ・頭のモヤモヤ）",
    carrierText: "741 Hz",
    beatText: "40.0 Hz",
    carrier: 741,
    beat: { kind: "steady", hz: 40 },
  },
  "target-clarity-focus-work": {
    listName: "Clarity & Focus（ガンマ波 / 40Hz）",
    carrierText: "200 Hz",
    beatText: "40.0 Hz",
    carrier: 200,
    beat: { kind: "steady", hz: 40 },
  },
  "target-creative-flow": {
    listName: "Creative Flow（ひらめき・直感統合）",
    carrierText: "432Hz",
    beatText: "5Hz・40Hz",
    carrier: 432,
    beat: { kind: "layered", hz: 5, extra: 40 },
  },
  "target-esports-reflex-booster": {
    listName: "Esports & Reflex Booster (反応速度・ゲーミング)",
    carrierText: "432Hz",
    beatText: "10Hz×40Hz",
    carrier: 432,
    beat: { kind: "layered", hz: 10, extra: 40 },
  },
  "target-flow-state-deep-work": {
    listName: "Flow State & Deep Work (ゾーン体験・フロー状態)",
    carrierText: "432Hz",
    beatText: "8.0Hz〜10.0Hz",
    carrier: 432,
    beat: { kind: "wave", lo: 8, hi: 10 },
  },
  "target-high-speed-learning": {
    listName: "High-Speed Learning (超集中・学習モード)",
    carrierText: "432Hz",
    beatText: "10Hz×40Hz",
    carrier: 432,
    beat: { kind: "layered", hz: 10, extra: 40 },
  },
  "target-deep-golden-sleep": {
    listName: "Deep Golden Sleep (シニア向け深層睡眠)",
    carrierText: "528Hz",
    beatText: "1.0Hz",
    carrier: 528,
    beat: { kind: "steady", hz: 1 },
    outro: "hold",
  },
  "target-deep-sleep-journey": {
    listName: "Deep Sleep Journey（入眠ガイド・デルタ波）",
    carrierText: "396 Hz",
    beatText: "1.5 ～0.5Hz",
    carrier: 396,
    beat: { kind: "sweep", from: 1.5, to: 0.5 },
    outro: "hold",
  },
  "target-jet-lag-shift-reset": {
    listName: "Jet Lag & Shift Worker Reset (時差ぼけ・夜勤シフト調整)",
    carrierText: "126.22Hz",
    beatText: "",
    carrier: 126.22,
    beat: { kind: "steady", hz: 2 },
    outro: "hold",
    provisional: true,
    note: "一覧の「脳波誘導波」が空欄（周波数構成は「126.22Hz（太陽周波数）×リズム変調ビート」で数値が無い）。ビートは暫定の 2Hz のまま、一覧の確認待ち",
  },
  "target-midnight-awakening-care": {
    listName: "Midnight Awakening Care (中途覚醒・夜中の再入眠)",
    carrierText: "396Hz",
    beatText: "0.5〜1.0Hz",
    carrier: 396,
    beat: { kind: "sweep", from: 1, to: 0.5, target: 1 },
    outro: "hold",
  },
  "target-morning-grogginess-boot": {
    listName: "Morning Grogginess & Boot (朝の強い倦怠感・覚醒)",
    carrierText: "126.22Hz",
    beatText: "12Hz→18Hz",
    carrier: 126.22,
    beat: { kind: "path", target: 18, keys: [[0, 12], [2 / 15, 12], [8 / 15, 18], [1, 18]] },
  },
  "target-night-recovery-sleep": {
    listName: "Night Recovery & Deep Sleep (熟睡・深層リカバリー)",
    carrierText: "396Hz",
    beatText: "1.0〜2.0Hz",
    carrier: 396,
    beat: { kind: "sweep", from: 2, to: 1 },
    outro: "hold",
  },
  "target-anti-anxiety-panic": {
    listName: "Anti-Anxiety & Panic Reset (不安・パニック即時鎮静)",
    carrierText: "432Hz",
    beatText: "5.5Hz",
    carrier: 432,
    beat: { kind: "steady", hz: 5.5 },
  },
  "target-autonomic-balance-vagus": {
    listName: "Autonomic Balance & Vagus (自律神経・迷走神経調整)",
    carrierText: "528Hz",
    beatText: "7.83Hz",
    carrier: 528,
    beat: { kind: "steady", hz: 7.83 },
  },
  "target-brain-cleansing": {
    listName: "Brain Cleansing（脳疲労リセット）:",
    carrierText: "528Hz",
    beatText: "4〜6 Hz",
    carrier: 528,
    beat: { kind: "wave", lo: 4, hi: 6 },
  },
  "target-deep-rem-dream-reset": {
    listName: "DeepREM & Dream Memory Reset（浅い夢・悪夢の低減）",
    carrierText: "396 Hz",
    beatText: "1.5 Hz",
    carrier: 396,
    beat: { kind: "steady", hz: 1.5 },
    outro: "hold",
  },
  "target-emotional-eating": {
    listName: "Emotional Eating & Craving Control（ストレス食い・過剰な欲求の抑制）",
    carrierText: "852 Hz",
    beatText: "10.0 Hz",
    carrier: 852,
    beat: { kind: "steady", hz: 10 },
  },
  "target-exam-interview-panic": {
    listName: "Exam & Interview Anti-Panic (本番前のあがり症ケア)",
    carrierText: "528Hz",
    beatText: "7.83Hz",
    carrier: 528,
    beat: { kind: "steady", hz: 7.83 },
  },
  "target-executive-burnout": {
    listName: "Executive Burnout Recovery (責任感・重圧・決断疲労)",
    carrierText: "396Hz",
    beatText: "0.5Hz〜2.0Hz",
    carrier: 396,
    beat: { kind: "sweep", from: 2, to: 0.5 },
  },
  "target-mental-quietness": {
    listName: "Mental Quietness（思考オフ・静寂セッション）",
    carrierText: "432Hz",
    beatText: "9Hz",
    carrier: 432,
    beat: { kind: "steady", hz: 9 },
  },
  "target-post-work-decompression": {
    listName: "Post-Work Decompression（退勤後・オンオフ即時切り替え）",
    carrierText: "741 Hz",
    beatText: "8.0 Hz",
    carrier: 741,
    beat: { kind: "steady", hz: 8 },
  },
  "target-seasonal-weather": {
    listName: "Seasonal Affective & Weather Sensitivity（低気圧不調・寒暖差・季節性ディプレッション）",
    carrierText: "126.22 Hz",
    beatText: "8.0 Hz",
    carrier: 126.22,
    beat: { kind: "steady", hz: 8 },
  },
  "target-shallow-breathing": {
    listName: "Shallow Breathing & Rib Cage Open（浅い呼吸・胸の窮屈さ）",
    carrierText: "639 Hz",
    beatText: "6.0 Hz",
    carrier: 639,
    beat: { kind: "steady", hz: 6 },
  },
  "target-sns-fatigue-detox": {
    listName: "SNS Fatigue & Dopamine Detox (SNS疲れ・ドパミンリセット)",
    carrierText: "432Hz",
    beatText: "5.5Hz",
    carrier: 432,
    beat: { kind: "steady", hz: 5.5 },
  },
  "target-tinnitus-auditory": {
    listName: "Tinnitus & Auditory Unwind（耳鳴り・聴覚の過敏ケア）",
    carrierText: "128 Hz",
    beatText: "0.5 Hz 〜 3.0 Hz",
    carrier: 128,
    beat: { kind: "sweep", from: 3, to: 0.5 },
  },
  "target-vagus-nerve-release": {
    listName: "Vagus Nerve Release（自律神経調律）",
    carrierText: "136.1Hz",
    beatText: "3～5Hz",
    carrier: 136.1,
    beat: { kind: "wave", lo: 3, hi: 5 },
  },
  "target-hangover-liver": {
    listName: "Alcohol Hangover & Liver Recovery（二日酔い・頭重感のケア）",
    carrierText: "417 Hz",
    beatText: "8.5 Hz",
    carrier: 417,
    beat: { kind: "steady", hz: 8.5 },
  },
  "target-chronic-fatigue": {
    listName: "Chronic Fatigue & Battery Charge（慢性疲労・エネルギー枯渇）",
    carrierText: "432 Hz",
    beatText: "7.83 Hz→10.0 Hz",
    carrier: 432,
    beat: { kind: "path", target: 7.83, keys: [[0, 7.83], [2 / 15, 7.83], [7.5 / 15, 7.83], [9.5 / 15, 10], [1, 10]] },
  },
  "target-circulation-swelling": {
    listName: "Circulation & Swelling Relief（むくみ・体液循環の改善）",
    carrierText: "639 Hz",
    beatText: "7.83 Hz",
    carrier: 639,
    beat: { kind: "steady", hz: 7.83 },
  },
  "target-cold-extremities": {
    listName: "Cold Extremities & Circulation (冷え性・血行促進)",
    carrierText: "528Hz",
    beatText: "10Hz〜14Hz",
    carrier: 528,
    beat: { kind: "wave", lo: 10, hi: 14 },
  },
  "target-eye-strain-cooling": {
    listName: "Eye Strain & Brain Cooling (眼精疲労・脳のオーバーヒート)",
    carrierText: "741Hz",
    beatText: "10.0Hz",
    carrier: 741,
    beat: { kind: "steady", hz: 10 },
  },
  "target-head-pain-tension": {
    listName: "Head Pain & Tension Relief (頭痛・肩こり緩和)",
    carrierText: "174Hz",
    beatText: "2.0Hz",
    carrier: 174,
    beat: { kind: "steady", hz: 2 },
  },
  "target-jaw-facial-tension": {
    listName: "Jaw Clenching & Facial Tension (食い拾い・表情筋弛緩)",
    carrierText: "174Hz",
    beatText: "4.5Hz",
    carrier: 174,
    beat: { kind: "steady", hz: 4.5 },
  },
  "target-joint-mobility": {
    listName: "Joint & Mobility Comfort (膝・関節・歩行ケア)",
    carrierText: "174Hz",
    beatText: "3.0Hz",
    carrier: 174,
    beat: { kind: "steady", hz: 3 },
  },
  "target-lactic-acid-workout": {
    listName: "Lactic Acid & Post-Workout (筋肉痛・運動後リカバリー)",
    carrierText: "285Hz",
    beatText: "10.0Hz",
    carrier: 285,
    beat: { kind: "steady", hz: 10 },
  },
  "target-pelvic-lumbar-unwind": {
    listName: "Pelvic & Lumbar Unwind（腰痛・骨盤周りの緊張緩和）",
    carrierText: "174 Hz",
    beatText: "3.0 Hz",
    carrier: 174,
    beat: { kind: "steady", hz: 3 },
  },
  "target-brain-agility-memory": {
    listName: "Brain Agility & Memory Active (認知ケア・40Hz認知トレ)",
    carrierText: "1000Hz",
    beatText: "40.0Hz",
    carrier: 1000,
    beat: { kind: "steady", hz: 40 },
  },
  "target-menopause-autonomic": {
    listName: "Menopause & Autonomic Balance (更年期・ホルモンケア)",
    carrierText: "210.42Hz",
    beatText: "6.0Hz",
    carrier: 210.42,
    beat: { kind: "steady", hz: 6 },
  },
  "target-postpartum-short-nap": {
    listName: "Postpartum Short Nap (産後ママ・パパの超急速リカバリー)",
    carrierText: "285Hz",
    beatText: "2.0Hz",
    carrier: 285,
    beat: { kind: "steady", hz: 2 },
  },
  "target-pre-mama-calm-bonding": {
    listName: "Pre-Mama Calm & Bonding (プレママ・マタニティ)",
    carrierText: "432Hz",
    beatText: "7.83Hz",
    carrier: 432,
    beat: { kind: "steady", hz: 7.83 },
  },
  "energy-c0-earth-star": {
    listName: "【第0チャクラ】アーススター（Earth Star）",
    carrierText: "194.18 Hz",
    beatText: "7.83 Hz",
    carrier: 194.18,
    beat: { kind: "steady", hz: 7.83 },
  },
  "energy-c1-muladhara": {
    listName: "【第1チャクラ】ルート（Muladhara）",
    carrierText: "396Hz",
    beatText: "4.0 Hz",
    carrier: 396,
    beat: { kind: "steady", hz: 4 },
  },
  "energy-c2-svadhisthana": {
    listName: "【第2チャクラ】サクラル（Svadhisthana）",
    carrierText: "417Hz",
    beatText: "6.0 Hz",
    carrier: 417,
    beat: { kind: "steady", hz: 6 },
  },
  "energy-c3-manipura": {
    listName: "【第3チャクラ】ソーラープレクサス（Manipura）",
    carrierText: "528Hz",
    beatText: "10.0 Hz",
    carrier: 528,
    beat: { kind: "steady", hz: 10 },
  },
  "energy-c4-anahata": {
    listName: "【第4チャクラ】ハート（Anahata）",
    carrierText: "639Hz",
    beatText: "8.0 Hz",
    carrier: 639,
    beat: { kind: "steady", hz: 8 },
  },
  "energy-c5-vishuddha": {
    listName: "【第5チャクラ】スロート（Vishuddha）",
    carrierText: "741Hz",
    beatText: "12.0 Hz",
    carrier: 741,
    beat: { kind: "steady", hz: 12 },
  },
  "energy-c6-ajna": {
    listName: "【第6チャクラ】サードアイ（Ajna）",
    carrierText: "852Hz",
    beatText: "40.0 Hz",
    carrier: 852,
    beat: { kind: "steady", hz: 40 },
  },
  "energy-c7-sahasrara": {
    listName: "【第7チャクラ】クラウン（Sahasrara）",
    carrierText: "963Hz",
    beatText: "14.0 Hz",
    carrier: 963,
    beat: { kind: "steady", hz: 14 },
  },
  "energy-c8-soul-star": {
    listName: "【第8チャクラ】ソウルスター（Soul Star）",
    carrierText: "1074 Hz",
    beatText: "4096 Hz",
    carrier: 1074,
    beat: { kind: "steady", hz: 20 },
    provisional: true,
    note: "一覧の 4096Hz は脳波の帯域ではなく、差を付けると片耳が 4kHz を超える高音になってうなりとして聞こえない。ビートは暫定の 20Hz のまま、一覧の確認待ち",
  },
  "energy-c9-spirit": {
    listName: "【第9チャクラ】スピリット（Spirit）",
    carrierText: "1185 Hz",
    beatText: "55.0 Hz",
    carrier: 1185,
    beat: { kind: "steady", hz: 55 },
  },
  "energy-c10-universal": {
    listName: "【第10チャクラ】ユニバーサル（Universal）",
    carrierText: "1296 Hz",
    beatText: "70.0 Hz",
    carrier: 1296,
    beat: { kind: "steady", hz: 70 },
  },
  "energy-c11-galactic": {
    listName: "【第11チャクラ】ギャラクティック（Galactic）",
    carrierText: "1407 Hz",
    beatText: "88.0 Hz",
    carrier: 1407,
    beat: { kind: "steady", hz: 88 },
  },
  "energy-c12-divine-gateway": {
    listName: "【第12チャクラ】ディヴァイン・ゲートウェイ（Divine Gateway）",
    carrierText: "1518 Hz",
    beatText: "Pure Void",
    carrier: 1518,
    beat: { kind: "steady", hz: 0 },
    outro: "hold",
    note: "Pure Void（音のない共鳴領域）＝ビート 0Hz。10Hz から少しずつうなりを遅くして左右同じ音（うなりの無い静けさ）へ溶け込ませ、そのまま終える",
  },
  "morning-tuning": {
    listName: "Morning Tuning & Energize （アルファ〜ベータ波 / 432Hz）",
    carrierText: "432 Hz",
    beatText: "10 Hz",
    carrier: 432,
    beat: { kind: "path", target: 10, keys: [[0, 10], [2 / 10, 10], [6 / 10, 10], [9 / 10, 15], [1, 15]] },
    note: "「音響テーマ」欄の「10.0 Hz ➔ 15.0 Hz（アルファ波からローベータ波へのアセンション）」どおり、10Hz で同調してから 15Hz へ持ち上げて終える",
  },
};
