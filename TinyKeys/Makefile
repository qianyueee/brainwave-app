# TinyKeys — cross-platform Makefile (macOS primary, Linux/X11 bonus).
#
#   make            Build ./tinykeys for the host OS
#   make BACKEND=null   Build a headless binary (no input devices; for CI)
#   make test       Build and run the unit-test harness
#   make clean      Remove build artifacts
#
# macOS:  links ApplicationServices + Carbon (key polling + text translation);
#         the audio frameworks are loaded at runtime by miniaudio.
# Linux:  links X11 for global key polling (requires $DISPLAY at runtime).

UNAME_S := $(shell uname -s)
CC      ?= cc
OPT     ?= -O2
# gnu11 (vs strict c11) exposes the POSIX/BSD functions used by the platform
# layer (clock_gettime, nanosleep, strdup, readlink, termios) on both
# clang/macOS and gcc/Linux without per-symbol feature-test macros.
STD     := -std=gnu11
INC     := -Iinclude
WARN    := -Wall -Wextra
CFLAGS  ?= $(OPT) $(STD)
CFLAGS  += $(INC)

BUILDDIR := build
TARGET   := tinykeys

COMMON_SRC := src/main.c src/data_config.c src/tui_renderer.c src/platform_common.c
ENGINE_SRC := src/audio_engine.c

ifeq ($(UNAME_S),Darwin)
    PLATFORM_SRC := src/platform_mac.c
    EXTRA_DEFS   :=
    LDLIBS       := -framework ApplicationServices -framework Carbon \
                    -framework CoreFoundation -framework CoreAudio \
                    -framework AudioToolbox -framework AudioUnit \
                    -lpthread -lm
else
    BACKEND ?= x11
    ifeq ($(BACKEND),null)
        PLATFORM_SRC := src/platform_null.c
        EXTRA_DEFS   := -DTINYKEYS_NULL_BACKEND
        LDLIBS       := -lpthread -lm -ldl
    else
        PLATFORM_SRC := src/platform_linux.c
        EXTRA_DEFS   := -DTINYKEYS_X11_BACKEND
        LDLIBS       := -lX11 -lpthread -lm -ldl
    endif
endif

OUR_SRC  := $(COMMON_SRC) $(PLATFORM_SRC)
OUR_OBJ  := $(patsubst src/%.c,$(BUILDDIR)/%.o,$(OUR_SRC))
ENGINE_OBJ := $(patsubst src/%.c,$(BUILDDIR)/%.o,$(ENGINE_SRC))
ALL_OBJ  := $(OUR_OBJ) $(ENGINE_OBJ)

.PHONY: all clean test
all: $(TARGET)

$(TARGET): $(ALL_OBJ)
	$(CC) $(ALL_OBJ) -o $@ $(LDLIBS)

# Our sources: full warnings.
$(OUR_OBJ): $(BUILDDIR)/%.o: src/%.c | $(BUILDDIR)
	$(CC) $(CFLAGS) $(EXTRA_DEFS) $(WARN) -c $< -o $@

# Engine TU pulls in miniaudio + TSF (single-header libraries); skip -Wextra
# noise from third-party code but keep optimisation/standard flags.
$(ENGINE_OBJ): $(BUILDDIR)/%.o: src/%.c | $(BUILDDIR)
	$(CC) $(CFLAGS) $(EXTRA_DEFS) -c $< -o $@

$(BUILDDIR):
	mkdir -p $(BUILDDIR)

# Unit tests — pure logic (note parsing, config round-trip, preset naming),
# linked against the headless backend so they run anywhere.
test: $(BUILDDIR)
	$(CC) $(CFLAGS) -DTINYKEYS_NULL_BACKEND $(WARN) \
		tests/test_core.c src/data_config.c src/platform_null.c src/platform_common.c \
		-o $(BUILDDIR)/test_core -lpthread -lm
	$(BUILDDIR)/test_core

clean:
	rm -rf $(BUILDDIR) $(TARGET)
