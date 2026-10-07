import { describe, expect, it } from 'vitest';
import { searchWorks } from './search';

describe('catalogue search', () => {
  it('tolerates misspellings and adjacent swapped letters', () => {
    expect(searchWorks('beethovan moonlght')[0]?.id).toBe('beethoven-moonlight');
    expect(searchWorks('chpoin nocturn opus48').map(work => work.id)).toHaveLength(2);
    expect(searchWorks('chpoin nocturn opus48').every(work => work.label.includes('Op. 48'))).toBe(true);
  });
  it('ranks literal matches ahead of approximate ones', () => {
    const results = searchWorks('impromptus');
    expect(results.some(work => work.fuzzy)).toBe(true);
    const firstFuzzy = results.findIndex(work => work.fuzzy);
    expect(results.slice(firstFuzzy).every(work => work.fuzzy)).toBe(true);
    expect(results[0].id).toBe('schubert-d946');
  });
  it('keeps numbers precise and returns all matching nocturnes', () => {
    expect(searchWorks('nocturne')).toHaveLength(21);
    expect(searchWorks('nocturne op 48')).toHaveLength(2);
    expect(searchWorks('nocturne op 84')).toEqual([]);
    expect(searchWorks('nocturne op 4')).toEqual([]);
    expect(searchWorks('')).toEqual([]);
  });
  it('preserves accents, aliases, partial words and reordered queries', () => {
    expect(searchWorks('dvorak new world')[0]?.id).toBe('dvorak-new-world');
    expect(searchWorks('48 chopin noct')[0]?.label).toContain('Op. 48');
    expect(searchWorks('goldberg')[0]?.id).toBe('bach-goldberg');
    expect(searchWorks('xy')).toEqual([]);
  });
});
