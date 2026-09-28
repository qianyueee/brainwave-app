package io.github.qianyueee.neurosync;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 再生中の通知（ロック画面の再生・一時停止）と後台再生の前面サービスを JS から
 * 動かす口。JS 側は lib/native/now-playing.ts、呼ぶのは lib/keep-alive.ts だけ
 * （Web 版で navigator.mediaSession を触っている箇所と1対1）。
 *
 * - start({title, artist, album, playLabel?, pauseLabel?, channelName?, channelDescription?})：
 *   通知を出して前面サービスを始める（再生中）。後ろの4つは通知のボタンとチャンネルの
 *   名前で、画面の表示言語で届く（無ければ日本語）
 * - setState({state: "playing" | "paused"})：再生／一時停止の表示を切り替える
 * - stop()：通知を消してサービスを止める
 * - イベント "action"（{action: "play" | "pause"}）：通知・ロック画面・イヤホンの操作
 */
@CapacitorPlugin(name = "NeuroSyncNowPlaying")
public class NowPlayingPlugin extends Plugin {

    @Override
    public void load() {
        NowPlayingService.setListener(action -> {
            JSObject data = new JSObject();
            data.put("action", action);
            notifyListeners("action", data);
        });
    }

    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "NeuroSync");
        String artist = call.getString("artist", "NeuroSync");
        String album = call.getString("album", "Binaural Beats");
        NowPlayingService.setLabels(
            call.getString("playLabel", "再生"),
            call.getString("pauseLabel", "一時停止"),
            call.getString("channelName", "再生中のプログラム"),
            call.getString("channelDescription", "再生・一時停止のボタン（ロック画面にも出ます）")
        );
        try {
            NowPlayingService.show(getContext(), title, artist, album);
            call.resolve();
        } catch (IllegalStateException | SecurityException e) {
            // 後台から前面サービスは始められない（Android 12+）。再生は画面の再生
            // ボタンから始まるので通常は起きない——音は鳴るが通知が出ないだけ。
            call.reject("前面サービスを開始できませんでした", e);
        }
    }

    @PluginMethod
    public void setState(PluginCall call) {
        NowPlayingService.setPlaying(!"paused".equals(call.getString("state", "playing")));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        NowPlayingService.hide();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        NowPlayingService.setListener(null);
        NowPlayingService.hide();
        super.handleOnDestroy();
    }
}
