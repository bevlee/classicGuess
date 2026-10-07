<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { Play, Square, ArrowRight, SkipForward, Volume2, RotateCcw, CircleCheck, CircleX } from '@lucide/svelte';
  import { WebAudioPlayer } from '#lib/audio/player';
  import { stages } from '#lib/game/stages';
  import { createRound, readyRound, submitGuess, skipStage, makeWorkBag } from '#lib/game/game';
  import { tracks } from '#lib/tracks/tracks';
  import Confetti from '../lib/components/Confetti.svelte';
  import Leaderboard from '../lib/components/Leaderboard.svelte';
  import { aestDate, DAILY_MAX_SCORE, validateName } from '#lib/daily/rules';
  import { restoreDaily } from '#lib/daily/session';
  import type { DailyChallenge, DailyRound, DailyResult } from '#lib/daily/types';
  import WorkInput from '../lib/components/WorkInput.svelte';
  import type { Track } from '#lib/tracks/types';
  import type { RoundState } from '#lib/game/types';

  let queue = $state<Track[]>([]);
  let track = $state<Track | null>(null);
  let round = $state<RoundState>(createRound(''));
  let mode = $state<'practice' | 'daily'>('practice');
  let challenge = $state<DailyChallenge | null>(null);
  let dailyRounds = $state<DailyRound[]>([]);
  let dailyScores = $state<number[]>([]);
  let dailyFinished = $state(false);
  let dailyLoading = $state(false);
  let dailyError = $state('');
  let displayName = $state('');
  let submitting = $state(false);
  let submissionError = $state('');
  let submitted = $state<DailyResult | null>(null);
  let modeRequest = 0;
  const dailyScore = $derived(dailyScores.reduce((sum, score) => sum + score, 0));
  let selected = $state('');
  let error = $state('');
  let message = $state('');
  let effect = $state<'correct' | 'wrong' | 'missed' | null>(null);
  let effectId = $state(0);
  let workInput = $state<HTMLInputElement>();
  let nextButton = $state<HTMLButtonElement>();
  let hasListened = $state(false);
  let guessForm = $state<HTMLFormElement>();
  let effectTimer: ReturnType<typeof setTimeout> | undefined;
  let shake: Animation | undefined;
  let playing = $state(false);
  let volume = $state(65);
  let elapsed = $state(0);
  let player: WebAudioPlayer;
  let loadRequest = 0;
  let resumeAfterLoad: RoundState | undefined;
  let frame = 0;
  const stage = $derived(stages[round.stageIndex]);
  const revealed = $derived(round.status === 'revealed');
  const dailyPosition = $derived(Math.min(5, dailyRounds.length + (revealed ? 0 : 1)));
  const duration = $derived(revealed ? (track?.excerptDuration ?? 40) : stage.duration);
  const playLabel = $derived(playing ? 'Stop playback' : revealed ? 'Play full excerpt' : hasListened ? 'Listen again' : 'Play clip');
  const format = (n: number) => n.toLocaleString();
  const timestamp = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;

  async function focusRound() {
    const request = loadRequest;
    await tick();
    if (request !== loadRequest || dailyLoading || dailyError || dailyFinished) return;
    if (revealed) nextButton?.focus({ preventScroll: true });
    else if (round.status === 'guessing') workInput?.focus({ preventScroll: true });
  }
  function resetEffects() {
    clearTimeout(effectTimer);
    shake?.cancel();
    effect = null;
  }
  function showEffect(outcome: 'correct' | 'wrong' | 'missed') {
    resetEffects();
    effect = outcome; effectId++;
    if (outcome === 'wrong' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shake = guessForm?.animate([
        { transform: 'translateX(0)' }, { transform: 'translateX(-5px)' },
        { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' },
        { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }
      ], { duration: 360, easing: 'ease-out' });
    }
    effectTimer = setTimeout(() => { effect = null; }, 2500);
  }
  function persistDaily() {
    if (mode !== 'daily' || !challenge) return;
    try {
      localStorage.setItem('classical-daily-v1', JSON.stringify({ challenge, rounds: dailyRounds, scores: dailyScores,
        currentRound: round, finished: dailyFinished, submitted, name: displayName }));
    } catch { /* The run can still be completed without browser storage. */ }
  }
  async function enterDaily() {
    const request = ++modeRequest;
    player.stop(); loadRequest++; resetEffects();
    mode = 'daily'; dailyLoading = true; dailyError = ''; dailyFinished = false; challenge = null; submitted = null;
    error = ''; message = ''; displayName = ''; submissionError = ''; dailyRounds = []; dailyScores = [];
    try {
      let saved = null;
      try { saved = restoreDaily(localStorage.getItem('classical-daily-v1'), tracks, aestDate()); } catch { /* Storage is optional. */ }
      if (saved) {
        challenge = saved.challenge; dailyRounds = saved.rounds; dailyScores = saved.scores;
        dailyFinished = saved.finished; submitted = saved.submitted ?? null;
        displayName = saved.name ?? '';
        if (!dailyFinished) {
          const piece = tracks.find(piece => piece.id === saved.currentRound?.trackId);
          if (!piece || !challenge!.pieces.some(item => item.id === piece.id)) throw new Error('This saved challenge is no longer available.');
          await loadTrack(piece, saved.currentRound);
        }
      } else {
        const response = await fetch('/api/daily');
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? 'The daily challenge could not be loaded.');
        if (request !== modeRequest) return;
        challenge = data;
        const piece = tracks.find(piece => piece.id === challenge!.pieces[0].id);
        if (!piece) throw new Error('Refresh the page to load the latest challenge catalogue.');
        await loadTrack(piece);
      }
    } catch (cause) { if (request === modeRequest) dailyError = cause instanceof Error ? cause.message : 'The daily challenge could not be loaded.'; }
    finally { if (request === modeRequest) { dailyLoading = false; void focusRound(); } }
  }
  function chooseMode(next: 'practice' | 'daily') {
    if (next === mode && !dailyError) return;
    const url = new URL(window.location.href); url.searchParams.set('mode', next);
    void goto(url, { shallow: true, replace: true });
    if (next === 'daily') void enterDaily();
    else { modeRequest++; mode = 'practice'; dailyLoading = false; dailyError = ''; player.stop(); loadRequest++; nextRound(); }
  }
  async function submitDaily() {
    if (!challenge || !dailyFinished || submitted || submitting) return;
    submissionError = '';
    try { displayName = validateName(displayName); } catch (cause) { submissionError = (cause as Error).message; return; }
    submitting = true; persistDaily();
    try {
      const response = await fetch('/api/daily/results', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: challenge.token, name: displayName, rounds: dailyRounds }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'Your score could not be submitted.');
      submitted = data; persistDaily();
    } catch (cause) { submissionError = cause instanceof Error ? cause.message : 'Your score could not be submitted. Please try again.'; }
    finally { submitting = false; }
  }
  async function loadTrack(next: Track, resume?: RoundState) {
    resetEffects();
    resumeAfterLoad = resume;
    const request = ++loadRequest;
    hasListened = false;
    track = next; round = createRound(next.id); selected = ''; error = ''; message = ''; elapsed = 0;
    try {
      await player.load(next.audioUrl);
      if (request !== loadRequest) return;
      if (player.duration < 15) throw new Error('This recording is too short for a round.');
      round = resume && resume.trackId === next.id && ['guessing', 'revealed'].includes(resume.status) ? resume : readyRound(round);
      resumeAfterLoad = undefined;
      void focusRound();
      persistDaily();
      if (mode === 'practice' && queue[0]) void player.prefetch(queue[0].audioUrl).catch(() => {});
    } catch (cause) {
      if (request === loadRequest) error = cause instanceof Error ? cause.message : 'The recording could not be loaded.';
    }
  }
  function nextRound() {
    player.stop();
    if (mode === 'daily') {
      if (!challenge) return;
      if (dailyRounds.length === 5) { dailyFinished = true; resetEffects(); persistDaily(); return; }
      const next = tracks.find(piece => piece.id === challenge!.pieces[dailyRounds.length].id);
      if (next) void loadTrack(next);
      else error = 'This recording is no longer available. Refresh the page.';
      return;
    }
    if (!queue.length) queue = makeWorkBag(tracks, track?.workId);
    const [next, ...rest] = queue; queue = rest;
    void loadTrack(next);
  }
  async function play() {
    if (playing) { player.stop(); return; }
    const id = round.trackId;
    const stageIndex = round.stageIndex;
    error = '';
    try {
      if (revealed) await player.playFrom(0);
      else await player.playClip(0, stage.duration);
      if (id === round.trackId && stageIndex === round.stageIndex) hasListened = true;
    } catch (cause) {
      if (id === round.trackId) error = cause instanceof Error ? cause.message : 'Playback could not start.';
    }
  }
  function apply(updated: RoundState, skipped = false) {
    if (updated === round) return;
    player.stop(); elapsed = 0;
    const wasRevealed = revealed;
    hasListened = false;
    round = updated; selected = '';
    if (updated.status === 'revealed' && !wasRevealed) {
      if (mode === 'daily') { dailyRounds = [...dailyRounds, { trackId: updated.trackId, guesses: [...updated.guesses] }]; dailyScores = [...dailyScores, updated.score]; }
      message = updated.solved ? 'Well heard.' : '';
      showEffect(updated.solved ? 'correct' : 'missed');
      // Resume synchronously within the guess/skip click before scheduling replay.
      void play();
    } else {
      message = skipped ? '' : 'Not quite. A longer clip is ready.';
      if (skipped) resetEffects();
      else showEffect('wrong');
    }
    persistDaily();
    void focusRound();
  }
  function guess() {
    if (track && selected) apply(submitGuess(round, selected, track));
  }
  onMount(() => {
    player = new WebAudioPlayer();
    player.onPlayback = (event) => {
      playing = event.playing;
      cancelAnimationFrame(frame);
      if (event.playing) {
        elapsed = 0;
        const began = performance.now();
        const tick = () => { elapsed = Math.min((performance.now() - began) / 1000, event.duration); if (playing) frame = requestAnimationFrame(tick); };
        frame = requestAnimationFrame(tick);
      } else if (event.duration) elapsed = event.duration;
      else elapsed = 0;
    };
    if (new URLSearchParams(window.location.search).get('mode') === 'daily') void enterDaily();
    else nextRound();
    return () => { modeRequest++; resetEffects(); loadRequest++; cancelAnimationFrame(frame); player.dispose(); };
  });
</script>

<svelte:head><title>Guess the piano piece</title><meta name="description" content="Recognise a classical piano piece in 0.1, 0.5, 2, 8 or 15 seconds. Listen, guess, and discover."/></svelte:head>

{#if effect === 'correct'}{#key effectId}<Confetti/>{/key}{/if}

<div class="game-shell">
  <main class="game-main">
    <nav class="mode-switch" aria-label="Game mode">
      <button class:chosen={mode === 'practice'} aria-pressed={mode === 'practice'} disabled={submitting} onclick={() => chooseMode('practice')}>Practice</button>
      <button class:chosen={mode === 'daily'} aria-pressed={mode === 'daily'} disabled={submitting} onclick={() => chooseMode('daily')}>Daily challenge</button>
    </nav>
    {#if effect === 'correct'}{#key effectId}<div class="success-glow" aria-hidden="true"></div>{/key}{/if}
    <header class="game-header"><h1>Guess the piano piece</h1></header>
    {#if mode === 'daily'}
      <div class="daily-status">
        <ol class="daily-progress" aria-label="Daily challenge progress">
          {#each Array(5) as _, index}
            <li class:completed={index < dailyRounds.length} class:current={!dailyFinished && index + 1 === dailyPosition}
              aria-current={!dailyFinished && index + 1 === dailyPosition ? 'step' : undefined}
              aria-label={`Piece ${index + 1}: ${index < dailyRounds.length ? 'completed' : index + 1 === dailyPosition ? 'current' : 'upcoming'}`}>
              {#if index < dailyRounds.length}<CircleCheck size={16}/>{:else}<span>{index + 1}</span>{/if}
            </li>
          {/each}
        </ol>
        <p class="daily-points">{format(dailyScore)} / 5,000 points</p>
        <p class="daily-reset">Resets at midnight AEST<br/>UTC+10</p>
      </div>
    {/if}
    {#if mode === 'daily' && dailyLoading}<p class="daily-state" role="status">Loading daily challenge…</p>
    {:else if mode === 'daily' && dailyError}<div class="daily-state" role="alert"><p>{dailyError}</p><button class="secondary" onclick={enterDaily}>Retry daily challenge</button></div>
    {:else if mode === 'daily' && dailyFinished}
      <section class="daily-summary" aria-label="Daily challenge results">
        <p class="round-label">DAILY CHALLENGE · {challenge?.date}</p>
        <div class="daily-total">{format(submitted?.score ?? dailyScore)}<span> / {format(DAILY_MAX_SCORE)} points</span></div>
        <div class="daily-score-grid">{#each dailyScores as score, index}<div><span>Piece {index + 1}</span><strong>{format(score)}</strong></div>{/each}</div>
        {#if submitted}<div class="submission-success" role="status"><CircleCheck size={18}/><p>Score submitted as <strong>{submitted.name}</strong>.<br/>Rank {submitted.rank} when submitted.</p></div>
        {:else}<form class="score-submission" onsubmit={event => { event.preventDefault(); void submitDaily(); }}>
          <label for="player-name">Your name on the leaderboard</label>
          <input id="player-name" bind:value={displayName} maxlength="50" placeholder="Your name" autocomplete="nickname" disabled={submitting} aria-describedby="name-guidance"/>
          <p id="name-guidance" class="muted small">Letters and spaces only · Up to 50 characters</p>
          <button class="primary" disabled={submitting || !displayName.trim()}>{submitting ? 'Submitting…' : 'Submit score'}<ArrowRight size={17}/></button>
          {#if submissionError}<p class="submission-error" role="alert">{submissionError}</p>{/if}
        </form>{/if}
        {#if challenge}<Leaderboard date={challenge.date} refresh={submitted?.id ?? ''}/>{/if}
        <a class="leaderboard-link" href="/leaderboard">View leaderboard <ArrowRight size={13}/></a>
        <button class="secondary" disabled={submitting} onclick={() => chooseMode('practice')}>Keep practising</button>
      </section>
    {:else}
    <div class="round-label">{revealed ? 'ANSWER REVEALED' : mode === 'daily' ? `DAILY · PIECE ${dailyPosition} OF 5` : 'PRACTICE'}</div>
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
      <div class="play-control"><button class="big-play" onclick={play} disabled={round.status === 'loading'} aria-label={playLabel}>
        {#if playing}<Square size={29} fill="currentColor"/>{:else}<Play size={34} fill="currentColor"/>{/if}
      </button><span class="play-label" aria-hidden="true">{playLabel}</span></div>
      <div class="listen-details">
        <div class="listen-duration">{duration}<span>seconds</span></div>
        {#if !revealed}<button class="skip" type="button" onclick={() => apply(skipStage(round), true)} disabled={round.status !== 'guessing'}>{round.stageIndex === stages.length - 1 ? 'Reveal answer' : 'Hear more'}<SkipForward size={15}/></button>{/if}
      </div>
    </div>
    <div class="volume-control"><label for="volume"><Volume2 size={16}/><span>Volume</span></label><input id="volume" type="range" min="0" max="100" bind:value={volume} oninput={() => player?.setVolume(volume / 100)}/><span class="volume-value">{volume}%</span></div>
    <p class="listen-guidance">A wrong guess or skip gives you a longer listen.</p>
    {#if round.status === 'loading' && !error}<p class="loading" role="status">Loading recording…</p>{/if}
    {#if revealed && track}
      <section class="answer" class:answer-correct={effect === 'correct'} class:answer-missed={effect === 'missed'} aria-label="Answer">
        <div class="composer">{track.composer}</div><h2>{track.work}</h2>{#if track.movement}<p class="movement">{track.movement}</p>{/if}
        <button class="primary next" bind:this={nextButton} onclick={nextRound}>{mode === 'daily' && dailyRounds.length === 5 ? 'See your score' : 'Next piece'} <ArrowRight size={17}/></button>
      </section>
    {:else}
      <form class="guess-area" bind:this={guessForm} onsubmit={(event) => { event.preventDefault(); guess(); }}>
        {#if effect === 'wrong'}{#key effectId}<div class="wrong-glow" aria-hidden="true"></div>{/key}{/if}
        <label for="work">Which work do you hear?</label>
        <div class="guess-row"><WorkInput bind:input={workInput} bind:value={selected} disabled={round.status !== 'guessing'}/><button class="primary" type="submit" disabled={!selected.trim() || round.status !== 'guessing'}>Guess <ArrowRight size={17}/></button></div>
      </form>
    {/if}
    <div class="feedback" class:feedback-wrong={effect === 'wrong'} aria-live="polite">
      {#if message}{#if revealed && round.solved}<CircleCheck size={16}/>{:else}<CircleX size={16}/>{/if}<span>{message}</span>{/if}
    </div>
    {#if error}<div class="error" role="alert"><p>{error}</p><button class="secondary" onclick={() => round.status === 'loading' && track ? loadTrack(track, resumeAfterLoad) : play()}><RotateCcw size={15}/>Try again</button>{#if round.status === 'loading' && mode === 'practice'}<button class="secondary" onclick={nextRound}>Try another recording</button>{/if}</div>{/if}
    {/if}
  {#if revealed && track && !dailyFinished && !dailyLoading && !dailyError}<details class="credits"><summary>Recording &amp; licence</summary>{#if track.source.performer}<p>{track.source.performer}</p>{/if}<a href={track.source.url} target="_blank" rel="noreferrer">{track.source.name}</a><a href={track.source.licenseUrl} target="_blank" rel="noreferrer">{track.source.license === 'cc0' ? 'CC0 1.0' : track.source.license === 'public-domain' ? 'Public Domain' : 'Unrestricted recording permission'}</a>{#if track.source.permission}<p>{track.source.permission}</p>{/if}</details>{/if}
  </main>
</div>
