# 星座音乐（Zodiac Music）

星座音乐素材的说明。**实际播放的文件在 `public/sounds/zodiac/`**，这里只放说明。

## 现状

已交付 **96 首 = 12 星座 × 8 种差频**（40 / 20 / 14 / 12 / 10 / 7.83 / 6 / 2Hz）。

- 原始版本（190kbps、48kHz 立体声、含 360×360 封面图，共 454MB）保存在 **`zodiac-music` 分支**，不合并进 main
- 应用使用的是压缩版：128kbps、去封面，共 284MB，位于 `public/sounds/zodiac/<key>-b<beat>.mp3`（例：`aries-b40.mp3`、`libra-b7.83.mp3`）

## 重要：这些音频不含脑波诱导成分

经三项检测确认（左右声道无频率差 / 包络无差频调制 / 无差频纯音），交付的是**围绕载波频率创作的音乐**，文件名里的 `_40Hz` 只是标记该曲属于哪个节目，并非曲中真的含有该节拍。

因此应用的做法是：双耳节拍仍由 `lib/audio-engine.ts` 实时合成，这些音乐作为**伴奏铺在节拍下面**循环播放。详见 `lib/zodiac-audio.ts`。

## 待补

- **4Hz 共 12 个文件缺失**（文件名标签写的是 `TAG_HEALING (6Hz_4Hz_2Hz)`，实际只导出了 6Hz 和 2Hz）。目前用同星座的 2Hz 曲代替；补齐后放进 `public/sounds/zodiac/` 并在 `lib/zodiac-audio.ts` 的 `AVAILABLE_BEATS` 加上 `4` 即可
- 曲长 1〜8 分钟（平均约 3 分），而节目是 15 分钟，所以循环播放。若日后重做，做成可无缝循环的版本会更好

## 命名规则

`<zodiacKey>-b<beat>.mp3`，其中 key 为：aries / taurus / gemini / cancer / leo / virgo / libra / scorpio / sagittarius / capricorn / aquarius / pisces。
