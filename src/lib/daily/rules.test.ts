import { describe, it, expect } from 'vitest';
import { aestDate, nextReset, scoreDailyRounds, validateName, isChallengeDate } from './rules';
import { tracks } from '#lib/tracks/tracks';
import { makeWorkBag } from '#lib/game/game';
import { restoreDaily } from './session';
const pieces = makeWorkBag(tracks, undefined, () => .999).slice(0, 5);
const correct = pieces.map(piece => ({ trackId: piece.id, guesses: [piece.workId] }));

describe('daily challenge rules', () => {
  it('uses fixed AEST midnight, including during Sydney daylight saving', () => {
    expect(aestDate(new Date('2026-10-07T13:59:59Z'))).toBe('2026-10-07');
    expect(aestDate(new Date('2026-10-07T14:00:00Z'))).toBe('2026-10-08');
    expect(nextReset('2026-10-08')).toBe('2026-10-08T14:00:00.000Z');
    expect(nextReset('2026-12-31')).toBe('2026-12-31T14:00:00.000Z');
    expect(isChallengeDate('2026-02-30')).toBe(false);
    expect(isChallengeDate('2026-10-08')).toBe(true);
  });
  it('accepts Unicode letters and spaces, up to 50 characters', () => {
    expect(validateName('  Frédéric  Chopin  ')).toBe('Frédéric Chopin');
    expect(validateName('李 白')).toBe('李 白');
    expect(validateName('A'.repeat(50))).toHaveLength(50);
    for (const name of ['', '   ', 'Name123', '<script>', 'A'.repeat(51), 'Name\nName']) expect(() => validateName(name)).toThrow();
  });
  it('recomputes all five stage scores and rejects incomplete or extra histories', () => {
    const rounds = pieces.map((piece, index) => ({ trackId: piece.id, guesses: [...Array(index).fill(''), piece.workId] }));
    expect(scoreDailyRounds(rounds, pieces).scores).toEqual([1000, 800, 600, 400, 200]);
    expect(scoreDailyRounds(rounds, pieces).total).toBe(3000);
    expect(scoreDailyRounds(pieces.map(piece => ({ trackId: piece.id, guesses: Array(5).fill('') })), pieces).total).toBe(0);
    expect(() => scoreDailyRounds(correct.slice(0, 4), pieces)).toThrow();
    expect(() => scoreDailyRounds([{ ...correct[0], guesses: ['', ''] }, ...correct.slice(1)], pieces)).toThrow();
    expect(() => scoreDailyRounds([{ ...correct[0], guesses: [pieces[0].workId, 'extra'] }, ...correct.slice(1)], pieces)).toThrow();
    expect(() => scoreDailyRounds([...correct].reverse(), pieces)).toThrow();
    expect(() => scoreDailyRounds([{ ...correct[0], guesses: [' '] }, ...correct.slice(1)], pieces)).toThrow();
  });
  it('selects each work once, and avoids an immediate repeat at cycle boundaries', () => {
    const bag = makeWorkBag(tracks, undefined, () => .999);
    expect(new Set(bag.map(piece => piece.workId)).size).toBe(bag.length);
    expect(bag.length).toBe(new Set(tracks.map(piece => piece.workId)).size);
    expect(makeWorkBag(tracks, bag[0].workId, () => .999)[0].workId).not.toBe(bag[0].workId);
  });
  it('restores a coherent run and ignores saved score or stage manipulation', () => {
    const challenge = { id: 'test', date: '2026-10-08', scoringVersion: 1, token: 'test', pieces };
    const saved = { challenge, rounds: correct.slice(0, 1), scores: [1234], currentRound: {
      trackId: pieces[1].id, guesses: ['', ''], stageIndex: 4, score: 1000, status: 'guessing'
    }, name: 'Test', finished: false };
    const restored = restoreDaily(JSON.stringify(saved), tracks, challenge.date)!;
    expect(restored.scores).toEqual([1000]);
    expect(restored.currentRound.stageIndex).toBe(2);
    expect(restoreDaily('{broken', tracks, challenge.date)).toBeNull();
    expect(restoreDaily(JSON.stringify(saved), tracks, '2026-10-09')).toBeNull();
    expect(restoreDaily(JSON.stringify({ ...saved, currentRound: { trackId: pieces[3].id, guesses: [] } }), tracks, challenge.date)).toBeNull();
  });
});
