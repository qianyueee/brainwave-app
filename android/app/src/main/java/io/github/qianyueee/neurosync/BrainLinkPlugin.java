package io.github.qianyueee.neurosync;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * BrainLink（Bluetooth Classic の SPP）との「バイトの管」。JS 側は lib/native/brainlink.ts、
 * 使うのは lib/mind/bluetooth-link.ts だけ。
 *
 * PC ではブリッジ（bridge/）が OS のシリアルポート経由で読んでいたものを、ここでは
 * RFCOMM のソケットで直接読む。**解析はしない**——受け取ったバイトを約50msごとに
 * まとめて、受信時刻と一緒に JS へ渡すだけ（ThinkGear の解析は lib/mind/thinkgear.ts。
 * PC ブリッジと同じ結果になることを scripts/check-thinkgear.mjs が確かめている）。
 * 装置へは何も書かない（ブリッジも書かない）。自動の再接続も JS 側の役目。
 *
 * 権限は Android の版で違う：
 * - 12 以降：「付近のデバイス」（BLUETOOTH_CONNECT＝接続・ペアリング済み一覧、
 *   BLUETOOTH_SCAN＝近くの機器を探す）
 * - 11 以前：接続とペアリング済み一覧は許可不要。探すときだけ位置情報の許可と
 *   位置情報サービスのオンが要る
 * JS には版の違いを {connect, scan} の2つに畳んで見せる。
 *
 * 文言（日本語）は出さない：失敗はエラーコード（UNSUPPORTED / BT_OFF /
 * PERMISSION_DENIED / LOCATION_OFF / NOT_FOUND / BUSY / PAIR_FAILED / CONNECT_FAILED /
 * IO / CANCELLED）で返し、画面の言葉は JS が決める。
 */
@CapacitorPlugin(
    name = "NeuroSyncBrainLink",
    permissions = {
        @Permission(alias = "connect", strings = { Manifest.permission.BLUETOOTH_CONNECT }),
        @Permission(alias = "scan", strings = { Manifest.permission.BLUETOOTH_SCAN }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION })
    }
)
public class BrainLinkPlugin extends Plugin {

    /** SPP（シリアルポート）の標準 UUID。 */
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final long FLUSH_MS = 50;
    private static final int FLUSH_BYTES = 2048;
    private static final long PAIR_TIMEOUT_S = 60;

    private BluetoothAdapter adapter;
    private BroadcastReceiver receiver;

    private final ExecutorService connectExecutor = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService flusher = Executors.newSingleThreadScheduledExecutor();

    // 接続の状態。connectGeneration を進めると、進行中の接続・読み取りは「取り消された」ことを知る。
    private final Object lock = new Object();
    private volatile int connectGeneration = 0;
    private BluetoothSocket socket;
    private String connectedAddress;
    private String connectingAddress;
    private Thread reader;
    private ScheduledFuture<?> flushTask;
    private final ByteArrayOutputStream pending = new ByteArrayOutputStream();

    // ペアリング待ち（createBond の結果は放送で届く）。
    private volatile String bondingAddress;
    private volatile CountDownLatch bondLatch;

    @Override
    public void load() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = manager != null ? manager.getAdapter() : null;

        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                handleBroadcast(intent);
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(BluetoothAdapter.ACTION_STATE_CHANGED);
        filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
        filter.addAction(BluetoothDevice.ACTION_FOUND);
        filter.addAction(BluetoothDevice.ACTION_NAME_CHANGED);
        filter.addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
        // Bluetooth の放送は Bluetooth のプロセスから届く（system_server ではない）ので、
        // NOT_EXPORTED にすると Android 14 以降で届かなくなる。どれも保護された放送で、
        // ほかのアプリは偽装できない。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(receiver, filter);
        }
    }

    @Override
    protected void handleOnDestroy() {
        closeConnection();
        try {
            getContext().unregisterReceiver(receiver);
        } catch (IllegalArgumentException ignored) {
            // 登録前
        }
        connectExecutor.shutdownNow();
        flusher.shutdownNow();
        super.handleOnDestroy();
    }

    // ── 状態と権限 ──

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("adapter", adapterState());
        ret.put("scanNeedsLocation", Build.VERSION.SDK_INT < Build.VERSION_CODES.S);
        ret.put("locationEnabled", isLocationEnabled());
        call.resolve(ret);
    }

    @Override
    @PluginMethod
    public void checkPermissions(PluginCall call) {
        call.resolve(permissionsResult());
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        boolean wantConnect = true;
        boolean wantScan = true;
        JSArray wanted = call.getArray("permissions");
        if (wanted != null) {
            try {
                List<String> list = wanted.toList();
                wantConnect = list.contains("connect");
                wantScan = list.contains("scan");
            } catch (Exception ignored) {
                // 既定（両方）のまま
            }
        }
        List<String> aliases = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (wantConnect && getPermissionState("connect") != PermissionState.GRANTED) aliases.add("connect");
            if (wantScan && getPermissionState("scan") != PermissionState.GRANTED) aliases.add("scan");
        } else if (wantScan && getPermissionState("location") != PermissionState.GRANTED) {
            aliases.add("location");
        }
        if (aliases.isEmpty()) {
            call.resolve(permissionsResult());
            return;
        }
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "permissionsCallback");
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        call.resolve(permissionsResult());
    }

    /** Bluetooth をオンにする（システムの確認ダイアログ）。 */
    @PluginMethod
    public void requestEnable(PluginCall call) {
        if (adapter == null) {
            call.reject("Bluetooth がありません", "UNSUPPORTED");
            return;
        }
        if (adapter.isEnabled()) {
            JSObject ret = new JSObject();
            ret.put("enabled", true);
            call.resolve(ret);
            return;
        }
        if (!hasConnectPermission()) {
            call.reject("permission", "PERMISSION_DENIED");
            return;
        }
        startActivityForResult(call, new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), "enableResult");
    }

    @ActivityCallback
    private void enableResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        JSObject ret = new JSObject();
        ret.put("enabled", adapter != null && adapter.isEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        String target = call.getString("target", "app");
        Intent intent;
        if ("bluetooth".equals(target)) {
            intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
        } else if ("location".equals(target)) {
            intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
        }
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("設定を開けませんでした", "NOT_FOUND", e);
        }
    }

    // ── 機器の一覧 ──

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void getBondedDevices(PluginCall call) {
        if (!checkUsable(call)) {
            return;
        }
        try {
            JSArray devices = new JSArray();
            Set<BluetoothDevice> bonded = adapter.getBondedDevices();
            if (bonded != null) {
                for (BluetoothDevice device : bonded) {
                    devices.put(describe(device, null));
                }
            }
            JSObject ret = new JSObject();
            ret.put("devices", devices);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject("permission", "PERMISSION_DENIED", e);
        }
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void startDiscovery(PluginCall call) {
        if (!checkUsable(call)) {
            return;
        }
        if (!hasScanPermission()) {
            call.reject("permission", "PERMISSION_DENIED");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S && !isLocationEnabled()) {
            call.reject("location off", "LOCATION_OFF");
            return;
        }
        try {
            if (adapter.isDiscovering()) {
                adapter.cancelDiscovery();
            }
            if (adapter.startDiscovery()) {
                call.resolve();
            } else {
                call.reject("discovery failed", "IO");
            }
        } catch (SecurityException e) {
            call.reject("permission", "PERMISSION_DENIED", e);
        }
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        cancelDiscoveryQuietly();
        call.resolve();
    }

    // ── 接続 ──

    /**
     * 指定の機器と SPP で繋ぐ。ペアリングしていなければ先にペアリングする（PIN などは
     * システムの画面が聞く）。RFCOMM が開いたら resolve し、以後 "data" が流れる。
     * 同じ機器に接続済み・接続中なら何もしない（冪等）。
     */
    @SuppressLint("MissingPermission")
    @PluginMethod
    public void connect(PluginCall call) {
        if (!checkUsable(call)) {
            return;
        }
        String address = call.getString("address", "");
        if (address == null || !BluetoothAdapter.checkBluetoothAddress(address)) {
            call.reject("bad address", "NOT_FOUND");
            return;
        }
        final int generation;
        synchronized (lock) {
            if (address.equals(connectedAddress) && socket != null && socket.isConnected()) {
                call.resolve();
                return;
            }
            if (address.equals(connectingAddress)) {
                call.reject("already connecting", "BUSY");
                return;
            }
            // 別の機器・切れた接続は畳んでから（発見中の探索も止める——RFCOMM が遅くなる）。
            closeConnectionLocked();
            generation = ++connectGeneration;
            connectingAddress = address;
        }
        connectExecutor.execute(() -> runConnect(call, address, generation));
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        closeConnection();
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    private void runConnect(PluginCall call, String address, int generation) {
        BluetoothSocket opened = null;
        try {
            cancelDiscoveryQuietly();
            BluetoothDevice device = adapter.getRemoteDevice(address);
            if (device.getBondState() != BluetoothDevice.BOND_BONDED) {
                emitConnection("pairing", address, null, null);
                if (!bond(device)) {
                    finishConnectFailure(call, address, generation, "PAIR_FAILED", "pairing failed");
                    return;
                }
            }
            if (generation != connectGeneration) {
                finishConnectFailure(call, address, generation, "CANCELLED", "cancelled");
                return;
            }
            opened = openSocket(device);
            synchronized (lock) {
                if (generation != connectGeneration) {
                    closeQuietly(opened);
                    connectingAddress = null;
                    call.reject("cancelled", "CANCELLED");
                    return;
                }
                socket = opened;
                connectedAddress = address;
                connectingAddress = null;
                startReaderLocked(opened, address, generation);
            }
            emitConnection("connected", address, null, null);
            call.resolve();
        } catch (SecurityException e) {
            closeQuietly(opened);
            finishConnectFailure(call, address, generation, "PERMISSION_DENIED", e.getMessage());
        } catch (Exception e) {
            closeQuietly(opened);
            finishConnectFailure(call, address, generation, "CONNECT_FAILED", e.getMessage());
        }
    }

    private void finishConnectFailure(PluginCall call, String address, int generation, String code, String message) {
        synchronized (lock) {
            if (generation == connectGeneration) {
                connectingAddress = null;
            }
        }
        call.reject(message != null ? message : code, code);
    }

    /** ペアリングして結果を待つ（最長60秒。PIN の入力などはシステムの画面）。 */
    @SuppressLint("MissingPermission")
    private boolean bond(BluetoothDevice device) throws InterruptedException {
        CountDownLatch latch = new CountDownLatch(1);
        bondingAddress = device.getAddress();
        bondLatch = latch;
        try {
            if (!device.createBond() && device.getBondState() != BluetoothDevice.BOND_BONDING) {
                return device.getBondState() == BluetoothDevice.BOND_BONDED;
            }
            latch.await(PAIR_TIMEOUT_S, TimeUnit.SECONDS);
            return device.getBondState() == BluetoothDevice.BOND_BONDED;
        } finally {
            bondingAddress = null;
            bondLatch = null;
        }
    }

    /**
     * RFCOMM を開く。機種によって SDP の検索が不安定なので、通常 → 暗号化なし →
     * チャンネル1直指定（非公開 API、使えない版では素通り）の順に試す。
     */
    @SuppressLint("MissingPermission")
    private BluetoothSocket openSocket(BluetoothDevice device) throws IOException {
        IOException last = null;
        BluetoothSocket s = null;
        try {
            s = device.createRfcommSocketToServiceRecord(SPP_UUID);
            s.connect();
            return s;
        } catch (IOException e) {
            last = e;
            closeQuietly(s);
        }
        s = null;
        try {
            s = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
            s.connect();
            return s;
        } catch (IOException e) {
            last = e;
            closeQuietly(s);
        }
        s = null;
        try {
            Method method = device.getClass().getMethod("createRfcommSocket", int.class);
            s = (BluetoothSocket) method.invoke(device, 1);
            if (s != null) {
                s.connect();
                return s;
            }
        } catch (IOException e) {
            last = e;
            closeQuietly(s);
        } catch (Exception e) {
            closeQuietly(s);
        }
        throw last != null ? last : new IOException("connect failed");
    }

    /** 読み取りスレッドと、約50msごとに JS へ渡す係を動かす。 */
    private void startReaderLocked(BluetoothSocket s, String address, int generation) {
        synchronized (pending) {
            pending.reset();
        }
        flushTask = flusher.scheduleWithFixedDelay(this::flush, FLUSH_MS, FLUSH_MS, TimeUnit.MILLISECONDS);
        reader = new Thread(
            () -> {
                byte[] buf = new byte[1024];
                try {
                    InputStream in = s.getInputStream();
                    while (generation == connectGeneration) {
                        int n = in.read(buf);
                        if (n < 0) {
                            throw new IOException("stream closed");
                        }
                        if (n > 0) {
                            boolean full;
                            synchronized (pending) {
                                pending.write(buf, 0, n);
                                full = pending.size() >= FLUSH_BYTES;
                            }
                            if (full) {
                                flush();
                            }
                        }
                    }
                } catch (IOException e) {
                    // 相手の電源が切れた・遠ざかった・こちらが切った。こちらが切ったとき
                    // （世代が進んでいる）は黙って終わる。
                    boolean unexpected;
                    synchronized (lock) {
                        unexpected = generation == connectGeneration;
                        if (unexpected) {
                            closeConnectionLocked();
                        }
                    }
                    if (unexpected) {
                        flush();
                        emitConnection("disconnected", address, "IO", e.getMessage());
                    }
                }
            },
            "BrainLinkReader"
        );
        reader.setDaemon(true);
        reader.start();
    }

    private void flush() {
        byte[] bytes;
        synchronized (pending) {
            if (pending.size() == 0) {
                return;
            }
            bytes = pending.toByteArray();
            pending.reset();
        }
        JSObject data = new JSObject();
        data.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
        data.put("t", System.currentTimeMillis());
        notifyListeners("data", data);
    }

    /** 利用者の操作で接続を畳む（進行中の接続も取り消す）。繋がっていたなら切断を知らせる（エラーなし）。 */
    private void closeConnection() {
        String closed;
        synchronized (lock) {
            closed = connectedAddress;
            closeConnectionLocked();
        }
        if (closed != null) {
            emitConnection("disconnected", closed, null, null);
        }
    }

    private void closeConnectionLocked() {
        connectGeneration++;
        connectingAddress = null;
        if (flushTask != null) {
            flushTask.cancel(false);
            flushTask = null;
        }
        closeQuietly(socket); // 読み取りスレッドの read() がこれで抜ける
        socket = null;
        connectedAddress = null;
        reader = null;
        CountDownLatch latch = bondLatch;
        if (latch != null) {
            latch.countDown();
        }
    }

    // ── 放送 ──

    @SuppressLint("MissingPermission")
    private void handleBroadcast(Intent intent) {
        String action = intent.getAction();
        if (action == null) {
            return;
        }
        switch (action) {
            case BluetoothAdapter.ACTION_STATE_CHANGED: {
                JSObject ev = new JSObject();
                ev.put("adapter", adapterState());
                notifyListeners("adapterState", ev);
                int state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR);
                if (state == BluetoothAdapter.STATE_TURNING_OFF || state == BluetoothAdapter.STATE_OFF) {
                    String address;
                    synchronized (lock) {
                        address = connectedAddress;
                        if (address != null) {
                            closeConnectionLocked();
                        }
                    }
                    if (address != null) {
                        emitConnection("disconnected", address, "BT_OFF", "bluetooth off");
                    }
                }
                break;
            }
            case BluetoothAdapter.ACTION_DISCOVERY_FINISHED:
                notifyListeners("discoveryFinished", new JSObject());
                break;
            case BluetoothDevice.ACTION_FOUND:
            case BluetoothDevice.ACTION_NAME_CHANGED: {
                BluetoothDevice device = deviceExtra(intent);
                if (device != null) {
                    try {
                        notifyListeners("deviceFound", describe(device, intent.getStringExtra(BluetoothDevice.EXTRA_NAME)));
                    } catch (SecurityException ignored) {
                        // 権限が外された
                    }
                }
                break;
            }
            case BluetoothDevice.ACTION_BOND_STATE_CHANGED: {
                BluetoothDevice device = deviceExtra(intent);
                int state = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.ERROR);
                CountDownLatch latch = bondLatch;
                if (device != null && latch != null && device.getAddress().equals(bondingAddress) && state != BluetoothDevice.BOND_BONDING) {
                    latch.countDown();
                }
                break;
            }
            default:
                break;
        }
    }

    @SuppressWarnings("deprecation")
    private static BluetoothDevice deviceExtra(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice.class);
        }
        return intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
    }

    // ── 補助 ──

    private void emitConnection(String state, String address, String error, String message) {
        JSObject ev = new JSObject();
        ev.put("state", state);
        ev.put("address", address);
        if (error != null) {
            ev.put("error", error);
        }
        if (message != null) {
            ev.put("message", message);
        }
        notifyListeners("connection", ev);
    }

    @SuppressLint("MissingPermission")
    private JSObject describe(BluetoothDevice device, String nameHint) {
        String name = nameHint;
        if (name == null || name.isEmpty()) {
            name = device.getName();
        }
        JSObject d = new JSObject();
        d.put("address", device.getAddress());
        d.put("name", name != null ? name : JSObject.NULL);
        d.put("bonded", device.getBondState() == BluetoothDevice.BOND_BONDED);
        return d;
    }

    private String adapterState() {
        if (adapter == null) {
            return "unsupported";
        }
        switch (adapter.getState()) {
            case BluetoothAdapter.STATE_ON:
                return "on";
            case BluetoothAdapter.STATE_TURNING_ON:
                return "turningOn";
            case BluetoothAdapter.STATE_TURNING_OFF:
                return "turningOff";
            default:
                return "off";
        }
    }

    private JSObject permissionsResult() {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ret.put("connect", getPermissionState("connect").toString());
            ret.put("scan", getPermissionState("scan").toString());
        } else {
            ret.put("connect", PermissionState.GRANTED.toString());
            ret.put("scan", getPermissionState("location").toString());
        }
        return ret;
    }

    private boolean hasConnectPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || getPermissionState("connect") == PermissionState.GRANTED;
    }

    private boolean hasScanPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return getPermissionState("scan") == PermissionState.GRANTED;
        }
        return getPermissionState("location") == PermissionState.GRANTED;
    }

    /** アダプタがあり、オンで、接続の許可がある。無ければ理由のコードで reject して false。 */
    private boolean checkUsable(PluginCall call) {
        if (adapter == null) {
            call.reject("Bluetooth がありません", "UNSUPPORTED");
            return false;
        }
        if (!adapter.isEnabled()) {
            call.reject("bluetooth off", "BT_OFF");
            return false;
        }
        if (!hasConnectPermission()) {
            call.reject("permission", "PERMISSION_DENIED");
            return false;
        }
        return true;
    }

    @SuppressLint("MissingPermission")
    private void cancelDiscoveryQuietly() {
        // 探す許可が無いのに cancelDiscovery を呼ぶと、Android 12+ では例外になる。
        if (adapter == null || !hasScanPermission()) {
            return;
        }
        try {
            if (adapter.isDiscovering()) {
                adapter.cancelDiscovery();
            }
        } catch (SecurityException ignored) {
            // 権限が外された
        }
    }

    @SuppressWarnings("deprecation")
    private boolean isLocationEnabled() {
        LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) {
            return false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return lm.isLocationEnabled();
        }
        try {
            return Settings.Secure.getInt(getContext().getContentResolver(), Settings.Secure.LOCATION_MODE) != Settings.Secure.LOCATION_MODE_OFF;
        } catch (Settings.SettingNotFoundException e) {
            return false;
        }
    }

    private static void closeQuietly(BluetoothSocket s) {
        if (s == null) {
            return;
        }
        try {
            s.close();
        } catch (IOException ignored) {
            // 閉じられなくても捨てる
        }
    }
}
