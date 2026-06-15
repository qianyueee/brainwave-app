#ifndef TINYKEYS_PLATFORM_INTERNAL_H
#define TINYKEYS_PLATFORM_INTERNAL_H

#include <stdbool.h>

// Shared POSIX-terminal helpers implemented in platform_common.c and used by
// the macOS and Linux input backends. Not part of the public platform API.

// Put the controlling terminal into raw, no-echo mode and enable xterm mouse
// reporting (SGR 1006) so the scroll wheel can be read from stdin. Safe to call
// when stdin is not a TTY (it becomes a no-op). Always paired with
// tk_terminal_end().
void tk_terminal_begin(void);
void tk_terminal_end(void);

#endif // TINYKEYS_PLATFORM_INTERNAL_H
