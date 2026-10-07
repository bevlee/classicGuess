<script lang="ts">
  import type { Leaderboard } from '#lib/daily/types';
  let { date, refresh = '' } = $props<{ date: string; refresh?: string }>();
  let board = $state<Leaderboard | null>(null);
  let loading = $state(true);
  let error = $state('');
  let retry = $state(0);
  $effect(() => {
    const day = date; refresh; retry;
    const controller = new AbortController();
    loading = true; error = ''; board = null;
    void fetch(`/api/leaderboard?date=${encodeURIComponent(day)}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? 'The leaderboard could not be loaded.');
        if (!controller.signal.aborted) board = data;
      }).catch(cause => { if (!controller.signal.aborted) error = cause instanceof Error ? cause.message : 'The leaderboard could not be loaded.'; })
      .finally(() => { if (!controller.signal.aborted) loading = false; });
    return () => controller.abort();
  });
</script>
<section class="leaderboard" aria-label="Daily leaderboard">
  <h2>Leaderboard</h2>
  <p class="leaderboard-date">{date} · AEST</p>
  {#if loading}<p class="muted small">Loading leaderboard…</p>
  {:else if error}<p class="muted small">{error}</p><button class="secondary" onclick={() => retry++}>Retry leaderboard</button>
  {:else if board?.entries.length}
    <table><thead><tr><th scope="col">Rank</th><th scope="col">Name</th><th scope="col">Points</th></tr></thead>
      <tbody>{#each board.entries as entry}<tr class:your-result={entry.id === refresh}><td>{entry.rank}</td><th scope="row">{entry.name}</th><td>{entry.score.toLocaleString()}</td></tr>{/each}</tbody>
    </table>
  {:else}<p class="muted small">No scores yet. Finish all five pieces to add yours.</p>{/if}
</section>
