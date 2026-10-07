import type { Track } from '#lib/tracks/types';
export function normalizeGuess(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function matchesWork(guess: string, track: Track): boolean {
  const normalized = normalizeGuess(guess);
  if (!normalized) return false;
  return [track.workId, track.work, `${track.composer} ${track.work}`, ...track.aliases]
    .some((alias) => normalizeGuess(alias) === normalized);
}
