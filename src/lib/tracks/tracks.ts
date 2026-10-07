import catalogue from './catalogue.json';
import type { Track } from './types';
export const tracks = catalogue as Track[];
export const workOptions = [...new Map(tracks.map((track) => [track.workId, {
  id: track.workId, label: `${track.composer} — ${track.work}`,
  title: track.work.replace(/, ((?:Op\.|BWV|D\.|S\.|B\.|WoO|K\.)\s*\d.*)$/, ''),
  composer: track.composer,
  reference: track.work.match(/, ((?:Op\.|BWV|D\.|S\.|B\.|WoO|K\.)\s*\d.*)$/)?.[1] ?? ''
}])).values()].sort((a, b) => a.label.localeCompare(b.label));
