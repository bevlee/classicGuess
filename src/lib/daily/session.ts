import { createRound, readyRound, submitGuess, skipStage } from '#lib/game/game';
import type { RoundState } from '#lib/game/types';
import type { Track } from '#lib/tracks/types';
import type { DailyChallenge, DailyRound, DailyResult } from './types';
import { isChallengeDate, SCORING_VERSION } from './rules';

export interface SavedDaily {
  challenge: DailyChallenge;
  rounds: DailyRound[];
  scores: number[];
  currentRound: RoundState;
  finished: boolean;
  submitted: DailyResult | null;
  name: string;
}
function replay(input: unknown, track: Track): RoundState {
  if (!Array.isArray(input) || input.length > 5) throw new Error('Invalid history');
  let round = readyRound(createRound(track.id));
  for (const guess of input) {
    if (typeof guess !== 'string' || guess.length > 300 || round.status !== 'guessing' || (guess !== '' && !guess.trim())) throw new Error('Invalid guess');
    round = guess === '' ? skipStage(round) : submitGuess(round, guess, track);
  }
  return round;
}
/** Restore only coherent histories, deriving scores and stages rather than trusting saved totals. */
export function restoreDaily(raw: string | null, catalogue: readonly Track[], today: string): SavedDaily | null {
  try {
    const saved = JSON.parse(raw ?? 'null');
    const challenge = saved?.challenge as DailyChallenge | undefined;
    if (!challenge || !isChallengeDate(challenge.date) || challenge.scoringVersion !== SCORING_VERSION ||
      typeof challenge.id !== 'string' || typeof challenge.token !== 'string' || !challenge.token || challenge.token.length > 1000 ||
      !Array.isArray(challenge.pieces) || challenge.pieces.length !== 5 || !Array.isArray(saved.rounds) || saved.rounds.length > 5) return null;
    if (challenge.date !== today && (saved.submitted || saved.rounds.length !== 5)) return null;
    const pieces = challenge.pieces.map(piece => catalogue.find(track => track.id === piece.id));
    if (pieces.some(piece => !piece) || new Set(pieces.map(piece => piece!.workId)).size !== 5) return null;
    const rounds: DailyRound[] = [];
    const scores: number[] = [];
    for (const [index, input] of saved.rounds.entries()) {
      const track = pieces[index]!;
      if (input.trackId !== track.id) return null;
      const round = replay(input.guesses, track);
      if (round.status !== 'revealed') return null;
      rounds.push({ trackId: track.id, guesses: round.guesses }); scores.push(round.score);
    }
    const currentIndex = challenge.pieces.findIndex(piece => piece.id === saved.currentRound?.trackId);
    if (currentIndex < 0) return null;
    const current = replay(saved.currentRound.guesses, pieces[currentIndex]!);
    if (current.status === 'revealed') {
      if (currentIndex !== rounds.length - 1 || JSON.stringify(current.guesses) !== JSON.stringify(rounds[currentIndex].guesses)) return null;
    } else if (currentIndex !== rounds.length) return null;
    const finished = Boolean(saved.finished && rounds.length === 5);
    const submitted = saved.submitted as DailyResult | null;
    if (submitted && (!finished || typeof submitted.id !== 'string' || typeof submitted.name !== 'string' || submitted.score !== scores.reduce((sum, score) => sum + score, 0) || !Number.isInteger(submitted.rank) || submitted.rank < 1)) return null;
    return { challenge, rounds, scores, currentRound: current, finished, submitted: submitted ?? null, name: typeof saved.name === 'string' ? saved.name.slice(0, 50) : '' };
  } catch { return null; }
}
