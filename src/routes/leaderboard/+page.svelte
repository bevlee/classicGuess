<script lang="ts">
  import Leaderboard from '../../lib/components/Leaderboard.svelte';
  import { aestDate, isChallengeDate } from '#lib/daily/rules';
  let date = $state(aestDate());
</script>
<svelte:head><title>Daily leaderboard — Guess the piano piece</title></svelte:head>
<main class="leaderboard-page">
  <a href="/">← Back to game</a>
  <label for="leaderboard-day">Challenge date (AEST)</label>
  <input id="leaderboard-day" type="date" bind:value={date} max={aestDate()}/>
  {#if isChallengeDate(date)}<Leaderboard {date}/>{/if}
</main>
