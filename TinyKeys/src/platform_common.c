// ---------------------------------------------------------------------------
// platform_common.c
//
// POSIX implementations shared by every input backend (macOS, Linux, null):
//   * monotonic millisecond clock + sleep          (timeGetTime / Sleep)
//   * raw terminal mode + xterm mouse reporting     (SetConsoleMode)
//   * scroll-wheel parsing from the terminal stdin  (ReadConsoleInput)
//
// These behave identically on macOS and Linux because both rely on a VT100/
// xterm-compatible terminal (Terminal.app, iTerm2, most Linux terminals).
// ---------------------------------------------------------------------------

#include "../include/platform.h"
#include "platform_internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <fcntl.h>
#include <signal.h>
#include <termios.h>

// --- Timing ----------------------------------------------------------------

unsigned long platform_now_ms(void) {
    struct timespec ts;
#if defined(CLOCK_MONOTONIC)
    clock_gettime(CLOCK_MONOTONIC, &ts);
#else
    clock_gettime(CLOCK_REALTIME, &ts);
#endif
    return (unsigned long)(ts.tv_sec * 1000UL + ts.tv_nsec / 1000000UL);
}

void platform_sleep_ms(unsigned int ms) {
    struct timespec req;
    req.tv_sec = ms / 1000;
    req.tv_nsec = (long)(ms % 1000) * 1000000L;
    // Resume across signal interruptions to honour the full requested delay.
    while (nanosleep(&req, &req) == -1) {
        // EINTR -> req holds the remaining time; loop. Anything else: give up.
        // (errno not strictly needed; remaining time is already in req.)
        continue;
    }
}

void platform_timer_begin(void) { /* POSIX nanosleep is already fine-grained */ }
void platform_timer_end(void)   { /* no-op */ }

// --- Terminal raw mode + mouse reporting -----------------------------------

static struct termios g_saved_termios;
static bool g_termios_saved = false;
static int g_saved_stdin_flags = 0;
static bool g_stdin_flags_saved = false;
static bool g_mouse_enabled = false;

static void tk_terminal_restore_raw(void) {
    if (g_mouse_enabled) {
        // Disable SGR + normal mouse tracking.
        const char* off = "\033[?1006l\033[?1000l";
        ssize_t r = write(STDOUT_FILENO, off, strlen(off));
        (void)r;
        g_mouse_enabled = false;
    }
    if (g_termios_saved) {
        tcsetattr(STDIN_FILENO, TCSANOW, &g_saved_termios);
        g_termios_saved = false;
    }
    if (g_stdin_flags_saved) {
        fcntl(STDIN_FILENO, F_SETFL, g_saved_stdin_flags);
        g_stdin_flags_saved = false;
    }
}

static void tk_signal_handler(int sig) {
    // Restore the terminal so the shell is usable after Ctrl+C / kill, then
    // re-raise with the default handler to get the conventional exit status.
    tk_terminal_restore_raw();
    // Show cursor again.
    const char* show = "\033[?25h\n";
    ssize_t r = write(STDOUT_FILENO, show, strlen(show));
    (void)r;
    signal(sig, SIG_DFL);
    raise(sig);
}

void tk_terminal_begin(void) {
    if (!isatty(STDIN_FILENO)) {
        return; // Headless / piped: nothing to configure.
    }

    if (tcgetattr(STDIN_FILENO, &g_saved_termios) == 0) {
        g_termios_saved = true;
        struct termios raw = g_saved_termios;
        // Disable canonical mode, echo, signal generation and software flow
        // control. IXON must be off or Ctrl+S (Save) would freeze output.
        raw.c_lflag &= ~(ICANON | ECHO | ISIG | IEXTEN);
        raw.c_iflag &= ~(IXON | ICRNL | INLCR);
        raw.c_cc[VMIN] = 0;
        raw.c_cc[VTIME] = 0;
        tcsetattr(STDIN_FILENO, TCSANOW, &raw);
    }

    g_saved_stdin_flags = fcntl(STDIN_FILENO, F_GETFL, 0);
    if (g_saved_stdin_flags != -1) {
        g_stdin_flags_saved = true;
        fcntl(STDIN_FILENO, F_SETFL, g_saved_stdin_flags | O_NONBLOCK);
    }

    // Enable normal mouse tracking + SGR extended coordinates.
    const char* on = "\033[?1000h\033[?1006h";
    ssize_t r = write(STDOUT_FILENO, on, strlen(on));
    (void)r;
    g_mouse_enabled = true;

    atexit(tk_terminal_restore_raw);
    signal(SIGINT, tk_signal_handler);
    signal(SIGTERM, tk_signal_handler);
}

void tk_terminal_end(void) {
    tk_terminal_restore_raw();
}

// --- Scroll wheel ----------------------------------------------------------
//
// Reads pending bytes from stdin and extracts SGR mouse wheel events of the
// form: ESC '[' '<' Cb ';' Cx ';' Cy ('M'|'m'). Wheel-up has button code 64,
// wheel-down 65 (modifier bits may be OR'd into the upper nibble; bit 0 always
// distinguishes the direction). Stray bytes from played keys are discarded so
// the stdin buffer never backs up.

static int g_pending_notches = 0;

static int decode_sgr_buffer(const char* buf, int len) {
    int notches = 0;
    int i = 0;
    while (i < len) {
        // Look for the start of an SGR mouse sequence: ESC '[' '<'
        if (buf[i] == '\033' && i + 2 < len && buf[i + 1] == '[' && buf[i + 2] == '<') {
            int j = i + 3;
            int cb = 0;
            bool have_cb = false;
            while (j < len && buf[j] >= '0' && buf[j] <= '9') {
                cb = cb * 10 + (buf[j] - '0');
                have_cb = true;
                j++;
            }
            // Skip ';' Cx ';' Cy up to the terminating 'M' or 'm'.
            while (j < len && buf[j] != 'M' && buf[j] != 'm') {
                j++;
            }
            if (j < len && (buf[j] == 'M' || buf[j] == 'm') && have_cb) {
                if (cb & 64) { // wheel event
                    notches += (cb & 1) ? -1 : 1; // even = up (+), odd = down (-)
                }
                i = j + 1;
                continue;
            }
            // Incomplete sequence: stop and let the next poll pick it up.
            break;
        }
        i++; // discard non-mouse byte (e.g. played keystrokes, arrow escapes)
    }
    return notches;
}

int platform_poll_wheel(void) {
    char buf[512];
    ssize_t n;
    while ((n = read(STDIN_FILENO, buf, sizeof(buf))) > 0) {
        g_pending_notches += decode_sgr_buffer(buf, (int)n);
        if (n < (ssize_t)sizeof(buf)) {
            break;
        }
    }
    int result = g_pending_notches;
    g_pending_notches = 0;
    return result;
}
