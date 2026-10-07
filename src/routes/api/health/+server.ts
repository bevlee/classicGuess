import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { database } from '#lib/server/db';
import { apiFailure } from '#lib/server/api';
export const GET: RequestHandler = async ({ url }) => {
  if (url.searchParams.get('ready') === '1') {
    try { await database().query('SELECT id FROM daily_challenges LIMIT 1'); }
    catch (cause) { apiFailure(cause); }
  }
  return json({ status: 'ok' });
};
