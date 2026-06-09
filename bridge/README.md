# BrainLink ブリッジ（PC用）

BrainLink Pro ヘッドセットの脳波データを Bluetooth シリアル経由で読み取り、
Supabase Realtime でクラウドに送信するプログラムです。
スマホの Web アプリ（マインドマップ画面）で同じアカウントにログインすると、
リアルタイムに脳波の状態が表示されます。

```
BrainLink Pro ──Bluetooth──> このプログラム（PC） ──インターネット──> スマホのWebアプリ
```

## 必要なもの

- BrainLink Pro ヘッドセット
- Python 3.10 以上が入った PC（Windows / macOS / Linux）
- Web アプリのアカウント（スマホ側と同じもの）

## 1. Bluetooth ペアリングとシリアルポートの確認

ヘッドセットの電源を入れ、PC とペアリングしてください。
ペアリングすると「シリアルポート」として認識されます。

- **Windows**: 設定 → Bluetooth → その他の Bluetooth オプション → 「COM ポート」タブで
  `BrainLink` の **発信（Outgoing）** ポート（例: `COM3`）を確認
- **macOS**: ターミナルで `ls /dev/cu.*` を実行し、`/dev/cu.BrainLink_Pro` のような名前を確認
- **Linux**: `sudo rfcomm bind 0 <デバイスのMACアドレス>` で `/dev/rfcomm0` を作成

## 2. インストール

```bash
cd bridge
pip install -r requirements.txt
```

## 3. 設定

`.env.example` をコピーして `.env` を作成し、各項目を入力します。

```bash
cp .env.example .env
```

- `SUPABASE_URL` / `SUPABASE_ANON_KEY`: Web アプリと同じ Supabase プロジェクトの値
- `BRIDGE_EMAIL` / `BRIDGE_PASSWORD`: アプリのアカウント（**スマホ側と同じアカウント**）
- `EEG_PORT`: 手順1で確認したシリアルポート

## 4. 動作確認（3ステップ）

いきなり本番ではなく、以下の順で1つずつ確認すると問題の切り分けが簡単です。

### ステップ A: クラウド経路の確認（実機不要）

```bash
python main.py --demo
```

合成データがクラウドに送信されます。スマホで Web アプリの
「マインド」タブ →「リアルタイム」に切り替えて、
**「ブリッジ：オンライン」** と表示され、光る点が動けば成功です。

### ステップ B: 実機の確認（クラウド不要）

```bash
python main.py --dry-run
```

ヘッドセットを装着して、コンソールに「集中 / リラックス」の数値が
流れれば成功です。データは `bridge/logs/session_*.csv` にも保存されます。

### ステップ C: 本番

```bash
python main.py
```

ヘッドセット → PC → クラウド → スマホ、の全経路が繋がります。
測定データは毎回 CSV にも自動保存されます。

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `ポートを開けません` | ヘッドセットの電源・ペアリングを確認。他のアプリ（公式アプリ等）がポートを使っていないか確認。ポート名を `--port COM4` のように指定して試す |
| signal が 200 のまま / 装着確認の警告 | 電極が額と耳にしっかり接触しているか確認（乾燥していると接触不良になりやすい） |
| `ログインに失敗しました` | `.env` のメール/パスワードを確認。Web アプリでログインできるか確認 |
| スマホ側が「ブリッジ：オフライン」のまま | ステップ A で切り分け。PC のネット接続、スマホ側が同じアカウントでログインしているかを確認 |
| 送信失敗が連続する | 自動で再接続します。続く場合は `pip show realtime` でバージョンを確認（下記参照） |

## 既知の制約・技術メモ

- **realtime 送信ライブラリの成熟度**: Python から Supabase Realtime の
  broadcast 送信を行う API（`send_broadcast`）は JS 版より歴史が浅く、
  バージョンによりメソッド名が異なることがあります。問題がある場合は
  `pip install -U supabase` で更新してください。送信処理は `publisher.py` に
  分離してあるので、別の転送方式（DBテーブル経由など）への差し替えも容易です。
- **ThinkGear パーサー**: `thinkgear.py` は公開仕様（0xAA 0xAA 同期 +
  チェックサム + 0x83 = 8帯域パワー）に基づく自前実装です。万一お使いの
  ファームウェアで解析に問題がある場合は、公式の
  [Macrotellect/BrainLinkParser-Python](https://github.com/Macrotellect/BrainLinkParser-Python)
  を同梱（vendoring）して `main.py` の parser を差し替えてください。
- **チャンネルのアクセス制御**: 現状は「ユーザーIDを含むチャンネル名」による
  運用です（チャンネル名を知らない限り受信できませんが、厳密なアクセス制御では
  ありません）。本格運用時は Supabase Realtime の private channels + RLS の
  有効化を推奨します。
