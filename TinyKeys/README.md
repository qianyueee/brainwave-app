# TinyKeys (macOS / Unix port)

A lightweight, low-latency, command-line **isomorphic keyboard synthesizer**.
This is a macOS port of the original Windows-only
[beiboogie/TinyKeys](https://github.com/beiboogie/TinyKeys), turning your QWERTY
keyboard into an expressive musical instrument with ADSR, a resonant low-pass
filter, vibrato (VB-2), tremolo (Trelicopter) and a tape echo (RE-20).

> See [QuickStart.md](QuickStart.md) for the full performance/controls guide.
> All synthesis behaviour matches the original — only the platform layer changed.

------

## Supported platforms

| Platform | Backend | Notes |
| --- | --- | --- |
| **macOS** | `src/platform_mac.c` | Primary target. Global key polling via `CGEventSourceKeyState`, layout-aware text via `UCKeyTranslate`. |
| **Linux** | `src/platform_linux.c` | Bonus. Global key polling via X11 `XQueryKeymap` (requires `$DISPLAY`). |
| **Headless / CI** | `src/platform_null.c` | No input devices; used for build verification and tests. |

Windows users should keep using the upstream project.

------

## Build & Run

### macOS

Requirements: Xcode command-line tools (`xcode-select --install`).

```bash
make            # produces ./tinykeys
./tinykeys
```

Or with CMake:

```bash
cmake -S . -B build && cmake --build build
./build/tinykeys
```

**Permissions:** macOS 10.15+ gates global keyboard monitoring. The first time
keys do not register, grant your terminal app (Terminal.app / iTerm2)
**Input Monitoring** access under *System Settings → Privacy & Security → Input
Monitoring*, then restart the terminal. The scroll-wheel uses standard xterm
mouse reporting and needs no special permission.

### Linux

Requirements: a C toolchain, `libX11` dev headers, an X server.

```bash
make            # auto-selects the X11 backend, produces ./tinykeys
./tinykeys
```

### Headless build (CI / no GUI)

```bash
make BACKEND=null
./tinykeys --selftest     # exercises preset scan + config load, then exits 0
```

### Tests

```bash
make test                 # builds & runs the core unit tests
# or via CMake:
cmake -S . -B build -DTINYKEYS_NULL_BACKEND=ON && cmake --build build && (cd build && ctest)
```

------

## What changed in the port

The audio engine, synthesis/effects DSP, configuration registry and TUI
rendering are unchanged from upstream. Only the OS-specific surface was
rewritten behind a small abstraction (`include/platform.h`):

| Windows API (original) | Portable replacement |
| --- | --- |
| `GetAsyncKeyState` (global key polling) | `platform_key_down` → `CGEventSourceKeyState` (macOS) / `XQueryKeymap` (Linux) |
| `ToUnicode` / `MapVirtualKeyA` (Save-As text) | `platform_poll_text_event` → `UCKeyTranslate` (macOS) / `XkbKeycodeToKeysym` (Linux) |
| `ReadConsoleInput` mouse wheel | `platform_poll_wheel` → xterm SGR mouse reporting on stdin |
| `timeGetTime` / `Sleep` / `timeBeginPeriod` | `platform_now_ms` / `platform_sleep_ms` (`clock_gettime` + `nanosleep`) |
| `SetConsoleMode` / `SetConsoleOutputCP` | `termios` raw mode + ANSI (UTF-8 is the terminal default) |
| `CRITICAL_SECTION` | `pthread_mutex_t` (recursive) |
| `GetModuleFileNameA` | `_NSGetExecutablePath` (macOS) / `/proc/self/exe` (Linux) |
| `FindFirstFileA` / `FindNextFileA` | `opendir` / `readdir` |
| `MAX_PATH`, `_stricmp`, `_strdup` | portable `MAX_PATH`, `strcasecmp`, `strdup` |
| Win32 virtual-key codes (`VK_*`) | neutral `TK_KEY_*` codes mapped per backend |

------

## License

MIT, inherited from the upstream project. See [LICENSE](LICENSE).
Built on [TinySoundFont](https://github.com/schellingb/TinySoundFont) and
[miniaudio](https://github.com/mackron/miniaudio).
