cmake_minimum_required(VERSION 3.16)
project(TinyKeys C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
# Expose POSIX/BSD symbols (clock_gettime, strdup, readlink, termios, ...).
set(CMAKE_C_EXTENSIONS ON)

include_directories(include)

# Headless backend for CI / machines without a windowing system.
option(TINYKEYS_NULL_BACKEND "Build with the no-input headless backend" OFF)

set(CORE_SOURCES
    src/main.c
    src/data_config.c
    src/audio_engine.c
    src/tui_renderer.c
    src/platform_common.c
)

if(APPLE)
    list(APPEND PLATFORM_SOURCES src/platform_mac.c)
elseif(TINYKEYS_NULL_BACKEND)
    list(APPEND PLATFORM_SOURCES src/platform_null.c)
    add_compile_definitions(TINYKEYS_NULL_BACKEND)
elseif(UNIX)
    list(APPEND PLATFORM_SOURCES src/platform_linux.c)
    add_compile_definitions(TINYKEYS_X11_BACKEND)
elseif(WIN32)
    message(FATAL_ERROR "Use the original upstream project for Windows builds.")
endif()

add_executable(tinykeys ${CORE_SOURCES} ${PLATFORM_SOURCES})

find_package(Threads REQUIRED)
target_link_libraries(tinykeys Threads::Threads m)

if(APPLE)
    # Our backend calls ApplicationServices (CGEventSourceKeyState) and Carbon
    # (UCKeyTranslate/TIS). miniaudio loads the audio frameworks at runtime, but
    # linking them explicitly is harmless and works with all configurations.
    target_link_libraries(tinykeys
        "-framework ApplicationServices"
        "-framework Carbon"
        "-framework CoreFoundation"
        "-framework CoreAudio"
        "-framework AudioToolbox"
        "-framework AudioUnit"
    )
elseif(UNIX AND NOT TINYKEYS_NULL_BACKEND)
    find_package(X11 REQUIRED)
    target_include_directories(tinykeys PRIVATE ${X11_INCLUDE_DIR})
    target_link_libraries(tinykeys ${X11_LIBRARIES} ${CMAKE_DL_LIBS})
else()
    target_link_libraries(tinykeys ${CMAKE_DL_LIBS})
endif()

# Optional unit tests:  cmake --build . --target run_tests
add_executable(tinykeys_tests
    tests/test_core.c
    src/data_config.c
    src/platform_common.c
    src/platform_null.c
)
target_compile_definitions(tinykeys_tests PRIVATE TINYKEYS_NULL_BACKEND)
target_link_libraries(tinykeys_tests Threads::Threads m)

enable_testing()
add_test(NAME core_tests COMMAND tinykeys_tests)
add_custom_target(run_tests COMMAND tinykeys_tests DEPENDS tinykeys_tests)
