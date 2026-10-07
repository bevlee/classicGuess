import catalogue from './catalogue.json';
import type { Track } from './types';
export const tracks = catalogue as Track[];
export const workOptions = [...new Map(tracks.map((track) => [track.workId, {
  id: track.workId, label: `${track.composer} — ${track.work}`
}])).values()].sort((a, b) => a.label.localeCompare(b.label));
