import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { aestDate, isChallengeDate } from '#lib/daily/rules';
import { database } from '#lib/server/db';
import { apiFailure } from '#lib/server/api';
export const GET: RequestHandler = async ({ url }) => {
  const date = url.searchParams.get('date') ?? aestDate();
  if (!isChallengeDate(date)) error(400, 'Use a date in YYYY-MM-DD format.');
  try {
    const result = await database().query(`SELECT r.id, r.display_name AS name, r.total_score AS score,
      rank() OVER (ORDER BY r.total_score DESC)::int AS rank,
      count(*) OVER ()::int AS total_entries
      FROM daily_results r JOIN daily_challenges c ON c.id = r.challenge_id
      WHERE c.challenge_date = $1
      ORDER BY r.total_score DESC, r.submitted_at, r.id LIMIT 50`, [date]);
    return json({ date, totalEntries: result.rows[0]?.total_entries ?? 0,
      entries: result.rows.map(({ id, name, score, rank }) => ({ id, name, score, rank }))
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) { apiFailure(cause); }
};
