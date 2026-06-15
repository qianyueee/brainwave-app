#ifndef TINYKEYS_PLATFORM_H
#define TINYKEYS_PLATFORM_H

// ---------------------------------------------------------------------------
// Cross-platform abstraction layer for TinyKeys.
//
// The original TinyKeys was Windows-only and relied on the Win32 API for
// keyboard polling (GetAsyncKeyState), high-resolution timing (timeGetTime),
// console/terminal control and the mouse wheel (ReadConsoleInput).
//
// This header defines a small, platform-neutral surface that the rest of the
// app is written against. Concrete implementations live in:
//   - src/platform_mac.c   (macOS: CGEventSourceKeyState + UCKeyTranslate)
//   - src/platform_linux.c (Linux/X11: XQueryKeymap + Xkb)
//   - src/platform_null.c  (headless / CI builds: no input devices)
// ---------------------------------------------------------------------------

#include <stdbool.h>
#include <stddef.h>

// Win32 defines MAX_PATH; provide a portable equivalent everywhere else.
#ifndef MAX_PATH
#define MAX_PATH 1024
#endif

// ---------------------------------------------------------------------------
// Platform-neutral key codes.
//
// Printable ASCII keys keep their uppercase ASCII value so that note-map
// tables stay readable ('1', 'Q', 'A', ...). Everything else lives above the
// ASCII range so the two spaces never collide.
// ---------------------------------------------------------------------------
enum {
    TK_KEY_MINUS = 256, // '-' / '_'
    TK_KEY_EQUALS,      // '=' / '+'
    TK_KEY_LBRACKET,    // '[' / '{'
    TK_KEY_RBRACKET,    // ']' / '}'
    TK_KEY_SEMICOLON,   // ';' / ':'
    TK_KEY_QUOTE,       // '\'' / '"'
    TK_KEY_COMMA,       // ',' / '<'
    TK_KEY_PERIOD,      // '.' / '>'
    TK_KEY_SLASH,       // '/' / '?'
    TK_KEY_BACKSLASH,   // '\\' / '|'

    TK_KEY_SPACE,
    TK_KEY_RETURN,
    TK_KEY_BACKSPACE,
    TK_KEY_ESCAPE,
    TK_KEY_TAB,

    TK_KEY_UP,
    TK_KEY_DOWN,
    TK_KEY_LEFT,
    TK_KEY_RIGHT,

    // Modifiers. The "_ANY" variants report true if either side is held.
    TK_KEY_LSHIFT,
    TK_KEY_RSHIFT,
    TK_KEY_SHIFT_ANY,
    TK_KEY_LCTRL,
    TK_KEY_RCTRL,
    TK_KEY_CTRL_ANY,
    TK_KEY_LALT,
    TK_KEY_RALT,
    TK_KEY_ALT_ANY,
    TK_KEY_CAPSLOCK,

    TK_KEY__COUNT
};

// Text-input events surfaced while typing a preset name ("Save As").
typedef enum {
    TK_TEXT_NONE = 0,
    TK_TEXT_CHAR,        // ev.ch holds a printable ASCII character
    TK_TEXT_BACKSPACE,
    TK_TEXT_ENTER,
    TK_TEXT_CTRL_ENTER,  // "Save As" trigger inside the confirm prompt
    TK_TEXT_ESCAPE
} TkTextEventType;

typedef struct {
    TkTextEventType type;
    char ch;
} TkTextEvent;

// --- Lifecycle -------------------------------------------------------------
// Initialise input devices and put the terminal into raw mode (no echo, mouse
// reporting enabled). Returns false if the terminal/input backend is
// unavailable. Always pair with platform_shutdown().
bool platform_init(void);
void platform_shutdown(void);

// --- Timing ----------------------------------------------------------------
// Monotonic millisecond clock (replacement for timeGetTime()).
unsigned long platform_now_ms(void);
// Sleep for the given number of milliseconds (replacement for Sleep()).
void platform_sleep_ms(unsigned int ms);
// Request/release high timer resolution (timeBeginPeriod/timeEndPeriod). No-op
// on platforms that already provide a fine-grained sleep.
void platform_timer_begin(void);
void platform_timer_end(void);

// --- Filesystem ------------------------------------------------------------
// Absolute directory containing the running executable, with a trailing path
// separator. Replacement for GetModuleFileNameA()-based path building.
void platform_get_executable_dir(char *out, size_t size);

// --- Keyboard --------------------------------------------------------------
// Poll whether a key is currently physically down (replacement for
// GetAsyncKeyState(...) & 0x8000). Accepts a TK_KEY_* code or a printable
// ASCII value such as '1' or 'Q'.
bool platform_key_down(int tk_keycode);

// --- Mouse wheel -----------------------------------------------------------
// Net wheel notches accumulated since the last call. Positive = scroll up,
// negative = scroll down. Replacement for the ReadConsoleInput() wheel loop.
int platform_poll_wheel(void);

// --- Text input ("Save As") ------------------------------------------------
// Pop the next pending text-input event. Returns true and fills *out when an
// event is available, false when the queue is drained. Replacement for the
// GetAsyncKeyState()/ToUnicode() character-translation loop.
bool platform_poll_text_event(TkTextEvent *out);
// Reset the internal edge-detection state when entering Save-As mode so that
// keys already held down are not treated as fresh presses.
void platform_text_input_reset(void);

#endif // TINYKEYS_PLATFORM_H
