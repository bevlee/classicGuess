<script lang="ts">
  import { onMount } from 'svelte';
  import { Play, Square, ArrowRight, SkipForward, Volume2, RotateCcw } from '@lucide/svelte';
  import { WebAudioPlayer } from '#lib/audio/player';
  import { stages } from '#lib/game/stages';
  import { createRound, readyRound, submitGuess, skipStage, makeBag } from '#lib/game/game';
  import { tracks } from '#lib/tracks/tracks';
  import WorkInput from '../lib/components/WorkInput.svelte';
  import type { Track } from '#lib/tracks/types';
  import type { RoundState } from '#lib/game/types';

  let queue = $state<Track[]>([]);
  let track = $state<Track | null>(null);
  let round = $state<RoundState>(createRound(''));
  let totalScore = $state(0);
  let played = $state(0);
  let selected = $state('');
  let error = $state('');
  let message = $state('');
  let playing = $state(false);
  let volume = $state(65);
  let elapsed = $state(0);
  let playbackLength = $state(0);
  let player: WebAudioPlayer;
  let loadRequest = 0;
  let frame = 0;
  const stage = $derived(stages[round.stageIndex]);
  const revealed = $derived(round.status === 'revealed');
  const duration = $derived(revealed ? (track?.excerptDuration ?? 40) : stage.duration);
  const format = (n: number) => n.toLocaleString();
  const timestamp = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;

  function persist() {
    try { localStorage.setItem('classical-session-v1', JSON.stringify({ totalScore, played })); } catch { /* Storage is optional. */ }
  }
  async function loadTrack(next: Track) {
    const request = ++loadRequest;
    track = next; round = createRound(next.id); selected = ''; error = ''; message = ''; elapsed = 0;
    try {
      await player.load(next.audioUrl);
      if (request !== loadRequest) return;
      if (player.duration < 15) throw new Error('This recording is too short for a round.');
      round = readyRound(round);
      if (queue[0]) void player.prefetch(queue[0].audioUrl).catch(() => {});
    } catch (cause) {
      if (request === loadRequest) error = cause instanceof Error ? cause.message : 'The recording could not be loaded.';
    }
  }
  function nextRound() {
    player.stop();
    if (!queue.length) queue = makeBag(tracks, track?.id);
    const [next, ...rest] = queue; queue = rest;
    void loadTrack(next);
  }
  async function play() {
    if (playing) { player.stop(); return; }
    const id = round.trackId;
    error = '';
    try {
      if (revealed) await player.playFrom(0);
      else await player.playClip(0, stage.duration);
    } catch (cause) {
      if (id === round.trackId) error = cause instanceof Error ? cause.message : 'Playback could not start.';
    }
  }
  function apply(updated: RoundState, skipped = false) {
    if (updated === round) return;
    player.stop(); elapsed = 0;
    const wasRevealed = revealed;
    round = updated; selected = '';
    if (updated.status === 'revealed' && !wasRevealed) {
      totalScore += updated.score; played++; persist();
      message = updated.solved ? 'Well heard.' : 'One for next time.';
      // Resume synchronously within the guess/skip click before scheduling replay.
      void play();
    } else message = skipped ? '' : 'Not quite. A longer clip is ready.';
  }
  function guess() {
    if (track && selected) apply(submitGuess(round, selected, track));
  }
  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('classical-session-v1') ?? 'null');
      if (saved && Number.isSafeInteger(saved.totalScore) && saved.totalScore >= 0 && Number.isSafeInteger(saved.played) && saved.played >= 0) {
        totalScore = saved.totalScore; played = saved.played;
      }
    } catch { /* A fresh session is always available. */ }
    player = new WebAudioPlayer();
    player.onPlayback = (event) => {
      playing = event.playing;
      cancelAnimationFrame(frame);
      if (event.playing) {
        elapsed = 0; playbackLength = event.duration;
        const began = performance.now();
        const tick = () => { elapsed = Math.min((performance.now() - began) / 1000, event.duration); if (playing) frame = requestAnimationFrame(tick); };
        frame = requestAnimationFrame(tick);
      } else if (event.duration) elapsed = event.duration;
      else elapsed = 0;
    };
    nextRound();
    return () => { loadRequest++; cancelAnimationFrame(frame); player.dispose(); };
  });
</script>

<svelte:head><title>Guess the classical piece</title><meta name="description" content="Recognise a classical work in 0.1, 0.5, 2, 8 or 15 seconds. Listen, guess, and discover."/></svelte:head>

<div class="game-shell">
  <aside class="session-panel" aria-label="Your session">
    <div class="session-stats"><div class="stat"><strong>{format(totalScore)}</strong><span>Total points</span></div><div class="stat"><strong>{format(played)}</strong><span>Pieces played</span></div></div>
    <div class="rule"></div>
    <p class="muted small">A wrong guess or skip gives you a longer listen.</p>
    <div class="practice"><span></span>Practice mode</div>
  </aside>

  <main class="game-main">
    <header class="game-header"><h1>Guess the classical piece</h1></header>
    <div class="round-label">{revealed ? 'ANSWER REVEALED' : `ROUND ${String(played + 1).padStart(2, '0')}`}</div>
    <div class="stages" aria-label="Clip stages">
      {#each stages as item, i}
        <div class:active={round.stageIndex === i} class:past={round.stageIndex > i} class="stage" aria-current={round.stageIndex === i ? 'step' : undefined}>{item.duration}s</div>
      {/each}
    </div>
    <div class="timeline" role="progressbar" aria-label="Playback progress" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={elapsed}>
      <div style:width={`${playing || revealed ? (elapsed / duration) * 100 : (stage.duration / 15) * 100}%`}></div>
    </div>
    <div class="timeline-labels"><span>{revealed ? `${timestamp(elapsed)} / ${timestamp(duration)}` : `${stage.duration} seconds`}</span><span>{revealed ? `${round.solved ? '+' : ''}${format(round.score)} points earned` : `${format(stage.score)} points available`}</span></div>
    <div class="listen-area">
      <button class="big-play" onclick={play} disabled={round.status === 'loading'} aria-label={playing ? 'Stop playback' : revealed ? 'Play full excerpt' : 'Play clip'}>
        {#if playing}<Square size={29} fill="currentColor"/>{:else}<Play size={34} fill="currentColor"/>{/if}
      </button>
      <div class="listen-details">
        <div class="listen-duration">{duration}<span>seconds</span></div>
        {#if !revealed}<button class="skip" type="button" onclick={() => apply(skipStage(round), true)} disabled={round.status !== 'guessing'}>{round.stageIndex === stages.length - 1 ? 'Skip & reveal' : 'Skip to a longer clip'}<SkipForward size={15}/></button>{/if}
      </div>
    </div>
    {#if round.status === 'loading' && !error}<p class="loading" role="status">Loading recording…</p>{/if}
    {#if revealed && track}
      <section class="answer" aria-label="Answer">
        <div class="composer">{track.composer}</div><h2>{track.work}</h2>{#if track.movement}<p class="movement">{track.movement}</p>{/if}
        <button class="primary next" onclick={nextRound}>Next piece <ArrowRight size={17}/></button>
      </section>
    {:else}
      <form class="guess-area" onsubmit={(event) => { event.preventDefault(); guess(); }}>
        <label for="work">Which work do you hear?</label>
        <div class="guess-row"><WorkInput bind:value={selected} disabled={round.status !== 'guessing'}/><button class="primary" type="submit" disabled={!selected.trim() || round.status !== 'guessing'}>Guess <ArrowRight size={17}/></button></div>
      </form>
    {/if}
    <div class="feedback" aria-live="polite">{message}</div>
    {#if error}<div class="error" role="alert"><p>{error}</p><button class="secondary" onclick={() => round.status === 'loading' && track ? loadTrack(track) : play()}><RotateCcw size={15}/>Try again</button>{#if round.status === 'loading'}<button class="secondary" onclick={nextRound}>Try another recording</button>{/if}</div>{/if}
  </main>

  <aside class="playback-panel" aria-label="Playback controls">
    <div class="round-detail"><span>Stage</span><strong>{round.stageIndex + 1} / 5</strong></div><div class="round-detail"><span>{revealed ? 'Points earned' : 'For a correct guess'}</span><strong>{format(revealed ? round.score : stage.score)} pts</strong></div>
    <div class="rule"></div>
    <div class="volume-control"><label for="volume"><Volume2 size={16}/><span>Volume</span></label><input id="volume" type="range" min="0" max="100" bind:value={volume} oninput={() => player?.setVolume(volume / 100)}/><span class="volume-value">{volume}%</span></div>
    {#if revealed && track}<details class="credits"><summary>Recording &amp; licence</summary>{#if track.source.performer}<p>{track.source.performer}</p>{/if}<a href={track.source.url} target="_blank" rel="noreferrer">{track.source.name}</a><a href={track.source.licenseUrl} target="_blank" rel="noreferrer">{track.source.license === 'cc0' ? 'CC0 1.0' : track.source.license === 'public-domain' ? 'Public Domain' : 'Unrestricted recording permission'}</a>{#if track.source.permission}<p>{track.source.permission}</p>{/if}</details>{/if}
  </aside>
</div>
