#!/usr/bin/env bash
set -euo pipefail
# Usage: make-excerpt.sh SOURCE START OUTPUT [DURATION]
if [[ $# -lt 3 || $# -gt 4 ]]; then
  echo 'Usage: scripts/make-excerpt.sh SOURCE START OUTPUT [DURATION=40]' >&2
  exit 1
fi
source_file=$1
cue_start=$2
output_file=$3
excerpt_duration=${4:-40}
python3 - "$cue_start" "$excerpt_duration" <<'PY'
import math, sys
start, duration = map(float, sys.argv[1:])
if not (math.isfinite(start) and start >= 0 and math.isfinite(duration) and 30 <= duration <= 45):
    raise SystemExit('Cue must be nonnegative and duration must be between 30 and 45 seconds.')
PY
command -v ffmpeg >/dev/null || { echo 'Install FFmpeg first.' >&2; exit 1; }
source_duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$source_file")
python3 - "$cue_start" "$excerpt_duration" "$source_duration" <<'PY'
import sys
start, duration, available = map(float, sys.argv[1:])
if start + duration > available:
    raise SystemExit('The selected excerpt extends beyond the source recording.')
PY
fade_start=$(python3 -c 'import sys; print(float(sys.argv[1]) - 0.5)' "$excerpt_duration")
mkdir -p "$(dirname "$output_file")"
ffmpeg -hide_banner -loglevel error -n -ss "$cue_start" -i "$source_file" -t "$excerpt_duration" \
  -vn -map_metadata -1 -af "loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st=$fade_start:d=0.5" \
  -ar 48000 -c:a libopus -b:a 96k "$output_file"
