# Classical

A local, account-free classical guessing game built with SvelteKit 3, Svelte 5, TypeScript and pnpm. The interface follows the approved deep-green and brass mockup.

## Run

Requires Node.js 22.12+ and pnpm.

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173. The 51 generated 40-second Opus excerpts are included under `static/audio`; the game does not download full recordings.

## Gameplay

- Type a piece, composer, alias or opus number to search the catalogue. All matches remain available in a scrollable list. Search tolerates spelling mistakes, ranks literal matches first and keeps numbers exact; select a suggestion to submit its full title. Typed guesses are checked against the work title and aliases. Movement identification is not required.
- Clip lengths are 0.1, 0.5, 2, 8 and 15 seconds. Their scores are 1,000, 800, 600, 400 and 200.
- Each wrong answer or skip consumes exactly one stage. Replaying a clip is free.
- A correct answer or fifth failed attempt reveals the composer, work, movement and recording credits, and restarts the entire excerpt. Next is available immediately.
- Track order uses a shuffled bag: no repeats within a catalogue cycle and no consecutive repeat across cycles.
- Total points and completed pieces persist in this browser using localStorage. An unfinished round is replaced when the page reloads. Clear the `classical-session-v1` storage key to reset the counters.

## Audio

`src/lib/audio/player.ts` owns decoding, a bounded two-buffer cache, precise Web Audio scheduling, volume, cancellation and playback events. Every play creates a fresh AudioBufferSourceNode and schedules its duration directly on the audio clock. Brief edge ramps prevent clicks; post-reveal playback has a half-second fade. The next recording is prefetched after the current one loads.

`cueStart` is a timestamp in the original recording. The generated excerpt already includes that trim, so game playback always begins at zero. `audioUrl` can be changed directly to an object-storage/CDN URL; configure CORS there to allow browser fetches. No backend audio proxy is involved.

## Curate

The curation page is available directly at `/admin` and has no link from the player interface. It is hidden from navigation, without authentication. Open `/admin` and select a local original recording. Move the cue slider or enter a timestamp, preview each stage and the full excerpt, then fill out the work and source metadata. Save metadata downloads a JSON track entry and displays the FFmpeg command to generate the Opus file. File decoding and preview stay in the browser. The page does not run FFmpeg or write into the repository itself.

Standard curation accepts CC0 and explicitly Public Domain recordings. Clair de lune uses a separately reviewed unrestricted recording permission from performer David O, requested for inclusion on 8 October 2026. The app labels that permission accurately and links to the original grant. Verify the **recording's** licence on its source page before adding an asset. A public-domain composition does not establish recording rights.

With FFmpeg and Python 3 installed:

```sh
scripts/make-excerpt.sh path/to/source.flac 44 static/audio/new-id-v1.opus 40
```

The helper normalizes loudness, removes identifying audio metadata, encodes Opus at 96 kbps and fades the last 0.5 seconds. It validates the excerpt length and available source duration and refuses to overwrite an existing asset. Use a new asset ID/version when changing a cue. Add the saved metadata entry to `src/lib/tracks/catalogue.json`.

The starter cues are initial candidates for listening/playtesting, not difficulty-calibrated ranked challenges. Adjust them with `/admin` after listening. The original files can be downloaded again with:

```sh
python3 scripts/fetch-catalogue.py
# Or prepare selected asset IDs:
python3 scripts/fetch-catalogue.py a7c91e-v1
```

The piano expansion and remaining recording candidates are listed in [PIANO-CATALOGUE.md](PIANO-CATALOGUE.md). Non-Wikimedia download URLs are recorded in `scripts/source-downloads.json`.

Full recordings live in ignored `sources/`. See [AUDIO-SOURCES.md](AUDIO-SOURCES.md) for the reviewed licences and provenance.

## Validate

```sh
pnpm check
pnpm test
pnpm build
pnpm test:e2e
```

Browser tests use Chromium (`pnpm exec playwright install chromium` if needed). Tests cover score tiers, attempt limits, aliases, shuffled bags, audio scheduling, real browser decoding, reveal replay, persistent counters, mobile width, download/export and failed-load recovery.

## Static hosting

`pnpm build` writes a static SPA to `build/`. Configure your host to serve `200.html` for unknown app routes, including `/admin`. Audio files use immutable versioned names; set `Cache-Control: public, max-age=31536000, immutable` for `/audio/*` on the host. Do not apply immutable caching to the SPA fallback.

No accounts, leaderboard, server scoring, full-composition streaming, or external storage are included. Client scores are for local practice only.

Code: MIT. Audio: independent licences listed in the catalogue and source notes.
