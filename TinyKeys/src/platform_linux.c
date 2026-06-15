// ---------------------------------------------------------------------------
// platform_linux.c — Linux/X11 input backend for TinyKeys.
//
// The macOS/Windows builds poll global key state directly. On Linux the X11
// equivalent is XQueryKeymap(), which returns a bitmap of every physically
// pressed key, independent of window focus. Save-As text is translated via
// XkbKeycodeToKeysym() (analogue of ToUnicode/UCKeyTranslate).
//
// Link: -lX11. Requires a running X server ($DISPLAY). Provided as a bonus so
// the same code base runs on Linux desktops as well as macOS.
// ---------------------------------------------------------------------------

// Selected explicitly by the build system (CMake / Makefile on Linux). The
// X11 guard alone keeps it out of macOS builds, which select platform_mac.c.
#if defined(TINYKEYS_X11_BACKEND)

#include "../include/platform.h"
#include "platform_internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <unistd.h>
#include <limits.h>
#include <libgen.h>

#include <X11/Xlib.h>
#include <X11/keysym.h>
#include <X11/XKBlib.h>

static Display* g_dpy = NULL;

// Cached keymap snapshot, refreshed at most once per millisecond so the ~50
// key queries per frame share a single XQueryKeymap round-trip.
static char g_keymap[32];
static unsigned long g_keymap_ms = (unsigned long)-1;

static void refresh_keymap(void) {
    unsigned long now = platform_now_ms();
    if (now == g_keymap_ms) return;
    if (g_dpy) {
        XQueryKeymap(g_dpy, g_keymap);
    }
    g_keymap_ms = now;
}

static KeySym tk_to_keysym(int tk) {
    if (tk >= 'A' && tk <= 'Z') return XK_a + (tk - 'A'); // physical letter key
    if (tk >= '0' && tk <= '9') return XK_0 + (tk - '0');
    switch (tk) {
        case TK_KEY_MINUS:     return XK_minus;
        case TK_KEY_EQUALS:    return XK_equal;
        case TK_KEY_LBRACKET:  return XK_bracketleft;
        case TK_KEY_RBRACKET:  return XK_bracketright;
        case TK_KEY_SEMICOLON: return XK_semicolon;
        case TK_KEY_QUOTE:     return XK_apostrophe;
        case TK_KEY_COMMA:     return XK_comma;
        case TK_KEY_PERIOD:    return XK_period;
        case TK_KEY_SLASH:     return XK_slash;
        case TK_KEY_BACKSLASH: return XK_backslash;
        case TK_KEY_SPACE:     return XK_space;
        case TK_KEY_RETURN:    return XK_Return;
        case TK_KEY_BACKSPACE: return XK_BackSpace;
        case TK_KEY_ESCAPE:    return XK_Escape;
        case TK_KEY_TAB:       return XK_Tab;
        case TK_KEY_UP:        return XK_Up;
        case TK_KEY_DOWN:      return XK_Down;
        case TK_KEY_LEFT:      return XK_Left;
        case TK_KEY_RIGHT:     return XK_Right;
        case TK_KEY_LSHIFT:    return XK_Shift_L;
        case TK_KEY_RSHIFT:    return XK_Shift_R;
        case TK_KEY_LCTRL:     return XK_Control_L;
        case TK_KEY_RCTRL:     return XK_Control_R;
        case TK_KEY_LALT:      return XK_Alt_L;
        case TK_KEY_RALT:      return XK_Alt_R;
        case TK_KEY_CAPSLOCK:  return XK_Caps_Lock;
        default:               return NoSymbol;
    }
}

static bool keycode_down(KeyCode kc) {
    if (kc == 0) return false;
    return (g_keymap[kc / 8] & (1 << (kc % 8))) != 0;
}

static bool keysym_down(KeySym ks) {
    if (!g_dpy || ks == NoSymbol) return false;
    KeyCode kc = XKeysymToKeycode(g_dpy, ks);
    return keycode_down(kc);
}

bool platform_key_down(int tk_keycode) {
    if (!g_dpy) return false;
    refresh_keymap();
    switch (tk_keycode) {
        case TK_KEY_SHIFT_ANY: return keysym_down(XK_Shift_L) || keysym_down(XK_Shift_R);
        case TK_KEY_CTRL_ANY:  return keysym_down(XK_Control_L) || keysym_down(XK_Control_R);
        case TK_KEY_ALT_ANY:   return keysym_down(XK_Alt_L) || keysym_down(XK_Alt_R);
        default:               return keysym_down(tk_to_keysym(tk_keycode));
    }
}

// --- Save-As text input ----------------------------------------------------

static const int g_text_keys[] = {
    '0','1','2','3','4','5','6','7','8','9',
    'A','B','C','D','E','F','G','H','I','J','K','L','M',
    'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
    TK_KEY_MINUS, TK_KEY_EQUALS, TK_KEY_LBRACKET, TK_KEY_RBRACKET,
    TK_KEY_SEMICOLON, TK_KEY_QUOTE, TK_KEY_COMMA, TK_KEY_PERIOD,
    TK_KEY_SLASH, TK_KEY_BACKSLASH, TK_KEY_SPACE,
    TK_KEY_BACKSPACE, TK_KEY_RETURN
};
#define TEXT_KEY_COUNT ((int)(sizeof(g_text_keys) / sizeof(g_text_keys[0])))

static bool g_text_prev[TEXT_KEY_COUNT];

#define TEXT_QUEUE_CAP 32
static TkTextEvent g_text_queue[TEXT_QUEUE_CAP];
static int g_text_q_head = 0, g_text_q_tail = 0;

static void text_queue_push(TkTextEvent ev) {
    int next = (g_text_q_tail + 1) % TEXT_QUEUE_CAP;
    if (next == g_text_q_head) return;
    g_text_queue[g_text_q_tail] = ev;
    g_text_q_tail = next;
}

static bool text_queue_pop(TkTextEvent* out) {
    if (g_text_q_head == g_text_q_tail) return false;
    *out = g_text_queue[g_text_q_head];
    g_text_q_head = (g_text_q_head + 1) % TEXT_QUEUE_CAP;
    return true;
}

static char translate_tk(int tk, bool shift) {
    if (!g_dpy) return 0;
    KeySym ks = tk_to_keysym(tk);
    KeyCode kc = XKeysymToKeycode(g_dpy, ks);
    if (kc == 0) return 0;
    KeySym out = XkbKeycodeToKeysym(g_dpy, kc, 0, shift ? 1 : 0);
    if (out >= 0x20 && out <= 0x7e) return (char)out;
    return 0;
}

void platform_text_input_reset(void) {
    g_text_q_head = g_text_q_tail = 0;
    for (int i = 0; i < TEXT_KEY_COUNT; i++) {
        g_text_prev[i] = platform_key_down(g_text_keys[i]);
    }
}

bool platform_poll_text_event(TkTextEvent* out) {
    if (text_queue_pop(out)) return true;

    bool shift = platform_key_down(TK_KEY_SHIFT_ANY);
    for (int i = 0; i < TEXT_KEY_COUNT; i++) {
        bool cur = platform_key_down(g_text_keys[i]);
        if (cur && !g_text_prev[i]) {
            int tk = g_text_keys[i];
            TkTextEvent ev = { TK_TEXT_NONE, 0 };
            if (tk == TK_KEY_BACKSPACE) {
                ev.type = TK_TEXT_BACKSPACE;
            } else if (tk == TK_KEY_RETURN) {
                ev.type = TK_TEXT_ENTER;
            } else {
                char ch = translate_tk(tk, shift);
                if (ch) { ev.type = TK_TEXT_CHAR; ev.ch = ch; }
            }
            if (ev.type != TK_TEXT_NONE) text_queue_push(ev);
        }
        g_text_prev[i] = cur;
    }
    return text_queue_pop(out);
}

// --- Filesystem ------------------------------------------------------------

void platform_get_executable_dir(char* out, size_t size) {
    char raw[MAX_PATH];
    ssize_t n = readlink("/proc/self/exe", raw, sizeof(raw) - 1);
    if (n > 0) {
        raw[n] = '\0';
        char copy[MAX_PATH];
        snprintf(copy, sizeof(copy), "%s", raw);
        snprintf(out, size, "%s/", dirname(copy));
        return;
    }
    snprintf(out, size, "./");
}

// --- Lifecycle -------------------------------------------------------------

bool platform_init(void) {
    g_dpy = XOpenDisplay(NULL);
    if (!g_dpy) {
        fprintf(stderr, "TinyKeys: cannot open X display ($DISPLAY). "
                        "An X server is required for keyboard input.\n");
        return false;
    }
    tk_terminal_begin();
    platform_text_input_reset();
    return true;
}

void platform_shutdown(void) {
    tk_terminal_end();
    if (g_dpy) {
        XCloseDisplay(g_dpy);
        g_dpy = NULL;
    }
}

#endif // TINYKEYS_X11_BACKEND
