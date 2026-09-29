/**
 * Target / Energy 節目の曲（brainwave-sounds リポジトリ内のパス）。
 *
 * 曲は別リポジトリ qianyueee/brainwave-sounds の GitHub Pages に置いてある
 * （lib/sounds.ts の musicUrl）。ファイル名は納品されたときのまま——id から
 * 機械的に導けない（英題と日本語名の並べ方・括弧・「_ 6分」の有無がまちまち）
 * ので、1件ずつ書く。向こうでファイル名を変えたらここも直す。
 *
 * 値だけのモジュール（import なし）。lib/programs.ts → catalog の一方通行を崩さない。
 */
export const CATALOG_MUSIC: Record<string, string> = {
  // Targetプログラム
  "target-gamma-peak-focus":        "Targetプログラム/仕事・勉強_40Hz Gamma Peak & Focus（明晰集中・ひらめき統合）.mp3",
  "target-afternoon-power-nap":     "Targetプログラム/仕事・勉強_Afternoon Power Nap (15分_20分 高速仮眠).mp3",
  "target-brain-fog-clarity":       "Targetプログラム/仕事・勉強_Brain Fog & Mental Clarity（ブレインフォグ・頭のモヤモヤ）.mp3",
  "target-clarity-focus-work":      "Targetプログラム/仕事・勉強_Clarity & Focus（ガンマ波 _ 40Hz 集中ワーク）.mp3",
  "target-creative-flow":           "Targetプログラム/仕事・勉強_Creative Flow（ひらめき・直感統合 _ 6分）.mp3",
  "target-esports-reflex-booster":  "Targetプログラム/仕事・勉強_Esports & Reflex Booster (反応速度・ゲーミング).mp3",
  "target-flow-state-deep-work":    "Targetプログラム/仕事・勉強_Flow State & Deep Work (ゾーン体験・フロー状態).mp3",
  "target-high-speed-learning":     "Targetプログラム/仕事・勉強_High-Speed Learning (超集中・学習モード).mp3",
  "target-deep-golden-sleep":       "Targetプログラム/睡眠・リズム_Deep Golden Sleep (シニア向け深層睡眠).mp3",
  "target-deep-sleep-journey":      "Targetプログラム/睡眠・リズム_Deep Sleep Journey（入眠ガイド _ 6分）.mp3",
  "target-jet-lag-shift-reset":     "Targetプログラム/睡眠・リズム_Jet Lag & Shift Worker Reset (時差ぼけ・夜勤シフト調整).mp3",
  "target-midnight-awakening-care": "Targetプログラム/睡眠・リズム_Midnight Awakening Care (中途覚醒・夜中の再入眠).mp3",
  "target-morning-grogginess-boot": "Targetプログラム/睡眠・リズム_Morning Grogginess & Boot (朝の強い倦怠感・覚醒).mp3",
  "target-night-recovery-sleep":    "Targetプログラム/睡眠・リズム_Night Recovery & Deep Sleep (熟睡・深層リカバリー).mp3",
  "target-anti-anxiety-panic":      "Targetプログラム/緊張・精神_Anti-Anxiety & Panic Reset (不安・パニック即時鎮静).mp3",
  "target-autonomic-balance-vagus": "Targetプログラム/緊張・精神_Autonomic Balance & Vagus (自律神経・迷走神経調整).mp3",
  "target-brain-cleansing":         "Targetプログラム/緊張・精神_Brain Cleansing（脳疲労リセット _ 6分）.mp3",
  "target-deep-rem-dream-reset":    "Targetプログラム/緊張・精神_DeepREM & Dream Memory Reset（浅い夢・悪夢の低減）.mp3",
  "target-emotional-eating":        "Targetプログラム/緊張・精神_Emotional Eating & Craving Control（ストレス食い・過剰な欲求の抑制）.mp3",
  "target-exam-interview-panic":    "Targetプログラム/緊張・精神_Exam & Interview Anti-Panic (本番前のあがり症ケア).mp3",
  "target-executive-burnout":       "Targetプログラム/緊張・精神_Executive Burnout Recovery (責任感・重圧・決断疲労).mp3",
  "target-mental-quietness":        "Targetプログラム/緊張・精神_Mental Quietness（思考オフ・静寂 _ 6分）.mp3",
  "target-post-work-decompression": "Targetプログラム/緊張・精神_Post-Work Decompression（退勤後・オンオフ即時切り替え）.mp3",
  "target-seasonal-weather":        "Targetプログラム/緊張・精神_Seasonal Affective & Weather Sensitivity（低気圧不調・寒暖差・季節性ディプレッション）.mp3",
  "target-shallow-breathing":       "Targetプログラム/緊張・精神_Shallow Breathing & Rib Cage Open（浅い呼吸・胸の窮屈さ）.mp3",
  "target-sns-fatigue-detox":       "Targetプログラム/緊張・精神_SNS Fatigue & Dopamine Detox (SNS疲れ・ドパミンリセット).mp3",
  "target-tinnitus-auditory":       "Targetプログラム/緊張・精神_Tinnitus & Auditory Unwind（耳鳴り・聴覚の過敏ケア）.mp3",
  "target-vagus-nerve-release":     "Targetプログラム/緊張・精神_Vagus Nerve Release（自律神経調律 _ 6分）.mp3",
  "target-hangover-liver":          "Targetプログラム/身体・不調_Alcohol Hangover & Liver Recovery（二日酔い・頭重感のケア）.mp3",
  "target-chronic-fatigue":         "Targetプログラム/身体・不調_Chronic Fatigue & Battery Charge（慢性疲労・エネルギー枯渇）.mp3",
  "target-circulation-swelling":    "Targetプログラム/身体・不調_Circulation & Swelling Relief（むくみ・体液循環の改善）.mp3",
  "target-cold-extremities":        "Targetプログラム/身体・不調_Cold Extremities & Circulation (冷え性・血行促進).mp3",
  "target-eye-strain-cooling":      "Targetプログラム/身体・不調_Eye Strain & Brain Cooling (眼精疲労・脳のオーバーヒート).mp3",
  "target-head-pain-tension":       "Targetプログラム/身体・不調_Head Pain & Tension Relief (頭痛・肩こり緩和).mp3",
  "target-jaw-facial-tension":      "Targetプログラム/身体・不調_Jaw Clenching & Facial Tension (食い拾い・表情筋弛緩).mp3",
  "target-joint-mobility":          "Targetプログラム/身体・不調_Joint & Mobility Comfort (膝・関節・歩行ケア).mp3",
  "target-lactic-acid-workout":     "Targetプログラム/身体・不調_Lactic Acid & Post-Workout (筋肉痛・運動後リカバリー).mp3",
  "target-pelvic-lumbar-unwind":    "Targetプログラム/身体・不調_Pelvic & Lumbar Unwind（腰痛・骨盤周りの緊張緩和）.mp3",
  "target-brain-agility-memory":    "Targetプログラム/生活・環境_Brain Agility & Memory Active (認知ケア・40Hz認知トレ).mp3",
  "target-menopause-autonomic":     "Targetプログラム/生活・環境_Menopause & Autonomic Balance (更年期・ホルモンケア).mp3",
  "target-postpartum-short-nap":    "Targetプログラム/生活・環境_Postpartum Short Nap (産後ママ・パパの超急速リカバリー).mp3",
  "target-pre-mama-calm-bonding":   "Targetプログラム/生活・環境_Pre-Mama Calm & Bonding (プレママ・マタニティ).mp3",

  // Energyプログラム
  "energy-c0-earth-star":           "Energyプログラム/【第0チャクラ】アーススター（Earth Star）.mp3",
  "energy-c1-muladhara":            "Energyプログラム/【第1チャクラ】ルート（Muladhara）.mp3",
  "energy-c2-svadhisthana":         "Energyプログラム/【第2チャクラ】サクラル（Svadhisthana）.mp3",
  "energy-c3-manipura":             "Energyプログラム/【第3チャクラ】ソーラープレクサス（Manipura）.mp3",
  "energy-c4-anahata":              "Energyプログラム/【第4チャクラ】ハート（Anahata）.mp3",
  "energy-c5-vishuddha":            "Energyプログラム/【第5チャクラ】スロート（Vishuddha）.mp3",
  "energy-c6-ajna":                 "Energyプログラム/【第6チャクラ】サードアイ（Ajna）.mp3",
  "energy-c7-sahasrara":            "Energyプログラム/【第7チャクラ】クラウン（Sahasrara）.mp3",
  "energy-c8-soul-star":            "Energyプログラム/【第8チャクラ】ソウルスター（Soul Star）.mp3",
  "energy-c9-spirit":               "Energyプログラム/【第9チャクラ】スピリット（Spirit）.mp3",
  "energy-c10-universal":           "Energyプログラム/【第10チャクラ】ユニバーサル（Universal）.mp3",
  "energy-c11-galactic":            "Energyプログラム/【第11チャクラ】ギャラクティック（Galactic）.mp3",
  "energy-c12-divine-gateway":      "Energyプログラム/【第12チャクラ】ディヴァイン・ゲートウェイ（Divine Gateway）.mp3",
};
