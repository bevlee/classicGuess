<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Download, Square } from '@lucide/svelte';
  import { WebAudioPlayer } from '#lib/audio/player';
  import { stages } from '#lib/game/stages';
  import type { Track } from '#lib/tracks/types';
  let player: WebAudioPlayer;
  let objectUrl = '';
  let request = 0;
  let sourceName = $state('');
  let sourceDuration = $state(0);
  let ready = $state(false);
  let loading = $state(false);
  let playing = $state(false);
  let activePreview = $state(0);
  let cue = $state(0);
  let excerptLength = $state(40);
  let composer = $state('');
  let work = $state('');
  let movement = $state('');
  let aliases = $state('');
  let id = $state('');
  let workId = $state('');
  let sourceUrl = $state('');
  let sourceLabel = $state('');
  let performer = $state('');
  let license = $state<'cc0' | 'public-domain'>('cc0');
  let error = $state('');
  let notice = $state('');
  let exported = $state('');
  let command = $state('');
  const maxCue = $derived(Math.max(0, sourceDuration - excerptLength));
  const valid = $derived(ready && !!id.trim() && /^[a-z0-9][a-z0-9-]*$/.test(id) && !!workId.trim() && !!composer.trim() && !!work.trim() && /^https?:\/\//.test(sourceUrl) && !!sourceLabel.trim() && cue >= 0 && cue <= maxCue && excerptLength >= 30 && excerptLength <= 45 && sourceDuration >= excerptLength);
  const stamp = (n: number) => `${Math.floor(n / 60)}:${(n % 60).toFixed(2).padStart(5, '0')}`;
  function adjustCue() { player?.stop(); cue = Math.min(maxCue, Math.max(0, cue)); exported = ''; command = ''; }
  async function loadFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const current = ++request;
    player.stop(); ready = false; loading = true; error = ''; notice = ''; exported = ''; command = ''; sourceDuration = 0;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file); sourceName = file.name; cue = 0;
    if (!id) id = `${crypto.randomUUID().slice(0, 8)}-v1`;
    try {
      await player.load(objectUrl);
      if (current !== request) return;
      sourceDuration = player.duration;
      if (sourceDuration < 30) throw new Error('Choose a recording at least 30 seconds long.');
      excerptLength = Math.min(40, Math.floor(sourceDuration));
      ready = true;
    } catch (cause) { if (current === request) error = cause instanceof Error ? cause.message : 'This audio format could not be decoded. Try WAV, MP3, Ogg or FLAC.'; }
    finally { if (current === request) loading = false; }
  }
  async function preview(length: number, full = false) {
    error = ''; activePreview = length;
    try { if (full) await player.playExcerpt(cue, length); else await player.playClip(cue, length); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Playback could not start.'; }
  }
  function quoteShell(value: string) { return "'" + value.replaceAll("'", "'\\''") + "'"; }
  function saveMetadata() {
    if (!valid) return;
    const track: Track = {
      id: id.trim(), workId: workId.trim(), composer: composer.trim(), work: work.trim(),
      ...(movement.trim() ? { movement: movement.trim() } : {}), aliases: aliases.split('\n').map((s) => s.trim()).filter(Boolean),
      audioUrl: `/audio/${id.trim()}.opus`, cueStart: cue, excerptDuration: excerptLength,
      source: { name: sourceLabel.trim(), url: sourceUrl.trim(), ...(performer.trim() ? { performer: performer.trim() } : {}), license, licenseUrl: license === 'cc0' ? 'https://creativecommons.org/publicdomain/zero/1.0/' : 'https://creativecommons.org/publicdomain/mark/1.0/' }
    };
    exported = JSON.stringify(track, null, 2);
    command = `scripts/make-excerpt.sh ${quoteShell(sourceName)} ${cue} ${quoteShell(`static/audio/${id}.opus`)} ${excerptLength}`;
    const url = URL.createObjectURL(new Blob([exported], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${id}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice = 'Metadata downloaded. Run the command below locally to generate the Opus excerpt.';
  }
  onMount(() => {
    player = new WebAudioPlayer(); player.onPlayback = (event) => { playing = event.playing; };
    return () => { request++; player.dispose(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  });
</script>
<svelte:head><title>Admin — Curate recordings</title><meta name="robots" content="noindex, nofollow"/></svelte:head>
<main class="curation">
  <header><h1>Curate a recording<span style="color:var(--gold)">.</span></h1><a class="back" href="/"><ArrowLeft size={15}/> Back to game</a></header>
  <section class="section"><h2>Recording &amp; cue</h2><label for="recording">Original local recording<input id="recording" type="file" accept="audio/*,.flac,.opus,.ogg,.wav,.mp3,.m4a" onchange={loadFile}/></label>
    {#if loading}<p class="muted" role="status">Decoding recording…</p>{/if}
    {#if ready}<div class="cue-header"><strong>{stamp(cue)}</strong><span class="muted">Source length {stamp(sourceDuration)}</span></div><label for="cue-slider">Cue position</label><input id="cue-slider" type="range" min="0" max={maxCue} step="0.01" bind:value={cue} oninput={adjustCue}/><div class="form-grid" style="margin-top:20px"><label for="cue">Cue timestamp (seconds)<input id="cue" type="number" min="0" max={maxCue} step="0.01" bind:value={cue} oninput={adjustCue}/></label><label for="length">Excerpt length (seconds)<input id="length" type="number" min="30" max={Math.min(45, Math.floor(sourceDuration))} bind:value={excerptLength} oninput={adjustCue}/></label></div>
    <div class="preview-buttons">{#each stages as stage}<button class="secondary" class:active={playing && activePreview === stage.duration} onclick={() => preview(stage.duration)}>{stage.duration}s</button>{/each}<button class="primary" onclick={() => preview(excerptLength, true)}>Full {excerptLength}s excerpt</button><button class="secondary" disabled={!playing} onclick={() => player.stop()}><Square size={14}/> Stop</button></div>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </section>
  <section class="section"><h2>Work &amp; source</h2><div class="form-grid">
    <label for="composer">Composer<input id="composer" bind:value={composer} placeholder="Antonín Dvořák"/></label><label for="title">Work<input id="title" bind:value={work} placeholder="Symphony No. 9"/></label><label for="movement">Movement (optional)<input id="movement" bind:value={movement} placeholder="II. Largo"/></label><label for="work-id">Work ID<input id="work-id" bind:value={workId} placeholder="dvorak-new-world"/></label><label class="full" for="aliases">Aliases (one per line)<textarea id="aliases" bind:value={aliases} rows="3" placeholder="new world&#10;dvorak 9"></textarea></label><label for="asset-id">Asset ID (use a new version when changing the cue)<input id="asset-id" bind:value={id} pattern="[a-z0-9][a-z0-9-]*" placeholder="f3d71a-v2"/></label><label for="performer">Performer (optional)<input id="performer" bind:value={performer}/></label><label for="source-label">Source name<input id="source-label" bind:value={sourceLabel} placeholder="Musopen / Wikimedia Commons"/></label><label for="license">Recording licence<select id="license" bind:value={license}><option value="cc0">CC0 1.0</option><option value="public-domain">Public Domain</option></select></label><label class="full" for="source-url">Recording source page with explicit licence<input id="source-url" type="url" bind:value={sourceUrl} placeholder="https://commons.wikimedia.org/wiki/File:…"/></label>
  </div><p class="muted small">Verify the recording licence on the source page. Public domain sheet music alone does not establish a recording’s licence.</p><div class="actions"><button class="primary" disabled={!valid} onclick={saveMetadata}><Download size={16}/> Save metadata</button></div><p class="notice" aria-live="polite">{notice}</p></section>
  {#if exported}<section class="section"><h2>Generate the game asset</h2><pre>{command}</pre><details><summary>Track metadata</summary><pre>{exported}</pre></details></section>{/if}
</main>
