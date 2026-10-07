import { json } from '@sveltejs/kit';
import { aestDate, nextReset } from '#lib/daily/rules';
import { getOrCreateChallenge } from '#lib/server/daily';
import { createRunToken } from '#lib/server/token';
import { apiFailure } from '#lib/server/api';

export async function GET() {
  try {
    const challenge = await getOrCreateChallenge(aestDate());
    return json({ id: challenge.id, date: challenge.date, resetAt: nextReset(challenge.date),
      scoringVersion: challenge.scoringVersion, token: createRunToken(challenge.id),
      pieces: challenge.pieces.map(({ id, audioUrl, excerptDuration }) => ({ id, audioUrl, excerptDuration }))
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) { apiFailure(cause); }
}
