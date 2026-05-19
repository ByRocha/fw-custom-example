#!/usr/bin/env bash
set -euo pipefail

# Called by rusefi_config.mk via CUSTOM_GEN_CONFIG, from ext/rusefi/firmware.
# It lets ConfigDefinition generate the board .ini first, then translates that
# exact file before gen_image_board.sh embeds it in the USB MSD ramdisk headers.

BOARD_DIR_ARG="${BOARD_DIR:-}"
SHORT_NAME="${SHORT_BOARD_NAME:-}"
if [ -z "$BOARD_DIR_ARG" ] || [ -z "$SHORT_NAME" ]; then
  echo "gen_config_translated.sh: BOARD_DIR and SHORT_BOARD_NAME are required" >&2
  exit 1
fi

BOARD_ROOT=$(realpath "$BOARD_DIR_ARG")
FIRMWARE_ROOT=$(pwd)
if [ ! -f "$FIRMWARE_ROOT/gen_config_board.sh" ]; then
  FIRMWARE_ROOT=$(realpath "$(dirname "$0")/..")
fi
INI_NAME="rusefi_${SHORT_NAME}.ini"

cd "$FIRMWARE_ROOT"
bash gen_config_board.sh "$BOARD_DIR_ARG" "$SHORT_NAME" "$INI_NAME"

INI_PATH="${META_OUTPUT_ROOT_FOLDER:-}tunerstudio/generated/${INI_NAME}"
TRANSLATOR="$FIRMWARE_ROOT/scripts/translate-ini.mjs"
MAP_FILE="$FIRMWARE_ROOT/scripts/translations.json"
if [ ! -f "$TRANSLATOR" ]; then TRANSLATOR="$BOARD_ROOT/scripts/translate-ini.mjs"; fi
if [ ! -f "$MAP_FILE" ]; then MAP_FILE="$BOARD_ROOT/scripts/translations.json"; fi

if [ -f "$INI_PATH" ] && [ -f "$TRANSLATOR" ] && [ -f "$MAP_FILE" ]; then
  node "$TRANSLATOR" "$INI_PATH" "$MAP_FILE" "$INI_PATH"
  echo "gen_config_translated.sh: translated generated MSD .ini at $INI_PATH"
else
  echo "gen_config_translated.sh: translation skipped; missing $INI_PATH, $TRANSLATOR or $MAP_FILE" >&2
fi

# CUSTOM_GEN_CONFIG replaces rusEFI's default gen_config.sh branch, which normally
# calls bin/gen_image_board.sh after generating the .ini. Do it here too, otherwise
# make can compile stale/default MSD headers even while the generated .ini is fresh.
if [ -f "$FIRMWARE_ROOT/bin/gen_image_board.sh" ]; then
  rm -f .ramdisk-sentinel hw_layer/mass_storage/ramdisk_image.h hw_layer/mass_storage/ramdisk_image_compressed.h
  bash bin/gen_image_board.sh "$BOARD_DIR_ARG" "$SHORT_NAME" "$INI_NAME"
  echo "gen_config_translated.sh: regenerated USB MSD image headers with custom ramdisk files"
else
  echo "gen_config_translated.sh: bin/gen_image_board.sh missing; MSD image not regenerated" >&2
fi
