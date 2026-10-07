import type { Track } from '#lib/tracks/types';
import { stages } from './stages';
import { matchesWork } from './matching';
import type { RoundState } from './types';
export function createRound(trackId: string): RoundState {
  return { trackId, status: 'loading', stageIndex: 0, score: 0, guesses: [], solved: false };
}
export function readyRound(round: RoundState): RoundState { return { ...round, status: 'guessing' }; }
function advance(round: RoundState): RoundState {
  return round.stageIndex === stages.length - 1
    ? { ...round, status: 'revealed', score: 0 }
    : { ...round, stageIndex: round.stageIndex + 1 };
}
export function submitGuess(round: RoundState, guess: string, track: Track): RoundState {
  if (round.status !== 'guessing' || !guess.trim()) return round;
  const updated = { ...round, guesses: [...round.guesses, guess] };
  return matchesWork(guess, track)
    ? { ...updated, solved: true, status: 'revealed', score: stages[round.stageIndex].score }
    : advance(updated);
}
export function skipStage(round: RoundState): RoundState {
  return round.status === 'guessing' ? advance({ ...round, guesses: [...round.guesses, ''] }) : round;
}
/** A shuffled bag avoids repeats until every track has been played. */
export function shuffleTracks(tracks: readonly Track[], random = Math.random): Track[] {
  const result = [...tracks];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function makeBag(tracks: readonly Track[], previousId?: string): Track[] {
  const bag = shuffleTracks(tracks);
  if (bag.length > 1 && bag[0].id === previousId) [bag[0], bag[1]] = [bag[1], bag[0]];
  return bag;
}

/** One excerpt per distinct work in a cycle, including works with several movements. */
export function makeWorkBag(tracks: readonly Track[], previousWorkId?: string, random = Math.random): Track[] {
  const groups = new Map<string, Track[]>();
  for (const track of tracks) groups.set(track.workId, [...(groups.get(track.workId) ?? []), track]);
  const selected = [...groups.values()].map(group => group[Math.floor(random() * group.length)]);
  const bag = shuffleTracks(selected, random);
  if (bag.length > 1 && bag[0].workId === previousWorkId) [bag[0], bag[1]] = [bag[1], bag[0]];
  return bag;
}
