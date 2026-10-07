#!/usr/bin/env python3
"""Download the reviewed recording sources and produce local game excerpts.
Full recordings stay in ignored sources/. Only excerpts go into static/audio/.
"""
import hashlib
import argparse
import json
from pathlib import Path
import subprocess
import time
from urllib.error import HTTPError
from urllib.parse import quote, unquote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
tracks = json.loads((ROOT / 'src/lib/tracks/catalogue.json').read_text())
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('ids', nargs='*', help='Only prepare these asset IDs; omit for the whole catalogue.')
args = parser.parse_args()
if args.ids:
    unknown = set(args.ids) - {track['id'] for track in tracks}
    if unknown:
        raise SystemExit(f"Unknown asset IDs: {', '.join(sorted(unknown))}")
    tracks = [track for track in tracks if track['id'] in args.ids]
downloads = json.loads((ROOT / 'scripts/source-downloads.json').read_text())
for track in tracks:
    source = track['source']
    if source['license'] not in ('cc0', 'public-domain', 'unrestricted-permission'):
        raise SystemExit('Unsupported recording licence')
    if track['id'] in downloads:
        url = downloads[track['id']]
    elif '/wiki/File:' in source['url']:
        name = unquote(source['url'].split('/wiki/File:', 1)[1]).replace(' ', '_')
        digest = hashlib.md5(name.encode()).hexdigest()
        url = f'https://upload.wikimedia.org/wikipedia/commons/{digest[0]}/{digest[:2]}/{quote(name)}'
    else:
        raise SystemExit(f"Missing reviewed download URL for {track['id']}")
    original = ROOT / 'sources' / (track['id'] + '.ogg')
    excerpt = ROOT / 'static' / track['audioUrl'].lstrip('/')
    if excerpt.exists():
        print('Ready:', excerpt.name, flush=True)
        continue
    if not original.exists():
        print('Downloading', track['composer'], flush=True)
        request = Request(url, headers={'User-Agent': 'ClassicalGuessMVP/0.1 (local audio curation)'})
        for attempt in range(4):
            try:
                with urlopen(request, timeout=90) as response:
                    data = response.read()
                temporary = original.with_suffix('.download')
                temporary.write_bytes(data)
                temporary.replace(original)
                break
            except HTTPError as error:
                if error.code not in (429, 503) or attempt == 3:
                    raise
                delay = max(15 * (attempt + 1), int(error.headers.get('Retry-After', '0')))
                print(f'Source requests a {delay}-second cooldown; waiting before retry.', flush=True)
                time.sleep(delay)
    if not excerpt.exists():
        subprocess.run([str(ROOT / 'scripts/make-excerpt.sh'), str(original), str(track['cueStart']), str(excerpt), str(track['excerptDuration'])], check=True)
    print('Ready:', excerpt.name, flush=True)
