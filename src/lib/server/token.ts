import { createHmac, randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import { DAILY_TOKEN_SECRET } from '$app/env/private';
import { error } from '@sveltejs/kit';
function secret(): string {
  if (!DAILY_TOKEN_SECRET || DAILY_TOKEN_SECRET.length < 32) error(503, 'Daily challenges are not configured yet. Practice is available.');
  return DAILY_TOKEN_SECRET;
}
export function createRunToken(challengeId: string): string {
  const body = Buffer.from(JSON.stringify({ challengeId, runId: randomUUID(), version: 1 })).toString('base64url');
  return `${body}.${createHmac('sha256', secret()).update(body).digest('base64url')}`;
}
export function verifyRunToken(token: unknown): { challengeId: string; hash: string } {
  if (typeof token !== 'string' || token.length > 1000) error(400, 'Invalid challenge token.');
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) error(400, 'Invalid challenge token.');
  const expected = createHmac('sha256', secret()).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) error(400, 'Invalid challenge token.');
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { error(400, 'Invalid challenge token.'); }
  if (payload?.version !== 1 || typeof payload.challengeId !== 'string' || !/^[0-9a-f-]{36}$/.test(payload.challengeId) || typeof payload.runId !== 'string') error(400, 'Invalid challenge token.');
  return { challengeId: payload.challengeId, hash: createHash('sha256').update(token).digest('hex') };
}
