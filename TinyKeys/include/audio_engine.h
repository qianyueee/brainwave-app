#ifndef AUDIO_ENGINE_H
#define AUDIO_ENGINE_H

#include <stdbool.h>
#include <pthread.h> // CRITICAL_SECTION -> pthread_mutex_t
#include "../thirdparty/tsf.h"
#include "../thirdparty/miniaudio_io.h"

extern tsf* g_TinySoundFont;
extern pthread_mutex_t g_audio_mutex;

bool init_audio_engine(void);
void cleanup_audio_engine(void);
void update_synth_params(void);
void begin_audio_fade_out(void);
bool is_audio_fade_out_complete(void);
void begin_audio_fade_in(void);

// Note control functions
void note_on(int actual_note);
void note_off(int actual_note);

#endif // AUDIO_ENGINE_H
