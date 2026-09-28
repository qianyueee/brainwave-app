package io.github.qianyueee.neurosync;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * 再生中だけ動く前面サービス（foregroundServiceType="mediaPlayback"）。
 *
 * WebView には navigator.mediaSession が無く、前面サービスが無いと画面を消した
 * 途端にアプリが止められる。スマホの Chrome が再生中に出している「メディアの
 * 通知（ロック画面の再生・一時停止）」と「後台でも止まらない」を、ここで同じように
 * 用意する。音そのものは今までどおり WebView（Web Audio）が鳴らし、このサービスは
 * 触らない。
 *
 * 状態は JS（lib/keep-alive.ts → NowPlayingPlugin）が決め、このサービスは表示と
 * ボタンの中継だけをする。ボタン（通知・ロック画面・イヤホンのボタン）は
 * {@link NowPlayingPlugin} 経由で JS の resumeSession / pauseSession に届く。
 *
 * 通知の見せ方は Android の標準（MediaSession ＋ MediaStyle）。Android 13 以降は
 * メディアセッションの通知が通知許可の対象外なので、許可ダイアログは出さない。
 *
 * Chrome がメディア再生中にしていることも同じくする：
 * - 着信・ほかのアプリの再生（オーディオフォーカスを失う）→ 一時停止。着信など
 *   一時的な喪失なら、戻ってきたら再開
 * - イヤホン／ヘッドホンが抜けた（AUDIO_BECOMING_NOISY）→ 一時停止（バイノーラル
 *   ビートが急にスピーカーから鳴り出さないように）
 * どれも JS の pauseSession / resumeSession を呼ぶだけで、音には直接触らない。
 *
 * スレッド：show / setPlaying / hide はプラグインのスレッドから呼ばれ、サービス
 * 自身の処理はすべてメインスレッドで行う（static の状態は volatile）。
 */
public class NowPlayingService extends Service {

    private static final String ACTION_UPDATE = "io.github.qianyueee.neurosync.nowplaying.UPDATE";
    private static final String ACTION_PLAY = "io.github.qianyueee.neurosync.nowplaying.PLAY";
    private static final String ACTION_PAUSE = "io.github.qianyueee.neurosync.nowplaying.PAUSE";

    private static final String CHANNEL_ID = "playback";
    private static final int NOTIFICATION_ID = 1001;

    /** JS へボタン操作を渡す口（NowPlayingPlugin が設定する）。 */
    interface ActionListener {
        void onAction(String action);
    }

    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private static volatile ActionListener listener;
    private static volatile NowPlayingService instance;
    /** JS が表示を望んでいるか。false のまま起動した（＝開始直後に止められた）ら自分で畳む。 */
    private static volatile boolean requested = false;

    // JS が最後に指定した表示内容。
    private static volatile String title = "NeuroSync";
    private static volatile String artist = "NeuroSync";
    private static volatile String album = "Binaural Beats";
    private static volatile boolean playing = true;

    // 通知のボタンと通知チャンネル（端末の設定に出る）の名前。画面の表示言語（日本語／
    // 英語）で JS から届く。届かない（古い画面の）ときは日本語のまま。
    private static volatile String playLabel = "再生";
    private static volatile String pauseLabel = "一時停止";
    private static volatile String channelName = "再生中のプログラム";
    private static volatile String channelDescription = "再生・一時停止のボタン（ロック画面にも出ます）";

    private MediaSession session;
    /** この起動で startForeground 済みか（2回目からの描き直しは notify。render の注記）。 */
    private boolean foreground = false;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest; // API 26+
    private boolean hasFocus = false;
    private boolean resumeOnFocusGain = false;

    private final AudioManager.OnAudioFocusChangeListener focusListener = (change) -> {
        switch (change) {
            case AudioManager.AUDIOFOCUS_LOSS:
                hasFocus = false;
                resumeOnFocusGain = false;
                if (playing) {
                    dispatch("pause");
                }
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                // 着信・読み上げなど。音量を下げるだけではビートの聞こえ方が変わるので止める。
                if (playing) {
                    resumeOnFocusGain = true;
                    dispatch("pause");
                }
                break;
            case AudioManager.AUDIOFOCUS_GAIN:
                hasFocus = true;
                if (resumeOnFocusGain) {
                    resumeOnFocusGain = false;
                    dispatch("play");
                }
                break;
            default:
                break;
        }
    };

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction()) && playing) {
                resumeOnFocusGain = false;
                dispatch("pause");
            }
        }
    };

    static void setListener(ActionListener l) {
        listener = l;
    }

    /** 通知の言葉を替える（次の show から。show の前に呼ぶ）。 */
    static void setLabels(String play, String pause, String name, String description) {
        playLabel = play;
        pauseLabel = pause;
        channelName = name;
        channelDescription = description;
    }

    /** 通知を出して前面サービスを始める（動いていれば描き直す）。前面にいる時だけ呼べる。 */
    static void show(Context context, String newTitle, String newArtist, String newAlbum) {
        title = newTitle;
        artist = newArtist;
        album = newAlbum;
        playing = true;
        requested = true;
        Intent intent = new Intent(context, NowPlayingService.class).setAction(ACTION_UPDATE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    /** 再生／一時停止の表示を切り替える（音は JS 側が止め・再開する）。 */
    static void setPlaying(boolean isPlaying) {
        playing = isPlaying;
        MAIN.post(() -> {
            NowPlayingService s = instance;
            if (s != null && requested) {
                s.render();
            }
        });
    }

    /** 通知を消してサービスを止める。まだ起動途中なら、起動後に自分で畳む。 */
    static void hide() {
        requested = false;
        MAIN.post(() -> {
            NowPlayingService s = instance;
            if (s != null && !requested) {
                s.shutdown();
            }
        });
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        ensureChannel();
        session = new MediaSession(this, "NeuroSync");
        session.setCallback(
            new MediaSession.Callback() {
                @Override
                public void onPlay() {
                    dispatch("play");
                }

                @Override
                public void onPause() {
                    dispatch("pause");
                }

                @Override
                public void onStop() {
                    dispatch("pause");
                }
            }
        );
        enableMediaButtonsBeforeOreo();
        session.setActive(true);

        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        IntentFilter noisy = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(noisyReceiver, noisy, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(noisyReceiver, noisy);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_PLAY.equals(action)) {
            dispatch("play");
        } else if (ACTION_PAUSE.equals(action)) {
            dispatch("pause");
        } else if (ACTION_UPDATE.equals(action)) {
            // 表示言語を替えたあとの再生なら、チャンネルの名前もそれに合わせる。
            ensureChannel();
        }
        // startForegroundService で起こされたら、止めるにしても一度は前面に出る必要がある。
        render();
        if (!requested) {
            shutdown();
        }
        // 音は WebView が持っているので、プロセスごと殺されたら戻しようがない——
        // 自動で作り直さない。
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // 最近のアプリから払われた＝WebView も消える。通知だけ残さない。
        requested = false;
        shutdown();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        instance = null;
        try {
            unregisterReceiver(noisyReceiver);
        } catch (IllegalArgumentException e) {
            // 登録前に落ちた
        }
        abandonFocus();
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void shutdown() {
        abandonFocus();
        stopForeground(STOP_FOREGROUND_REMOVE);
        foreground = false;
        stopSelf();
    }

    /** 8.0 未満は、この印が無いとイヤホンのボタンとロック画面の操作がセッションに届かない（以降は常に届く）。 */
    @SuppressWarnings("deprecation")
    private void enableMediaButtonsBeforeOreo() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        }
    }

    /** 再生を始める（再開する）ときにフォーカスを取る。取れなくても音は JS が鳴らす。 */
    @SuppressWarnings("deprecation") // Android 8 未満の分岐
    private void requestFocus() {
        if (hasFocus || audioManager == null) {
            return;
        }
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest == null) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(
                        new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build()
                    )
                    .setOnAudioFocusChangeListener(focusListener)
                    .build();
            }
            result = audioManager.requestAudioFocus(focusRequest);
        } else {
            result = audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        hasFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    @SuppressWarnings("deprecation")
    private void abandonFocus() {
        resumeOnFocusGain = false;
        if (!hasFocus || audioManager == null) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest != null) {
                audioManager.abandonAudioFocusRequest(focusRequest);
            }
        } else {
            audioManager.abandonAudioFocus(focusListener);
        }
        hasFocus = false;
    }

    private void dispatch(String action) {
        ActionListener l = listener;
        if (l != null) {
            l.onAction(action);
        }
    }

    private void render() {
        if (session == null) {
            return;
        }
        boolean isPlaying = playing;
        if (isPlaying) {
            requestFocus();
        }
        session.setMetadata(
            new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, album)
                .build()
        );
        session.setPlaybackState(
            new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE)
                .setState(
                    isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                    PlaybackState.PLAYBACK_POSITION_UNKNOWN,
                    isPlaying ? 1f : 0f
                )
                .build()
        );

        Notification notification = buildNotification(isPlaying);
        if (!foreground) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                } else {
                    startForeground(NOTIFICATION_ID, notification);
                }
                foreground = true;
            } catch (IllegalStateException | SecurityException e) {
                // 起こされた直後の1回目は通るはずだが、万一拒まれてもメインスレッドで落とさない
                // （音は WebView が鳴らし続ける。通知と後台の保証が無くなるだけ）。
                stopSelf();
            }
            return;
        }
        // 2回目からは startForeground を呼ばず、同じ ID への notify で描き直す（前面のまま）。
        // Android 12 以降、繰り返しの startForeground はそのときアプリが後台だと拒まれて
        // 例外になり（メインスレッドなのでアプリごと落ちる）、一時停止・再開はまさに後台で
        // 起きる——着信・通話の終わり・イヤホンが抜けた。
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, notification);
        }
    }

    @SuppressWarnings("deprecation") // Android 8 未満の分岐（通知チャンネルが無い）
    private Notification buildNotification(boolean isPlaying) {
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent openApp = launch == null
            ? null
            : PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        PendingIntent toggle = PendingIntent.getService(
            this,
            isPlaying ? 2 : 1,
            new Intent(this, NowPlayingService.class).setAction(isPlaying ? ACTION_PAUSE : ACTION_PLAY),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        Notification.Action toggleButton = new Notification.Action.Builder(
            Icon.createWithResource(this, isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play),
            isPlaying ? pauseLabel : playLabel,
            toggle
        ).build();

        builder
            .setSmallIcon(R.drawable.ic_stat_neurosync)
            .setContentTitle(title)
            .setContentText(artist)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(isPlaying)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .addAction(toggleButton)
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0));
        if (openApp != null) {
            builder.setContentIntent(openApp);
        }
        return builder.build();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        // 既にあっても渡し直す：既存のチャンネルで変わるのは名前と説明だけ（表示言語を
        // 替えたとき用）。重要度など利用者が設定で変えられる項目は上書きされない。
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, channelName, NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(channelDescription);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }
}
