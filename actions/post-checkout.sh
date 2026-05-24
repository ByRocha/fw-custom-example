#!/usr/bin/env bash
set -e
shopt -s nullglob

FW=ext/rusefi/firmware
[ -d "$FW" ] || exit 0

mkdir -p "$FW/hw_layer/mass_storage/filesystem_contents" "$FW/hw_layer/mass_storage/custom_extra"
cp -f ramdisk/* "$FW/hw_layer/mass_storage/custom_extra/" 2>/dev/null || true

if [ -f ramdisk/LEIA-ME.TXT ]; then
  cp -f ramdisk/LEIA-ME.TXT "$FW/hw_layer/mass_storage/filesystem_contents/README.template.txt"
  cp -f ramdisk/LEIA-ME.TXT "$FW/hw_layer/mass_storage/filesystem_contents/README.nozip.template.txt"
fi

EXTRA_DIR="$(pwd)/$FW/hw_layer/mass_storage/custom_extra"
if [ -n "\${GITHUB_ENV:-}" ]; then
  echo "EXTRA_FILES_TO_COPY_ON_IMAGE_FOLDER=$EXTRA_DIR" >> "$GITHUB_ENV"
fi

cat > "$FW/hw_layer/mass_storage/create_image.sh" <<'CUSTOM_IMAGE_SH'
#!/bin/bash
set -e
H_OUTPUT=$1
FS_SIZE=$2
COMPRESS_IMAGE=$3
shift 3
IMAGE=ramdisk.image
PATH="$PATH:/usr/sbin"
LABEL="${MSD_VOLUME_LABEL:-CUSTOM}"
LABEL="$(printf '%s' "$LABEL" | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z0-9_' | cut -c1-11)"
[ -n "$LABEL" ] || LABEL=CUSTOM
rm -f "$IMAGE" "$IMAGE.gz"
dd if=/dev/zero of="$IMAGE" bs=1024 count="$FS_SIZE"
mkfs.fat -v -r 64 "$IMAGE"
fatlabel "$IMAGE" "$LABEL"
for file in "$@"; do
  [ -f "$file" ] || { echo "Missing MSD file: $file"; exit 1; }
  mcopy -o -i "$IMAGE" "$file" ::
done
mkdir -p build
cp -f "$IMAGE" "build/$(basename "$H_OUTPUT" .h).img"
if [ "$(printf '%s' "$COMPRESS_IMAGE" | tr '[:upper:]' '[:lower:]')" = "true" ]; then
  gzip "$IMAGE"
  IMAGE_TO_OUTPUT="$IMAGE.gz"
else
  IMAGE_TO_OUTPUT="$IMAGE"
fi
xxd -i "$IMAGE_TO_OUTPUT" | cat <(echo -n "static const ") - > "$H_OUTPUT"
rm -f "$IMAGE_TO_OUTPUT"
CUSTOM_IMAGE_SH
chmod +x "$FW/hw_layer/mass_storage/create_image.sh"

cat > "$FW/hw_layer/mass_storage/create_ini_image.sh" <<'CUSTOM_MSD_SH'
#!/bin/bash
set -e
FULL_INI=$1
H_OUTPUT=$2
FS_SIZE=$3
SHORT_BOARD_NAME=$4
BOARD_SPECIFIC_URL=$5
PATH="$PATH:/usr/sbin"
CUSTOM_DIR="${EXTRA_FILES_TO_COPY_ON_IMAGE_FOLDER:-hw_layer/mass_storage/custom_extra}"
README_FILE_PATH="$CUSTOM_DIR/LEIA-ME.TXT"
[ -f "$README_FILE_PATH" ] || README_FILE_PATH=hw_layer/mass_storage/filesystem_contents/README.template.txt
ZIP7=rusefi.ini.7z
rm -f "$ZIP7" ramdisk.image ramdisk.image.gz
7z a -mx9 "$ZIP7" "$(pwd)/$FULL_INI"
INI_FILE="$ZIP7"
if [ "${RAMDISK_COMPRESSED:-}" = "no" ] || [ "${EFI_USE_COMPRESSED_INI:-}" = "FALSE" ]; then
  INI_FILE="$FULL_INI"
fi
EXTRA_FILES_TO_COPY_ON_IMAGE=()
if [ -d "$CUSTOM_DIR" ]; then
  for file in "$CUSTOM_DIR"/*; do
    [ -f "$file" ] || continue
    [ "$(basename "$file")" = "LEIA-ME.TXT" ] && continue
    EXTRA_FILES_TO_COPY_ON_IMAGE+=("$file")
  done
fi
echo "Custom MSD root files: $INI_FILE $README_FILE_PATH ${EXTRA_FILES_TO_COPY_ON_IMAGE[*]}"
hw_layer/mass_storage/create_image.sh "$H_OUTPUT" "$FS_SIZE" false "$INI_FILE" "$README_FILE_PATH" "${EXTRA_FILES_TO_COPY_ON_IMAGE[@]}"
rm -f "$ZIP7"
CUSTOM_MSD_SH
chmod +x "$FW/hw_layer/mass_storage/create_ini_image.sh"

cat > "$FW/hw_layer/mass_storage/create_ini_image_compressed.sh" <<'CUSTOM_MSD_CSH'
#!/bin/bash
set -e
FULL_INI=$1
H_OUTPUT=$2
FS_SIZE=$3
SHORT_BOARD_NAME=$4
BOARD_SPECIFIC_URL=$5
PATH="$PATH:/usr/sbin"
CUSTOM_DIR="${EXTRA_FILES_TO_COPY_ON_IMAGE_FOLDER:-hw_layer/mass_storage/custom_extra}"
README_FILE_PATH="$CUSTOM_DIR/LEIA-ME.TXT"
[ -f "$README_FILE_PATH" ] || README_FILE_PATH=hw_layer/mass_storage/filesystem_contents/README.nozip.template.txt
EXTRA_FILES_TO_COPY_ON_IMAGE=()
if [ -d "$CUSTOM_DIR" ]; then
  for file in "$CUSTOM_DIR"/*; do
    [ -f "$file" ] || continue
    [ "$(basename "$file")" = "LEIA-ME.TXT" ] && continue
    EXTRA_FILES_TO_COPY_ON_IMAGE+=("$file")
  done
fi
echo "Custom MSD compressed root files: $FULL_INI $README_FILE_PATH ${EXTRA_FILES_TO_COPY_ON_IMAGE[*]}"
hw_layer/mass_storage/create_image.sh "$H_OUTPUT" "$FS_SIZE" true "$FULL_INI" "$README_FILE_PATH" "${EXTRA_FILES_TO_COPY_ON_IMAGE[@]}"
CUSTOM_MSD_CSH
chmod +x "$FW/hw_layer/mass_storage/create_ini_image_compressed.sh"

rm -f "$FW/.ramdisk-sentinel" \
      "$FW/hw_layer/mass_storage/ramdisk_image.h" \
      "$FW/hw_layer/mass_storage/ramdisk_image_compressed.h"
