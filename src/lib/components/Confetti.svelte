<script lang="ts">
  const colors = ['#c9af70', '#eee9d9', '#83b99b', '#e4c58a', '#bc8e79'];
  const pieces = Array.from({ length: 64 }, (_, i) => ({
    x: ((i * 37) % 101 - 50) * 0.95,
    rise: -12 - (i * 13) % 22,
    spin: (i % 2 ? -1 : 1) * (280 + (i * 43) % 540),
    delay: (i % 8) * 22,
    duration: 1500 + (i * 79) % 700,
    color: colors[i % colors.length],
    round: i % 4 === 0
  }));
</script>

<div class="confetti" aria-hidden="true">
  {#each pieces as piece}
    <i class:round={piece.round} style={`--drift:${piece.x}vw;--rise:${piece.rise}vh;--spin:${piece.spin}deg;--delay:${piece.delay}ms;--duration:${piece.duration}ms;background:${piece.color}`}></i>
  {/each}
</div>

<style>
  .confetti{position:fixed;inset:0;z-index:30;pointer-events:none;overflow:hidden}
  i{position:absolute;left:50%;top:42%;width:7px;height:11px;opacity:0;animation:confetti-fall var(--duration) var(--delay) cubic-bezier(.15,.55,.5,1) both}
  i.round{width:7px;height:7px;border-radius:50%}
  @keyframes confetti-fall{
    0%{opacity:0;transform:translate(0,0) rotate(0deg)}
    8%{opacity:1}
    30%{opacity:1;transform:translate(calc(var(--drift) * .45),var(--rise)) rotate(calc(var(--spin) * .35))}
    100%{opacity:0;transform:translate(var(--drift),65vh) rotate(var(--spin))}
  }
  @media(prefers-reduced-motion:reduce){.confetti{display:none}}
</style>
