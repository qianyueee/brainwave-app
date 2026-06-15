// ---------------------------------------------------------------------------
// platform_mac.c — macOS input backend for TinyKeys.
//
// The Windows original polled global hardware key state with
// GetAsyncKeyState(). The faithful macOS equivalent is
// CGEventSourceKeyState(), which reports whether a given hardware key is
// currently pressed regardless of which application has focus. Save-As text is
// translated with UCKeyTranslate() (the analogue of Win32 ToUnicode()), honouring
// the user's active keyboard layout.
//
// Frameworks: ApplicationServices (CGEventSourceKeyState), Carbon (TIS +
// UCKeyTranslate + LMGetKbdType), CoreFoundation.
//
// Note: on macOS 10.15+ the host terminal may need "Input Monitoring"
// permission (System Settings > Privacy & Security) for key polling to report
// presses. See README for details.
// ---------------------------------------------------------------------------

#if defined(__APPLE__)

#include "../include/platform.h"
#include "platform_internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <stdint.h>
#include <libgen.h>
#include <mach-o/dyld.h> // _NSGetExecutablePath

#include <ApplicationServices/ApplicationServices.h>
#include <Carbon/Carbon.h>

// --- Carbon virtual key codes (subset, from HIToolbox/Events.h) ------------
// Re-declared locally so the mapping table is self-documenting.
enum {
    MVK_A = 0x00, MVK_S = 0x01, MVK_D = 0x02, MVK_F = 0x03, MVK_H = 0x04,
    MVK_G = 0x05, MVK_Z = 0x06, MVK_X = 0x07, MVK_C = 0x08, MVK_V = 0x09,
    MVK_B = 0x0B, MVK_Q = 0x0C, MVK_W = 0x0D, MVK_E = 0x0E, MVK_R = 0x0F,
    MVK_Y = 0x10, MVK_T = 0x11,
    MVK_1 = 0x12, MVK_2 = 0x13, MVK_3 = 0x14, MVK_4 = 0x15, MVK_6 = 0x16,
    MVK_5 = 0x17, MVK_EQUAL = 0x18, MVK_9 = 0x19, MVK_7 = 0x1A,
    MVK_MINUS = 0x1B, MVK_8 = 0x1C, MVK_0 = 0x1D, MVK_RBRACKET = 0x1E,
    MVK_O = 0x1F, MVK_U = 0x20, MVK_LBRACKET = 0x21, MVK_I = 0x22, MVK_P = 0x23,
    MVK_RETURN = 0x24, MVK_L = 0x25, MVK_J = 0x26, MVK_QUOTE = 0x27,
    MVK_K = 0x28, MVK_SEMICOLON = 0x29, MVK_BACKSLASH = 0x2A, MVK_COMMA = 0x2B,
    MVK_SLASH = 0x2C, MVK_N = 0x2D, MVK_M = 0x2E, MVK_PERIOD = 0x2F,
    MVK_TAB = 0x30, MVK_SPACE = 0x31, MVK_DELETE = 0x33, MVK_ESCAPE = 0x35,
    MVK_SHIFT = 0x38, MVK_CAPSLOCK = 0x39, MVK_OPTION = 0x3A, MVK_CONTROL = 0x3B,
    MVK_RSHIFT = 0x3C, MVK_ROPTION = 0x3D, MVK_RCONTROL = 0x3E,
    MVK_LEFT = 0x7B, MVK_RIGHT = 0x7C, MVK_DOWN = 0x7D, MVK_UP = 0x7E,
    MVK_INVALID = 0xFFFF
};

// Map a TinyKeys key code (ASCII for letters/digits, TK_KEY_* otherwise) to a
// Carbon virtual key code. Returns MVK_INVALID for "_ANY" composites, which are
// handled separately.
static unsigned short tk_to_mvk(int tk) {
    if (tk >= 'A' && tk <= 'Z') {
        static const unsigned short letters[26] = {
            MVK_A, MVK_B, MVK_C, MVK_D, MVK_E, MVK_F, MVK_G, MVK_H, MVK_I,
            MVK_J, MVK_K, MVK_L, MVK_M, MVK_N, MVK_O, MVK_P, MVK_Q, MVK_R,
            MVK_S, MVK_T, MVK_U, MVK_V, MVK_W, MVK_X, MVK_Y, MVK_Z
        };
        return letters[tk - 'A'];
    }
    switch (tk) {
        case '0': return MVK_0; case '1': return MVK_1; case '2': return MVK_2;
        case '3': return MVK_3; case '4': return MVK_4; case '5': return MVK_5;
        case '6': return MVK_6; case '7': return MVK_7; case '8': return MVK_8;
        case '9': return MVK_9;
        case TK_KEY_MINUS:     return MVK_MINUS;
        case TK_KEY_EQUALS:    return MVK_EQUAL;
        case TK_KEY_LBRACKET:  return MVK_LBRACKET;
        case TK_KEY_RBRACKET:  return MVK_RBRACKET;
        case TK_KEY_SEMICOLON: return MVK_SEMICOLON;
        case TK_KEY_QUOTE:     return MVK_QUOTE;
        case TK_KEY_COMMA:     return MVK_COMMA;
        case TK_KEY_PERIOD:    return MVK_PERIOD;
        case TK_KEY_SLASH:     return MVK_SLASH;
        case TK_KEY_BACKSLASH: return MVK_BACKSLASH;
        case TK_KEY_SPACE:     return MVK_SPACE;
        case TK_KEY_RETURN:    return MVK_RETURN;
        case TK_KEY_BACKSPACE: return MVK_DELETE;
        case TK_KEY_ESCAPE:    return MVK_ESCAPE;
        case TK_KEY_TAB:       return MVK_TAB;
        case TK_KEY_UP:        return MVK_UP;
        case TK_KEY_DOWN:      return MVK_DOWN;
        case TK_KEY_LEFT:      return MVK_LEFT;
        case TK_KEY_RIGHT:     return MVK_RIGHT;
        case TK_KEY_LSHIFT:    return MVK_SHIFT;
        case TK_KEY_RSHIFT:    return MVK_RSHIFT;
        case TK_KEY_LCTRL:     return MVK_CONTROL;
        case TK_KEY_RCTRL:     return MVK_RCONTROL;
        case TK_KEY_LALT:      return MVK_OPTION;
        case TK_KEY_RALT:      return MVK_ROPTION;
        case TK_KEY_CAPSLOCK:  return MVK_CAPSLOCK;
        default:               return MVK_INVALID;
    }
}

static bool mvk_down(unsigned short mvk) {
    if (mvk == MVK_INVALID) return false;
    return CGEventSourceKeyState(kCGEventSourceStateHIDSystemState, (CGKeyCode)mvk);
}

bool platform_key_down(int tk_keycode) {
    switch (tk_keycode) {
        case TK_KEY_SHIFT_ANY: return mvk_down(MVK_SHIFT) || mvk_down(MVK_RSHIFT);
        case TK_KEY_CTRL_ANY:  return mvk_down(MVK_CONTROL) || mvk_down(MVK_RCONTROL);
        case TK_KEY_ALT_ANY:   return mvk_down(MVK_OPTION) || mvk_down(MVK_ROPTION);
        default:               return mvk_down(tk_to_mvk(tk_keycode));
    }
}

// --- Save-As text input (UCKeyTranslate) -----------------------------------

// Keys eligible to produce printable text while typing a preset name.
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

// Small FIFO of decoded text events.
#define TEXT_QUEUE_CAP 32
static TkTextEvent g_text_queue[TEXT_QUEUE_CAP];
static int g_text_q_head = 0, g_text_q_tail = 0;

static void text_queue_push(TkTextEvent ev) {
    int next = (g_text_q_tail + 1) % TEXT_QUEUE_CAP;
    if (next == g_text_q_head) return; // full: drop
    g_text_queue[g_text_q_tail] = ev;
    g_text_q_tail = next;
}

static bool text_queue_pop(TkTextEvent* out) {
    if (g_text_q_head == g_text_q_tail) return false;
    *out = g_text_queue[g_text_q_head];
    g_text_q_head = (g_text_q_head + 1) % TEXT_QUEUE_CAP;
    return true;
}

// Translate a Carbon key code + shift/caps state to a printable ASCII char
// using the current keyboard layout. Returns 0 if not printable.
static char translate_mvk(unsigned short mvk, bool shift, bool caps) {
    TISInputSourceRef src = TISCopyCurrentKeyboardLayoutInputSource();
    if (!src) return 0;
    CFDataRef layoutData = (CFDataRef)TISGetInputSourceProperty(src, kTISPropertyUnicodeKeyLayoutData);
    if (!layoutData) { CFRelease(src); return 0; }
    const UCKeyboardLayout* layout = (const UCKeyboardLayout*)CFDataGetBytePtr(layoutData);

    UInt32 modifierKeyState = 0;
    if (shift) modifierKeyState |= (shiftKey >> 8) & 0xFF;
    if (caps)  modifierKeyState |= (alphaLock >> 8) & 0xFF;

    UInt32 deadKeyState = 0;
    UniChar chars[4];
    UniCharCount actualLength = 0;
    OSStatus status = UCKeyTranslate(
        layout, mvk, kUCKeyActionDown, modifierKeyState,
        LMGetKbdType(), kUCKeyTranslateNoDeadKeysMask,
        &deadKeyState, 4, &actualLength, chars);

    CFRelease(src);
    if (status != noErr || actualLength < 1) return 0;
    UniChar wc = chars[0];
    if (wc >= 32 && wc <= 126) return (char)wc;
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
    bool caps = platform_key_down(TK_KEY_CAPSLOCK);

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
                char ch = translate_mvk(tk_to_mvk(tk), shift, caps);
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
    uint32_t bufsize = sizeof(raw);
    if (_NSGetExecutablePath(raw, &bufsize) != 0) {
        // Buffer too small (very unlikely): fall back to current directory.
        snprintf(out, size, "./");
        return;
    }
    // dirname() may modify its argument; operate on a copy.
    char copy[MAX_PATH];
    snprintf(copy, sizeof(copy), "%s", raw);
    char* dir = dirname(copy);
    snprintf(out, size, "%s/", dir);
}

// --- Lifecycle -------------------------------------------------------------

bool platform_init(void) {
    tk_terminal_begin();
    platform_text_input_reset();
    return true;
}

void platform_shutdown(void) {
    tk_terminal_end();
}

#endif // __APPLE__
