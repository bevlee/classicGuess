import { createRound, readyRound, skipStage, submitGuess } from '#lib/game/game';
import type { Track } from '#lib/tracks/types';
import type { DailyRound } from './types';

export const DAILY_PIECES = 5;
export const SCORING_VERSION = 1;
export const DAILY_MAX_SCORE = 5000;
export const AEST_OFFSET = 10 * 60 * 60 * 1000;
export function aestDate(now = new Date()): string {
  return new Date(now.getTime() + AEST_OFFSET).toISOString().slice(0, 10);
}
export function isChallengeDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function nextReset(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00+10:00`) + 24 * 60 * 60 * 1000).toISOString();
}
export function validateName(input: unknown): string {
  if (typeof input !== 'string') throw new Error('Enter a name using letters and spaces.');
  const name = input.normalize('NFC').trim().replace(/ +/g, ' ');
  if ([...name].length < 1 || [...name].length > 50 || !/^(?=.*\p{L})[\p{L}\p{M} ]+$/u.test(name)) {
    throw new Error('Use 1–50 characters, with letters and spaces only.');
  }
  return name;
}
/** Recompute from complete histories; never trust a submitted total. */
export function scoreDailyRounds(input: unknown, pieces: readonly Track[]) {
  if (!Array.isArray(input) || input.length !== DAILY_PIECES || pieces.length !== DAILY_PIECES) {
    throw new Error('Complete all five pieces before submitting.');
  }
  const rounds: DailyRound[] = [];
  const scores: number[] = [];
  for (let i = 0; i < DAILY_PIECES; i++) {
    const submitted = input[i];
    const piece = pieces[i];
    if (!submitted || submitted.trackId !== piece.id || !Array.isArray(submitted.guesses) || submitted.guesses.length < 1 || submitted.guesses.length > 5) {
      throw new Error('The round history does not match this challenge.');
    }
    let round = readyRound(createRound(piece.id));
    const guesses: string[] = [];
    for (const guess of submitted.guesses) {
      if (typeof guess !== 'string' || guess.length > 300 || (guess !== '' && !guess.trim()) || round.status !== 'guessing') {
        throw new Error('The round history contains an invalid guess.');
      }
      guesses.push(guess);
      round = guess === '' ? skipStage(round) : submitGuess(round, guess, piece);
    }
    if (round.status !== 'revealed') throw new Error('Complete all five pieces before submitting.');
    rounds.push({ trackId: piece.id, guesses });
    scores.push(round.score);
  }
  return { rounds, scores, total: scores.reduce((sum, score) => sum + score, 0) };
}
