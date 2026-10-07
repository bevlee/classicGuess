import { test, expect } from '@playwright/test';
import catalogue from '../src/lib/tracks/catalogue.json' with { type: 'json' };
import type { DailyChallenge } from '../src/lib/daily/types';
const configured = Boolean(process.env.DATABASE_URL || process.env.TEST_DATABASE_URL);

test.describe('Postgres daily challenges', () => {
  test.skip(!configured, 'Set DATABASE_URL or TEST_DATABASE_URL and migrate the database to run integration checks.');

  test('publishes one challenge under concurrent requests, validates histories and ranks ties', async ({ request }) => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => request.get('/api/daily')));
    for (const response of responses) expect(response.ok()).toBe(true);
    const days: DailyChallenge[] = await Promise.all(responses.map(response => response.json()));
    expect(new Set(days.map(day => day.id)).size).toBe(1);
    expect(new Set(days.map(day => day.token)).size).toBe(8);
    const day = days[0];
    expect(day.pieces).toHaveLength(5);
    expect(new Set(day.pieces.map(piece => catalogue.find(track => track.id === piece.id)!.workId)).size).toBe(5);
    expect(day.pieces[0]).not.toHaveProperty('work');
    const rounds = day.pieces.map(piece => ({ trackId: piece.id, guesses: [catalogue.find(track => track.id === piece.id)!.workId] }));
    const post = (body: unknown) => request.post('/api/daily/results', { data: body });
    expect((await post({ token: day.token, name: 'Incomplete', rounds: rounds.slice(0, 4) })).status()).toBe(400);
    expect((await post({ token: day.token + 'tampered', name: 'Invalid', rounds })).status()).toBe(400);
    expect((await post({ token: day.token, name: 'Invalid123', rounds })).status()).toBe(400);
    expect((await post({ token: day.token, name: 'X'.repeat(51), rounds })).status()).toBe(400);
    const scored = await post({ token: day.token, name: 'Test Winner', score: 0, rounds });
    expect(scored.status()).toBe(201);
    const winner = await scored.json();
    expect(winner.score).toBe(5000); expect(winner.rank).toBe(1);
    const repeat = await post({ token: day.token, name: 'Test Winner', rounds });
    expect(repeat.status()).toBe(200); expect((await repeat.json()).id).toBe(winner.id);
    expect((await post({ token: day.token, name: 'Changed Name', rounds })).status()).toBe(409);
    const tied = await post({ token: days[1].token, name: 'Frédéric Test', rounds });
    expect((await tied.json()).rank).toBe(1);
    const zero = await post({ token: days[2].token, name: 'Test Learner', score: 5000,
      rounds: day.pieces.map(piece => ({ trackId: piece.id, guesses: Array(5).fill('') })) });
    expect((await zero.json()).score).toBe(0);
    const board = await (await request.get(`/api/leaderboard?date=${day.date}`)).json();
    expect(board.entries.find((entry: { id: string }) => entry.id === winner.id)?.rank).toBe(1);
    expect(board.entries.filter((entry: { id: string }) => entry.id === winner.id)).toHaveLength(1);
    expect((await request.get('/api/leaderboard?date=2026-02-30')).status()).toBe(400);
    expect((await request.get('/api/leaderboard?date=2000-01-01')).ok()).toBe(true);
  });

  test('plays five pieces locally, resumes on refresh, then submits a name', async ({ page }) => {
    const submissions: string[] = [];
    let day: DailyChallenge;
    page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/daily/results')) submissions.push(request.url()); });
    page.on('response', response => { if (new URL(response.url()).pathname === '/api/daily') void response.json().then(data => { day = data; }); });
    await page.goto('/');
    await page.getByRole('button', { name: 'Daily challenge', exact: true }).click();
    const input = page.getByRole('combobox', { name: 'Which work do you hear?' });
    await expect(input).toBeEnabled();
    await expect(page.locator('#player-name')).toHaveCount(0);
    await expect(input).toBeFocused();
    await expect(page.getByRole('region', { name: 'Daily leaderboard' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'View leaderboard' })).toHaveCount(0);
    await expect(page.locator('.daily-progress li')).toHaveCount(5);
    await expect(page.locator('.daily-progress [aria-current=step]')).toHaveAttribute('aria-label', 'Piece 1: current');
    await page.getByRole('button', { name: 'Hear more' }).click();
    await page.reload();
    await expect(input).toBeEnabled();
    await expect(page.locator('.stage.active')).toHaveText('0.5s');
    for (let i = 0; i < 5; i++) {
      await expect(input).toBeEnabled();
      const work = catalogue.find(track => track.id === day.pieces[i].id)!;
      await input.fill(work.work); await page.getByRole('button', { name: 'Guess', exact: true }).click();
      await expect(page.locator('.answer h2')).toHaveText(work.work);
      await expect(page.locator('.daily-progress .completed')).toHaveCount(i + 1);
      await expect(page.getByRole('button', { name: i === 4 ? 'See your score' : 'Next piece', exact: true })).toBeFocused();
      expect(submissions).toHaveLength(0);
      await page.getByRole('button', { name: i === 4 ? 'See your score' : 'Next piece', exact: true }).click();
    }
    await expect(page.getByRole('region', { name: 'Daily challenge results' })).toBeVisible();
    await expect(page.locator('.daily-total')).toContainText('4,800');
    await expect(page.getByRole('region', { name: 'Daily leaderboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View leaderboard' })).toBeVisible();
    expect(submissions).toHaveLength(0);
    await page.locator('#player-name').fill('Name123');
    await page.getByRole('button', { name: 'Submit score' }).click();
    await expect(page.getByRole('alert')).toContainText('letters and spaces');
    expect(submissions).toHaveLength(0);
    await page.locator('#player-name').fill('Daily Browser Test');
    await page.getByRole('button', { name: 'Submit score' }).click();
    await expect(page.locator('.submission-success')).toContainText('Daily Browser Test');
    expect(submissions).toHaveLength(1);
    await page.reload();
    await expect(page.locator('.submission-success')).toContainText('Daily Browser Test');
    await expect(page.locator('#player-name')).toHaveCount(0);
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/daily-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Keep practising' }).click();
    await expect(input).toBeEnabled();
    await expect(page.getByText('Daily points / 5,000')).toHaveCount(0);
  });
});
