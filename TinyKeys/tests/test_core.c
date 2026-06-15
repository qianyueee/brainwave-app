// ---------------------------------------------------------------------------
// test_core.c — unit tests for the platform-independent core of TinyKeys.
//
// Exercises note parsing, the isomorphic note map, config persistence and
// preset-name handling. These cover the logic most at risk during the Windows
// -> macOS port (string/path handling, filesystem access, registry I/O) and
// run on any POSIX host via the headless backend.
// ---------------------------------------------------------------------------

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#include "../include/data_config.h"

static int g_failures = 0;
static int g_checks = 0;

#define CHECK(cond, ...) do {                       \
    g_checks++;                                      \
    if (!(cond)) {                                   \
        g_failures++;                                \
        printf("  FAIL: ");                          \
        printf(__VA_ARGS__);                         \
        printf("  (%s:%d)\n", __FILE__, __LINE__);   \
    }                                                \
} while (0)

static void test_parse_note(void) {
    printf("test_parse_note\n");
    CHECK(parse_note("C4") == 60, "C4 should be MIDI 60, got %d", parse_note("C4"));
    CHECK(parse_note("A1") == 33, "A1 should be 33, got %d", parse_note("A1"));
    CHECK(parse_note("D2") == 38, "D2 should be 38, got %d", parse_note("D2"));
    CHECK(parse_note("G2") == 43, "G2 should be 43, got %d", parse_note("G2"));
    CHECK(parse_note("C3") == 48, "C3 should be 48, got %d", parse_note("C3"));
    CHECK(parse_note("C#4") == 61, "C#4 should be 61, got %d", parse_note("C#4"));
    CHECK(parse_note("c4") == 60, "lowercase c4 should parse to 60, got %d", parse_note("c4"));
    CHECK(parse_note("X9") == -1, "invalid note should be -1, got %d", parse_note("X9"));
    CHECK(parse_note("Z") == -1, "too-short note should be -1, got %d", parse_note("Z"));
}

static void test_note_string_roundtrip(void) {
    printf("test_note_string_roundtrip\n");
    char buf[16];
    get_note_string(60, buf);
    CHECK(strcmp(buf, "C4") == 0, "MIDI 60 should be C4, got %s", buf);
    get_note_string(33, buf);
    CHECK(strcmp(buf, "A1") == 0, "MIDI 33 should be A1, got %s", buf);
    get_note_string(69, buf);
    CHECK(strcmp(buf, "A4") == 0, "MIDI 69 should be A4, got %s", buf);

    for (int n = 12; n <= 120; n++) {
        get_note_string(n, buf);
        int back = parse_note(buf);
        CHECK(back == n, "roundtrip failed for %d -> %s -> %d", n, buf, back);
    }
}

static void test_note_map_isomorphic(void) {
    printf("test_note_map_isomorphic\n");
    // Default row starts from config: A1, D2, G2, C3 -> a perfect-4th (5
    // semitone) interval between vertically adjacent rows.
    row_starts[0] = parse_note("A1");
    row_starts[1] = parse_note("D2");
    row_starts[2] = parse_note("G2");
    row_starts[3] = parse_note("C3");
    init_note_map();

    for (int r = 0; r < 4; r++) {
        for (int c = 0; c < num_keys[r]; c++) {
            CHECK(note_map[r][c] == row_starts[r] + c,
                  "note_map[%d][%d] should be %d, got %d",
                  r, c, row_starts[r] + c, note_map[r][c]);
            CHECK(active_notes[r][c] == -1,
                  "active_notes[%d][%d] should init to -1", r, c);
        }
    }
    // Same-row adjacency = 1 semitone; vertical adjacency = 5 semitones.
    CHECK(note_map[0][1] - note_map[0][0] == 1, "horizontal interval should be 1 semitone");
    CHECK(note_map[1][0] - note_map[0][0] == 5, "vertical interval should be a perfect 4th (5)");
}

static void test_config_roundtrip(void) {
    printf("test_config_roundtrip\n");
    const char* path = "test_roundtrip.tkp";

    // Set distinctive values across the type spectrum.
    g_octave = 3;
    g_semitone = -5;
    g_gain = 1.25f;
    g_sustain = 0.4f;
    g_release_time = 0.1f;       // CFG_FLOAT_MS -> stored as 100 ms
    g_filter_cutoff_hz = 8000.0f;
    g_show_keyboard = false;
    g_trem_enabled = true;
    g_delay_mix = 35;
    row_starts[0] = parse_note("A1");
    snprintf(g_current_preset, sizeof(g_current_preset), "%s", "MyPreset.tkp");

    CHECK(save_config(path), "save_config should succeed");

    // Clobber, then reload.
    g_octave = 0; g_semitone = 0; g_gain = 0.0f; g_sustain = 0.0f;
    g_release_time = 0.0f; g_filter_cutoff_hz = 0.0f; g_show_keyboard = true;
    g_trem_enabled = false; g_delay_mix = 0; row_starts[0] = 0;
    g_current_preset[0] = '\0';

    CHECK(load_config(path), "load_config should succeed");

    CHECK(g_octave == 3, "octave should restore to 3, got %d", g_octave);
    CHECK(g_semitone == -5, "semitone should restore to -5, got %d", g_semitone);
    CHECK(g_gain > 1.24f && g_gain < 1.26f, "gain should restore to ~1.25, got %f", g_gain);
    CHECK(g_sustain > 0.39f && g_sustain < 0.41f, "sustain should restore to ~0.4, got %f", g_sustain);
    CHECK(g_release_time > 0.09f && g_release_time < 0.11f,
          "release_time should restore to ~0.1s via ms conversion, got %f", g_release_time);
    CHECK(g_filter_cutoff_hz > 7999.0f && g_filter_cutoff_hz < 8001.0f,
          "filter cutoff should restore to ~8000, got %f", g_filter_cutoff_hz);
    CHECK(g_show_keyboard == false, "show_keyboard should restore to false");
    CHECK(g_trem_enabled == true, "trem_enabled should restore to true");
    CHECK(g_delay_mix == 35, "delay_mix should restore to 35, got %d", g_delay_mix);
    CHECK(row_starts[0] == parse_note("A1"), "row0_start should restore to A1");
    CHECK(strcmp(g_current_preset, "MyPreset.tkp") == 0,
          "current_preset should restore, got %s", g_current_preset);

    remove(path);
}

static void test_load_missing_config(void) {
    printf("test_load_missing_config\n");
    CHECK(load_config("definitely_not_here_12345.tkp") == false,
          "loading a missing config should return false");
}

static void test_preset_name_normalization(void) {
    printf("test_preset_name_normalization\n");
    char out[MAX_PATH];
    // Base name without extension should gain .tkp and be unique.
    bool ok = make_unique_preset_name("UnitTestPreset", out, sizeof(out));
    CHECK(ok, "make_unique_preset_name should succeed");
    size_t len = strlen(out);
    CHECK(len >= 4 && strcmp(out + len - 4, ".tkp") == 0,
          "unique name should end in .tkp, got %s", out);

    // Name already carrying the extension should be preserved (not doubled).
    ok = make_unique_preset_name("Another.tkp", out, sizeof(out));
    CHECK(ok, "make_unique_preset_name should succeed for .tkp input");
    CHECK(strstr(out, ".tkp.tkp") == NULL, "extension should not be doubled, got %s", out);
}

int main(void) {
    printf("=== TinyKeys core unit tests ===\n");
    test_parse_note();
    test_note_string_roundtrip();
    test_note_map_isomorphic();
    test_config_roundtrip();
    test_load_missing_config();
    test_preset_name_normalization();

    printf("\n%d checks, %d failures\n", g_checks, g_failures);
    if (g_failures == 0) {
        printf("ALL TESTS PASSED\n");
        return 0;
    }
    printf("TESTS FAILED\n");
    return 1;
}
