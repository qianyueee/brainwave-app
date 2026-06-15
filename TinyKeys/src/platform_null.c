// ---------------------------------------------------------------------------
// platform_null.c — headless input backend.
//
// Provides the platform input surface with no real input devices. Used for
// continuous-integration builds and the unit-test harness on machines without
// a windowing system (no Cocoa, no X11). Timing/terminal/wheel come from
// platform_common.c; this file only stubs keyboard + text input + exe path.
// ---------------------------------------------------------------------------

#if !defined(__APPLE__) && defined(TINYKEYS_NULL_BACKEND)

#include "../include/platform.h"
#include "platform_internal.h"

#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <limits.h>
#include <libgen.h>

bool platform_key_down(int tk_keycode) {
    (void)tk_keycode;
    return false;
}

bool platform_poll_text_event(TkTextEvent* out) {
    (void)out;
    return false;
}

void platform_text_input_reset(void) {}

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

bool platform_init(void) {
    tk_terminal_begin();
    return true;
}

void platform_shutdown(void) {
    tk_terminal_end();
}

#endif // !__APPLE__ && TINYKEYS_NULL_BACKEND
