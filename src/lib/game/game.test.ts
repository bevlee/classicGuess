import { describe, it, expect } from 'vitest';
import { tracks } from '#lib/tracks/tracks';
import { createRound, readyRound, submitGuess, skipStage, shuffleTracks, makeBag } from './game';
import { matchesWork, normalizeGuess } from './matching';
import { stages } from './stages';
const track = tracks[0];
const fresh = () => readyRound(createRound(track.id));
describe('practice rounds', () => {
  it('awards each score tier and accepts work IDs from the dropdown', () => {
    stages.forEach((stage, i) => {
      let round = fresh();
      for (let j = 0; j < i; j++) round = skipStage(round);
      const solved = submitGuess(round, track.workId, track);
      expect(solved.status).toBe('revealed'); expect(solved.solved).toBe(true); expect(solved.score).toBe(stage.score);
      expect(submitGuess(solved, track.workId, track)).toBe(solved);
      expect(skipStage(solved)).toBe(solved);
    });
  });
  it('consumes exactly one tier per wrong answer or skip and reveals after the fifth attempt', () => {
    let round = fresh();
    for (let i = 0; i < 5; i++) {
      round = i % 2 ? skipStage(round) : submitGuess(round, 'incorrect', track);
      expect(round.stageIndex).toBe(Math.min(i + 1, 4));
      expect(round.status).toBe(i === 4 ? 'revealed' : 'guessing');
    }
    expect(round.score).toBe(0); expect(round.guesses).toHaveLength(5);
  });
  it('does not consume a tier for an empty answer or while loading', () => {
    const round = fresh(); expect(submitGuess(round, '  ', track)).toBe(round);
    const loading = createRound(track.id); expect(skipStage(loading)).toBe(loading); expect(submitGuess(loading, track.workId, track)).toBe(loading);
  });
  it('matches accents and aliases but does not accept composer alone or unrelated work', () => {
    const dvorak = tracks.find(t => t.workId === 'dvorak-new-world')!;
    expect(normalizeGuess('  Dvořák—9! ')).toBe('dvorak 9');
    expect(matchesWork('NEW WORLD', dvorak)).toBe(true);
    expect(matchesWork('Dvořák 9', dvorak)).toBe(true);
    expect(matchesWork('Dvořák', dvorak)).toBe(false);
    expect(matchesWork('new', dvorak)).toBe(false);
  });
  it('accepts the same work for all Moonlight movements and distinguishes Chopin nocturnes', () => {
    const moonlight = tracks.filter(t => t.workId === 'beethoven-moonlight');
    expect(moonlight).toHaveLength(3);
    for (const movement of moonlight) expect(matchesWork('moonlight sonata', movement)).toBe(true);
    const nocturnes = tracks.filter(t => t.workId.startsWith('chopin-nocturne'));
    expect(nocturnes).toHaveLength(21);
    expect(new Set(nocturnes.map(t => t.workId)).size).toBe(21);
    const first = nocturnes[0], second = nocturnes[1];
    expect(matchesWork(first.workId, second)).toBe(false);
    expect(matchesWork(first.work, second)).toBe(false);
  });
  it('creates complete bags without repeats, preserves catalogue, and avoids a boundary repeat', () => {
    const bag = shuffleTracks(tracks, () => 0);
    expect(new Set(bag.map(t => t.id)).size).toBe(tracks.length);
    expect(tracks[0]).toBe(track);
    for (let i = 0; i < 30; i++) expect(makeBag(tracks, track.id)[0].id).not.toBe(track.id);
  });
});
