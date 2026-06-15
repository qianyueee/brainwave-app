#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <math.h>

#include "../include/platform.h"
#include "../include/data_config.h"
#include "../include/audio_engine.h"
#include "../include/tui_renderer.h"

bool g_running = true;

#define SAVE_STATUS_NORMAL 0
#define SAVE_STATUS_CONFIRM 1
#define SAVE_STATUS_SAVED 2
#define SAVE_STATUS_SAVE_AS 3

static bool perform_preset_load(const char* preset_name) {
    begin_audio_fade_out();
    while (!is_audio_fade_out_complete()) {
        platform_sleep_ms(1);
    }

    if (!load_preset_with_name(preset_name)) {
        begin_audio_fade_in();
        return false;
    }

    update_synth_params();
    begin_audio_fade_in();
    save_last_state();
    return true;
}

static bool cycle_preset_with_fade(int direction) {
    if (g_preset_count <= 0) {
        return false;
    }

    int next_index = g_current_preset_index;
    if (next_index < 0) {
        next_index = direction >= 0 ? 0 : g_preset_count - 1;
    } else {
        next_index += direction;
        if (next_index < 0) next_index = g_preset_count - 1;
        if (next_index >= g_preset_count) next_index = 0;
    }

    return perform_preset_load(g_preset_files[next_index]);
}

static void begin_save_as_mode(void) {
    g_save_status = SAVE_STATUS_SAVE_AS;
    g_save_input[0] = '\0';
    g_save_input_len = 0;
    // Snapshot the keyboard so the Enter still held from Ctrl+Enter (or any
    // other key) is not interpreted as a fresh keystroke once typing starts.
    platform_text_input_reset();
}

static void append_save_input_char(char ch) {
    if (g_save_input_len >= MAX_PATH - 5) return;
    g_save_input[g_save_input_len++] = ch;
    g_save_input[g_save_input_len] = '\0';
}

// Translate freshly typed keys into the Save-As filename buffer. This replaces
// the original GetAsyncKeyState()/ToUnicode() scan; the platform backend now
// owns key-edge detection and keyboard-layout translation.
static void poll_save_as_input(void) {
    TkTextEvent ev;
    bool changed = false;
    while (platform_poll_text_event(&ev)) {
        switch (ev.type) {
            case TK_TEXT_BACKSPACE:
                if (g_save_input_len > 0) {
                    g_save_input[--g_save_input_len] = '\0';
                }
                changed = true;
                break;
            case TK_TEXT_ENTER: {
                char unique_name[MAX_PATH];
                if (!g_save_input[0]) {
                    snprintf(g_save_input, sizeof(g_save_input), "%s", "Preset");
                    g_save_input_len = (int)strlen(g_save_input);
                }
                if (make_unique_preset_name(g_save_input, unique_name, sizeof(unique_name)) && save_preset_with_name(unique_name)) {
                    save_last_state();
                    g_save_status = SAVE_STATUS_SAVED;
                    g_save_status_time = platform_now_ms();
                } else {
                    g_save_status = SAVE_STATUS_NORMAL;
                }
                changed = true;
                break;
            }
            case TK_TEXT_ESCAPE:
                g_save_status = SAVE_STATUS_NORMAL;
                changed = true;
                break;
            case TK_TEXT_CHAR:
                if ((unsigned char)ev.ch >= 32 && (unsigned char)ev.ch <= 126) {
                    append_save_input_char(ev.ch);
                    changed = true;
                }
                break;
            case TK_TEXT_CTRL_ENTER:
            case TK_TEXT_NONE:
                break;
        }
        if (g_save_status != SAVE_STATUS_SAVE_AS) {
            break; // committed or cancelled; stop consuming further text
        }
    }
    if (changed) {
        print_tui();
    }
}

static float clampf(float value, float min_value, float max_value) {
    if (value < min_value) return min_value;
    if (value > max_value) return max_value;
    return value;
}

static bool menu_option_needs_synth_update(MenuOption option) {
    switch (option) {
        case MENU_PRESET:
        case MENU_ATTACK:
        case MENU_DECAY:
        case MENU_SUSTAIN:
        case MENU_RELEASE:
        case MENU_FILTER_CUTOFF:
        case MENU_FILTER_Q:
        case MENU_VIB_SPEED:
        case MENU_VIB_DEPTH:
            return true;
        default:
            return false;
    }
}

static float adjust_logarithmic_value(float current, float min_value, float max_value, float normalized_step) {
    float safe_current = clampf(current, min_value, max_value);
    float log_min = logf(min_value);
    float log_max = logf(max_value);
    float t = (logf(safe_current) - log_min) / (log_max - log_min);
    t = clampf(t + normalized_step, 0.0f, 1.0f);
    return expf(log_min + (log_max - log_min) * t);
}

static void adjust_menu_option(MenuOption option, float delta_units) {
    ConfigEntry* entry = get_menu_config_entry(option);
    if (!entry) return;

    switch (option) {
        case MENU_SHOW_KEYBOARD:
        case MENU_VIB_MODE:
            *(bool*)entry->var_ptr = !(*(bool*)entry->var_ptr);
            break;
        case MENU_PRESET:
            cycle_preset_with_fade(delta_units > 0.0f ? 1 : -1);
            return;
        case MENU_WHEEL_ASSIGN: {
            int next_value = *(int*)entry->var_ptr + (delta_units > 0.0f ? 1 : -1);
            if (next_value < 0) next_value = g_wheel_assignment_option_count - 1;
            if (next_value >= g_wheel_assignment_option_count) next_value = 0;
            *(int*)entry->var_ptr = next_value;
            break;
        }
        case MENU_WHEEL_MODE: {
            int next_value = *(int*)entry->var_ptr + (delta_units > 0.0f ? 1 : -1);
            if (next_value < 0) next_value = WHEEL_MODE_COUNT - 1;
            if (next_value >= WHEEL_MODE_COUNT) next_value = 0;
            *(int*)entry->var_ptr = next_value;
            break;
        }
        case MENU_FILTER_CUTOFF: {
            float next_value = adjust_logarithmic_value(
                *(float*)entry->var_ptr,
                entry->min_value,
                entry->max_value,
                entry->step_value * delta_units
            );
            *(float*)entry->var_ptr = clampf(next_value, entry->min_value, entry->max_value);
            break;
        }
        default:
            switch (entry->type) {
                case CFG_INT: {
                    int step_delta = (int)lroundf(entry->step_value * delta_units);
                    int next_value = *(int*)entry->var_ptr + step_delta;
                    next_value = (int)clampf((float)next_value, entry->min_value, entry->max_value);
                    *(int*)entry->var_ptr = next_value;
                    break;
                }
                case CFG_FLOAT:
                case CFG_FLOAT_MS: {
                    float next_value = *(float*)entry->var_ptr + entry->step_value * delta_units;
                    *(float*)entry->var_ptr = clampf(next_value, entry->min_value, entry->max_value);
                    break;
                }
                case CFG_BOOL:
                    *(bool*)entry->var_ptr = !(*(bool*)entry->var_ptr);
                    break;
                case CFG_NOTE_STRING:
                    break;
                case CFG_STRING:
                    break;
            }
            break;
    }

    if (menu_option_needs_synth_update(option)) {
        update_synth_params();
    }
}

// Apply mouse-wheel gestures. Replaces the Win32 ReadConsoleInput() loop; the
// platform backend now reports accumulated wheel notches (terminal mouse
// reporting on macOS/Linux).
static void process_mouse_wheel(void) {
    int notches = platform_poll_wheel();
    if (notches == 0) {
        return;
    }

    MenuOption target_option = get_wheel_target_option();
    if (target_option == MENU_OPTION_COUNT) {
        target_option = get_current_menu_option();
    }
    if (target_option == MENU_OPTION_NONE) {
        return;
    }

    float wheel_steps = (float)notches * g_wheel_sense;
    if (g_wheel_mode == WHEEL_MODE_PAD) {
        wheel_steps = -wheel_steps;
    }
    if (wheel_steps != 0.0f) {
        adjust_menu_option(target_option, wheel_steps);
        print_tui();
    }
}

int main(int argc, char *argv[]) {
    // Headless self-test: exercise the platform-independent init path (preset
    // scan, config load, note map) and exit without touching audio hardware or
    // the input loop. Used by CI on machines with no audio device / display.
    bool selftest = false;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--selftest") == 0) selftest = true;
    }
    if (selftest) {
        scan_presets();
        load_config("config.ini");
        sync_current_preset_index();
        init_note_map();

        // Exercise the platform input backend once (no main loop). On macOS
        // this forces the real CGEventSourceKeyState / UCKeyTranslate / terminal
        // code paths to run and link, which is the part that cannot be verified
        // off-device. It is side-effect-free when stdin is not a TTY (CI).
        bool backend_ok = platform_init();
        if (backend_ok) {
            int any_down = 0;
            for (int k = 'A'; k <= 'Z'; k++) any_down |= platform_key_down(k);
            for (int k = '0'; k <= '9'; k++) any_down |= platform_key_down(k);
            any_down |= platform_key_down(TK_KEY_SPACE);
            any_down |= platform_key_down(TK_KEY_CTRL_ANY);
            any_down |= platform_key_down(TK_KEY_LSHIFT);
            any_down |= platform_key_down(TK_KEY_UP);
            platform_text_input_reset();
            TkTextEvent ev;
            int drained = 0;
            while (platform_poll_text_event(&ev) && drained < 64) drained++;
            (void)platform_poll_wheel();
            unsigned long t0 = platform_now_ms();
            platform_sleep_ms(2);
            unsigned long dt = platform_now_ms() - t0;
            platform_shutdown();
            printf("TinyKeys self-test: input backend OK (keys polled, sleep=%lums).\n", dt);
        } else {
            printf("TinyKeys self-test: input backend unavailable (expected on headless/no-display).\n");
        }

        printf("TinyKeys self-test OK: presets=%d, exe-relative config resolved, note map initialised.\n",
               g_preset_count);
        free_presets();
        return 0;
    }

    // Initialise terminal (raw/no-echo + mouse reporting) and input backend.
    // Replaces SetConsoleMode()/SetConsoleOutputCP() setup on Windows.
    if (!platform_init()) {
        fprintf(stderr, "Failed to initialise input/terminal backend.\n");
        return 1;
    }

    scan_presets();
    load_config("config.ini");
    sync_current_preset_index();

    // 2. Parse command line arguments for specific config
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--config") == 0 && i+1 < argc) {
            perform_preset_load(argv[++i]);
        }
    }

    // 3. Parse command line parameter overrides
    for (int i = 1; i < argc; i++) {
        if (strncmp(argv[i], "row0=", 5) == 0) row_starts[0] = parse_note(argv[i]+5);
        else if (strncmp(argv[i], "row1=", 5) == 0) row_starts[1] = parse_note(argv[i]+5);
        else if (strncmp(argv[i], "row2=", 5) == 0) row_starts[2] = parse_note(argv[i]+5);
        else if (strncmp(argv[i], "row3=", 5) == 0) row_starts[3] = parse_note(argv[i]+5);
    }
    init_note_map();

    if (!init_audio_engine()) {
        platform_shutdown();
        return 1;
    }

    // Clear screen for TUI
    printf("\033[2J");
    print_tui();

    // Request high timer resolution for low-latency sleeps (timeBeginPeriod).
    platform_timer_begin();

    // Main loop
    unsigned long last_render_time = platform_now_ms();
    const unsigned long render_interval_ms = 1000 / 60; // 60Hz refresh rate

    while (g_running) {
        if (platform_key_down(TK_KEY_ESCAPE)) {
            if (g_save_status == SAVE_STATUS_CONFIRM || g_save_status == SAVE_STATUS_SAVE_AS) {
                g_save_status = SAVE_STATUS_NORMAL;
                print_tui();
                platform_sleep_ms(200); // debounce
                continue;
            } else {
                g_running = false;
                break;
            }
        }

        unsigned long current_time = platform_now_ms();
        process_mouse_wheel();
        if (g_save_status == SAVE_STATUS_SAVE_AS) {
            poll_save_as_input();
        }

        // Save preset handling
        bool is_ctrl = platform_key_down(TK_KEY_CTRL_ANY);
        bool is_s = platform_key_down('S');
        bool is_enter = platform_key_down(TK_KEY_RETURN);
        static bool s_prev = false;
        static bool enter_prev = false;

        if (g_save_status == SAVE_STATUS_CONFIRM) {
            if (is_ctrl && is_enter && !enter_prev) {
                begin_save_as_mode();
                print_tui();
            } else if (is_enter && !enter_prev) {
                if (!g_current_preset[0]) {
                    save_preset_with_name("Default.tkp");
                } else {
                    save_preset_with_name(g_current_preset);
                }
                save_last_state();
                g_save_status = SAVE_STATUS_SAVED;
                g_save_status_time = current_time;
                print_tui();
                platform_sleep_ms(200); // debounce
            }
        } else if (g_save_status == SAVE_STATUS_NORMAL || g_save_status == SAVE_STATUS_SAVED) {
            if (is_ctrl && is_s && !s_prev) {
                g_save_status = SAVE_STATUS_CONFIRM;
                print_tui();
            }
        }
        s_prev = is_s;
        enter_prev = is_enter;

        if (g_save_status == SAVE_STATUS_SAVED && current_time - g_save_status_time > 2000) {
            g_save_status = SAVE_STATUS_NORMAL;
            print_tui();
        }

        // Menu control
        if (g_save_status == SAVE_STATUS_NORMAL || g_save_status == SAVE_STATUS_SAVED) {
            bool is_up = platform_key_down(TK_KEY_UP);
            bool is_down = platform_key_down(TK_KEY_DOWN);
            bool is_left = platform_key_down(TK_KEY_LEFT);
            bool is_right = platform_key_down(TK_KEY_RIGHT);
            bool is_ctrl_nav = platform_key_down(TK_KEY_CTRL_ANY);

            static int left_held = 0;
            static int right_held = 0;
            static int up_held = 0;
            static int down_held = 0;

            if (is_left) left_held++; else left_held = 0;
            if (is_right) right_held++; else right_held = 0;
            if (is_up) up_held++; else up_held = 0;
            if (is_down) down_held++; else down_held = 0;

            bool trigger_left = (left_held == 1) || (left_held > 400 && left_held % 30 == 0);
            bool trigger_right = (right_held == 1) || (right_held > 400 && right_held % 30 == 0);
            bool trigger_up = (up_held == 1) || (up_held > 400 && up_held % 30 == 0);
            bool trigger_down = (down_held == 1) || (down_held > 400 && down_held % 30 == 0);
            bool menu_changed = false;
            if (trigger_left) {
                g_current_col--;
                if (g_current_col < 0) {
                    g_current_col = g_menu_layout[g_current_row].item_count - 1;
                }
                menu_changed = true;
            }
            if (trigger_right) {
                g_current_col++;
                if (g_current_col >= g_menu_layout[g_current_row].item_count) {
                    g_current_col = 0;
                }
                menu_changed = true;
            }

            if (trigger_up) {
                if (is_ctrl_nav) {
                    adjust_menu_option(get_current_menu_option(), 1.0f);
                } else {
                    g_current_row--;
                    if (g_current_row < 0) g_current_row = g_menu_layout_size - 1;
                    if (g_current_col >= g_menu_layout[g_current_row].item_count) {
                        g_current_col = g_menu_layout[g_current_row].item_count - 1;
                    }
                }
                menu_changed = true;
            }
            if (trigger_down) {
                if (is_ctrl_nav) {
                    adjust_menu_option(get_current_menu_option(), -1.0f);
                } else {
                    g_current_row++;
                    if (g_current_row >= g_menu_layout_size) g_current_row = 0;
                    if (g_current_col >= g_menu_layout[g_current_row].item_count) {
                        g_current_col = g_menu_layout[g_current_row].item_count - 1;
                    }
                }
                menu_changed = true;
            }

            if (menu_changed) {
                print_tui();
            }
        } // End of Menu control if block

        static bool g_space_prev = false;
        bool is_space = platform_key_down(TK_KEY_SPACE);
        if (g_vib_mode == 0) { // Unlatch
            g_vib_enabled = is_space;
        } else { // Latch
            if (is_space && !g_space_prev) {
                g_vib_enabled = !g_vib_enabled;
            }
        }
        g_space_prev = is_space;

        static bool g_lshift_prev = false;
        bool is_lshift = platform_key_down(TK_KEY_LSHIFT);
        if (is_lshift && !g_lshift_prev) {
            g_trem_enabled = !g_trem_enabled;
        }
        g_lshift_prev = is_lshift;

        static bool g_lalt_prev = false;
        bool is_lalt = platform_key_down(TK_KEY_LALT);
        if (is_lalt && !g_lalt_prev) {
            g_delay_enabled = !g_delay_enabled;
        }
        g_lalt_prev = is_lalt;

        for (int r = 0; r < 4; r++) {
            for (int c = 0; c < num_keys[r]; c++) {
                bool is_down = platform_key_down(vk_map[r][c]);

                if (is_down && !key_state[r][c]) {
                    key_state[r][c] = true;

                    int actual_note = note_map[r][c] + g_semitone + (g_octave * 12);
                    if (actual_note < 0) actual_note = 0;
                    if (actual_note > 127) actual_note = 127;
                    active_notes[r][c] = actual_note;

                    note_on(actual_note);

                } else if (!is_down && key_state[r][c]) {
                    key_state[r][c] = false;

                    if (active_notes[r][c] != -1) {
                        note_off(active_notes[r][c]);
                        active_notes[r][c] = -1;
                    }
                }
            }
        }

        if (current_time - last_render_time >= render_interval_ms) {
            // Update Rise
            if (g_vib_enabled) {
                if (g_rise_time > 0.001f) {
                    g_current_fade += (render_interval_ms / 1000.0f) / g_rise_time;
                    if (g_current_fade > 1.0f) g_current_fade = 1.0f;
                } else {
                    g_current_fade = 1.0f;
                }
            } else {
                g_current_fade -= (render_interval_ms / 1000.0f) / 0.1f; // Quick 100ms fade out to avoid clicks
                if (g_current_fade < 0.0f) g_current_fade = 0.0f;
            }
            update_synth_params(); // Apply dynamic depth

            print_tui();
            last_render_time = current_time;
        }

        platform_sleep_ms(1); // 1ms sleep for low latency input polling
    }

    platform_timer_end();

    // Show cursor and restore terminal/input state before exit
    printf("\033[?25h\n");
    save_last_state();
    free_presets();

    cleanup_audio_engine();
    platform_shutdown();

    return 0;
}
