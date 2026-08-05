# 星座音乐（Zodiac Music）

12 星座音乐素材的投放文件夹。把音频文件放进这里（网页拖拽上传 / git push 均可）。

## 命名建议

每个星座一个文件，文件名用星座的英文 key（与代码中 `ZodiacKey` 一致），方便直接接入：

| 文件名 | 星座 | | 文件名 | 星座 |
|---|---|---|---|---|
| `aries` | 牡羊座 | | `libra` | 天秤座 |
| `taurus` | 牡牛座 | | `scorpio` | 蠍座 |
| `gemini` | 双子座 | | `sagittarius` | 射手座 |
| `cancer` | 蟹座 | | `capricorn` | 山羊座 |
| `leo` | 獅子座 | | `aquarius` | 水瓶座 |
| `virgo` | 乙女座 | | `pisces` | 魚座 |

例：`aries.mp3`、`pisces.m4a`（mp3 / m4a / wav 均可）。

## 说明

- 此文件夹只是素材集散地，应用不会直接加载这里的文件
- 文件到位后再接入播放管线（复制到 `public/sounds/` 并在星座节目中引用）
