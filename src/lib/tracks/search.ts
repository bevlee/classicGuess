import { normalizeGuess } from '#lib/game/matching';
import { tracks, workOptions } from './tracks';

export const normalizeSearch = (text: string) => normalizeGuess(text)
  .replace(/\bopus\b/g, 'op').replace(/\bop(?:us)?\s*(?=\d)/g, 'op ');

const searchable = workOptions.map(work => {
  const phrases = [work.label, ...tracks.filter(track => track.workId === work.id).flatMap(track => track.aliases)].map(normalizeSearch);
  return { ...work, phrases, words: [...new Set(phrases.flatMap(phrase => phrase.split(' ')))] };
});

/** Edit distance including adjacent swapped letters, e.g. chpoin → chopin. */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

function wordScore(query: string, word: string): number {
  if (query === word) return 0;
  // Numbers identify distinct works; never approximate an opus or work number.
  if (/\d/.test(query)) return Infinity;
  if (word.startsWith(query)) return 0.1;
  if (word.includes(query)) return 0.2;
  // Keep very short searches precise and require a close spelling for longer ones.
  if (query.length < 4 || /\d/.test(word)) return Infinity;
  const limit = query.length >= 7 ? 2 : 1;
  if (Math.abs(query.length - word.length) > limit) return Infinity;
  const distance = editDistance(query, word);
  return distance <= limit ? 2 + distance : Infinity;
}

export function searchWorks(text: string) {
  const query = normalizeSearch(text);
  if (!query) return [];
  const tokens = query.split(' ');
  return searchable.map(work => {
    const scores = tokens.map(token => Math.min(...work.words.map(word => wordScore(token, word))));
    const fuzzy = scores.some(score => score >= 2);
    const score = scores.reduce((sum, value) => sum + value, 0);
    return { id: work.id, label: work.label, title: work.title, composer: work.composer, reference: work.reference, fuzzy, score };
  }).filter(work => Number.isFinite(work.score))
    .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
}
