# Guess the piano piece

A local, account-free classical piano guessing game built with SvelteKit 3, Svelte 5, TypeScript and pnpm. The interface follows the approved deep-green and brass mockup.

## Run

Requires Node.js 22.12+ and pnpm.

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173. The 48 active 40-second Opus excerpts are included under `static/audio`; the game does not download full recordings.

The active catalogue contains only solo piano recordings (46 work-level answers). The three orchestral entries are saved in `scripts/deferred-orchestral-catalogue.json` for possible later use.

## Gameplay

- Practice chooses one excerpt per work, shuffles the works, and plays through the cycle without repeats. When the catalogue is exhausted, a new cycle begins without immediately repeating the previous work. Points are shown for the current piece only; practice has no cumulative score or leaderboard submission.
- Daily challenge uses five distinct works, published once per date in Postgres. Everyone gets the same excerpts in the same order. It resets at **midnight AEST (fixed UTC+10)**, including during daylight saving.
- Clip lengths are 0.1, 0.5, 2, 8 and 15 seconds. Their scores are 1,000, 800, 600, 400 and 200; an unsolved piece earns zero. Daily maximum: 5,000.
- Each wrong answer or skip consumes one stage. Replaying is free. Correct guesses get confetti; wrong guesses get subtle visual feedback. Reduced-motion preferences are respected.
- Search matches piece, composer, aliases and opus numbers. All matches are scrollable. Spelling mistakes are tolerated in suggestions; numbers stay precise. Submitted guesses use the work's accepted names and aliases. Movement identification is not required.
- Daily progress stays in localStorage until all five pieces are completed. Only then does the name field appear and a single result submission is sent. The server recomputes the score from the five histories. Names allow Unicode letters and spaces, up to 50 characters. Names need not be unique.
- A completed run stays tied to its challenge date and can be submitted after midnight. An unfinished run from a previous day is replaced by the current day's challenge when reopening daily mode.
- Equal scores share a leaderboard rank. Submission time determines display order within ties. Retrying the same submission returns the original result without creating another entry.

## Database and local daily mode

Practice works without a database. Daily mode requires Postgres and a signing secret. For a local database:

```sh
docker compose up -d database
cp .env.example .env
# Set DAILY_TOKEN_SECRET in .env to the output of: openssl rand -hex 32
pnpm db:migrate
pnpm dev
```

`DATABASE_URL` and `DAILY_TOKEN_SECRET` are server-only runtime variables. `.env` is ignored by Git and Docker builds. Keep the same signing secret across replicas/restarts. Migrations run transactionally with an advisory lock and are safe to rerun.

Tables: `daily_challenges`, `daily_challenge_pieces`, and `daily_results`. Each published piece stores a metadata snapshot, preserving answer validation when the catalogue changes. Audio remains outside Postgres. Daily selections are published on the first request of the day, so no scheduler is required.

API:

- `GET /api/daily` — today's challenge, five excerpt IDs/audio URLs, AEST reset timestamp and a signed run token. Answers are not included in this response; the browser's practice catalogue remains public.
- `POST /api/daily/results` — JSON `{ token, name, rounds: [{ trackId, guesses: [...] }] }`. An empty guess string means a skip. All five histories must end in a correct answer or exhaust five stages. Client totals are ignored. Identical retries are idempotent; changes to an already-submitted run return 409.
- `GET /api/leaderboard?date=YYYY-MM-DD` — up to 50 leaders, total entry count and ranks. The date defaults to the current AEST date.
- `GET /api/health` — server liveness; `?ready=1` also checks database/schema availability.

A browser run token is not a player account. Clearing browser storage permits another run. Histories are validated, but cannot prove actual listening or prevent looking up answers; this is a casual leaderboard.

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

Browser tests use Chromium (`pnpm exec playwright install chromium` if needed). Tests cover score tiers, aliases, work-level shuffle cycles, AEST boundaries, name validation, history validation, saved daily progress, audio, mobile layout and curation. With DATABASE_URL configured and migrated, browser tests also cover real Postgres publication, submissions, duplicate prevention and tied leaderboard ranks. Use TEST_DATABASE_URL to target a separate test database and PLAYWRIGHT_PORT to choose a dedicated test server port.

## Deployment

`pnpm build` produces a Node server in `build/`; `pnpm start` runs it on port 3000 and loads `.env` when present. This is no longer a static-only deployment. Production can inject environment variables directly rather than using a file.

Production: https://classicguess.bevsoft.com. The Dockerfile packages the Node server, bundled audio, and migration runner. [Deployment instructions](deploy/README.md) cover the Git-tagged Skaffold release and [Kubernetes manifests](k8s/kustomization.yaml). The app uses the existing Postgres database and has no PVC; migrations run before server startup.

Code: MIT. Audio: independent licences listed in the catalogue and source notes.
