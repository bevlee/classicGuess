import { randomUUID, randomInt } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { database } from './db';
import { tracks } from '#lib/tracks/tracks';
import { makeWorkBag } from '#lib/game/game';
import { DAILY_PIECES, SCORING_VERSION } from '#lib/daily/rules';
import type { Track } from '#lib/tracks/types';

export interface StoredChallenge { id: string; date: string; scoringVersion: number; pieces: Track[]; }
export async function readChallenge(id: string): Promise<StoredChallenge> {
  const result = await database().query(
    `SELECT c.id, c.challenge_date::text AS date, c.scoring_version,
      jsonb_agg(p.track_snapshot ORDER BY p.position) AS pieces
     FROM daily_challenges c JOIN daily_challenge_pieces p ON p.challenge_id = c.id
     WHERE c.id = $1 GROUP BY c.id`, [id]);
  const row = result.rows[0];
  if (!row || row.pieces.length !== DAILY_PIECES) error(404, 'Challenge not found.');
  if (row.scoring_version !== SCORING_VERSION) error(409, 'This challenge uses an unsupported scoring version.');
  return { id: row.id, date: row.date, scoringVersion: row.scoring_version, pieces: row.pieces };
}
export async function getOrCreateChallenge(date: string): Promise<StoredChallenge> {
  const client = await database().connect();
  let id: string;
  try {
    await client.query('BEGIN');
    // Serialise publication across replicas; all five pieces are committed atomically.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`classicguess-daily-${date}`]);
    const existing = await client.query('SELECT id FROM daily_challenges WHERE challenge_date = $1', [date]);
    if (existing.rows[0]) id = existing.rows[0].id;
    else {
      id = randomUUID();
      const pieces = makeWorkBag(tracks, undefined, () => randomInt(0, 1_000_000) / 1_000_000).slice(0, DAILY_PIECES);
      if (pieces.length !== DAILY_PIECES) error(503, 'Not enough pieces are available for a daily challenge.');
      await client.query('INSERT INTO daily_challenges (id, challenge_date, scoring_version) VALUES ($1, $2, $3)', [id, date, SCORING_VERSION]);
      for (const [index, track] of pieces.entries()) {
        await client.query(`INSERT INTO daily_challenge_pieces (challenge_id, position, excerpt_id, work_id, track_snapshot)
          VALUES ($1, $2, $3, $4, $5)`, [id, index + 1, track.id, track.workId, JSON.stringify(track)]);
      }
    }
    await client.query('COMMIT');
  } catch (cause) { await client.query('ROLLBACK'); throw cause; }
  finally { client.release(); }
  return readChallenge(id);
}
