import { randomUUID } from 'node:crypto';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { scoreDailyRounds, validateName } from '#lib/daily/rules';
import { verifyRunToken } from '#lib/server/token';
import { readChallenge } from '#lib/server/daily';
import { database } from '#lib/server/db';
import { apiFailure } from '#lib/server/api';

export const POST: RequestHandler = async ({ request, url }) => {
  if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) error(403, 'Submit from the game page.');
  if (!request.headers.get('content-type')?.startsWith('application/json')) error(415, 'Send a JSON result.');
  const bodyText = await request.text();
  if (bodyText.length > 20000) error(413, 'The result is too large.');
  let body;
  try { body = JSON.parse(bodyText); } catch { error(400, 'Invalid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) error(400, 'Invalid result.');
  try {
    const token = verifyRunToken(body.token);
    const challenge = await readChallenge(token.challengeId);
    let name, evaluated;
    try { name = validateName(body.name); evaluated = scoreDailyRounds(body.rounds, challenge.pieces); }
    catch (cause) { error(400, cause instanceof Error ? cause.message : 'Invalid result.'); }
    const id = randomUUID();
    const inserted = await database().query(`INSERT INTO daily_results
      (id, challenge_id, display_name, total_score, round_details, run_token_hash)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (run_token_hash) DO NOTHING RETURNING id`,
      [id, challenge.id, name, evaluated.total, JSON.stringify(evaluated.rounds), token.hash]);
    let resultId = id;
    if (!inserted.rowCount) {
      // A lost response can be retried safely without creating another leaderboard entry.
      const previous = await database().query('SELECT id, display_name, total_score, round_details FROM daily_results WHERE run_token_hash = $1', [token.hash]);
      const entry = previous.rows[0];
      if (!entry || entry.display_name !== name || entry.round_details.some((round: { trackId: string; guesses: string[] }, index: number) => round.trackId !== evaluated.rounds[index].trackId || JSON.stringify(round.guesses) !== JSON.stringify(evaluated.rounds[index].guesses))) error(409, 'This run has already been submitted.');
      resultId = entry.id;
    }
    const rank = await database().query('SELECT count(*)::int + 1 AS rank FROM daily_results WHERE challenge_id = $1 AND total_score > $2', [challenge.id, evaluated.total]);
    return json({ id: resultId, name, score: evaluated.total, rank: rank.rows[0].rank }, { status: inserted.rowCount ? 201 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) { apiFailure(cause); }
};
