import { test, expect } from '@playwright/test';
import catalogue from '../src/lib/tracks/catalogue.json' with { type: 'json' };

test('practice audio timing, wrong guesses, reveal and next without cumulative points', async ({ page }) => {
  const errors: string[] = [];
  const fetched: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().endsWith('.opus')) fetched.push(r.url()); });
  await page.addInitScript(() => {
    const starts: number[][] = []; (window as unknown as { starts: number[][] }).starts = starts;
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const node = original.call(this), start = node.start.bind(node);
      node.start = (when = 0, offset = 0, duration?: number) => { starts.push([offset, duration ?? -1]); start(when, offset, duration); };
      return node;
    };
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play clip', exact: true })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'Which work do you hear?' })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Play clip', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { starts: number[][] }).starts[0])).toEqual([0, .1]);
  await expect(page.getByRole('button', { name: 'Play clip', exact: true })).toBeVisible();
  const current = catalogue.find(t => fetched[0].endsWith(t.audioUrl))!;
  const wrong = catalogue.find(t => t.workId !== current.workId)!;
  await page.locator('#work').fill(wrong.work); await page.getByRole('button', { name: 'Guess', exact: true }).click();
  await expect(page.locator('.stage.active')).toHaveText('0.5s');
  await page.getByRole('button', { name: 'Play clip', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { starts: number[][] }).starts[1])).toEqual([0, .5]);
  await page.locator('#work').fill(current.work); await page.getByRole('button', { name: 'Guess', exact: true }).click();
  await expect(page.locator('.answer h2')).toHaveText(current.work);
  await expect(page.locator('.stat strong')).toHaveText('1');
  await expect(page.locator('.timeline-labels')).toContainText('+800 points earned');
  await expect(page.getByText('Total points', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next piece' })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as unknown as { starts: number[][] }).starts[2]?.[0])).toBe(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { starts: number[][] }).starts[2]?.[1])).toBeGreaterThan(39);
  await page.getByRole('button', { name: 'Next piece' }).click(); await expect(page.locator('.stage.active')).toHaveText('0.1s');
  await expect(page.locator('#work')).toBeEnabled();
  for (const duration of [.5, 2, 8, 15]) {
    await page.getByRole('button', { name: 'Skip to a longer clip' }).click();
    await page.getByRole('button', { name: 'Play clip', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { starts: number[][] }).starts.at(-1))).toEqual([0, duration]);
  }
  await expect(page.locator('.stage.active')).toHaveText('15s'); await page.getByRole('button', { name: 'Skip & reveal' }).click();
  await expect(page.locator('.stat strong')).toHaveText('2');
  await page.reload(); await expect(page.locator('.stat strong')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('mobile fits, exposes all answers, and has no removed guidance', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/');
  await expect(page.locator('#work')).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByText('Listen again, as often as you like.')).toHaveCount(0);
  await expect(page.getByText('Trust your ear.')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

test('curation previews a local recording and exports validated metadata', async ({ page }) => {
  await page.goto('/admin'); await page.locator('#recording').setInputFiles('static/audio/a7c91e-v1.opus');
  await expect(page.getByRole('button', { name: '0.1s', exact: true })).toBeEnabled();
  await page.locator('#length').fill('30'); await page.locator('#cue').fill('5'); await page.getByRole('button', { name: '0.1s', exact: true }).click();
  await page.locator('#composer').fill('Johann Sebastian Bach'); await page.locator('#title').fill('Goldberg Variations');
  await page.locator('#work-id').fill('bach-goldberg'); await page.locator('#source-label').fill('Open Goldberg Variations');
  await page.locator('#source-url').fill(catalogue[0].source.url); await page.locator('#asset-id').fill('bach-preview-v1');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save metadata' }).click();
  expect((await download).suggestedFilename()).toBe('bach-preview-v1.json');
  await expect(page.locator('pre').first()).toContainText(" 5 'static/audio/bach-preview-v1.opus' 30");
});

test('load failures offer a retry and keep attempts intact', async ({ page }) => {
  await page.route('**/*.opus', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/'); await expect(page.getByRole('alert')).toContainText('503');
  await expect(page.locator('.stage.active')).toHaveText('0.1s'); await expect(page.locator('.stat strong')).toHaveText('0');
  await page.unroute('**/*.opus'); await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play clip', exact: true })).toBeEnabled();
});


test('every bundled excerpt decodes and has audible content', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async (urls) => {
    const context = new AudioContext();
    const values = [];
    for (const url of urls) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      const samples = buffer.getChannelData(0).slice(0, Math.floor(buffer.sampleRate * .1));
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      values.push({ duration: buffer.duration, rms });
    }
    await context.close();
    return values;
  }, catalogue.map(t => t.audioUrl));
  for (const result of results) { expect(result.duration).toBeGreaterThanOrEqual(39.9); expect(result.duration).toBeLessThan(40.1); expect(result.rms).toBeGreaterThan(.01); }
});


test('typed suggestions support accents, keyboard selection, editing and mobile layout', async ({ page }) => {
  await page.route('**/*.opus', route => route.fulfill({ path: 'static/audio/a7c91e-v1.opus', contentType: 'audio/ogg' }));
  await page.goto('/');
  const input = page.getByRole('combobox', { name: 'Which work do you hear?' });
  await expect(input).toBeEnabled();
  await input.fill('frederic chopin ballade');
  await expect(page.getByRole('option')).toHaveCount(4);
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(input).toHaveValue(/Chopin.*Ballade No. 1/);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.locator('.stage.active')).toHaveText('0.1s');
  await input.fill('goldberg');
  await page.getByRole('option', { name: /Goldberg/ }).click();
  await expect(input).toHaveValue(/Bach.*Goldberg/);
  await input.fill('no matching piece');
  await expect(page.getByRole('status')).toHaveText('No matching pieces. You can still submit your guess.');
  await expect(page.getByRole('button', { name: 'Guess', exact: true })).toBeEnabled();
  await input.press('Escape');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 375, height: 812 });
  await input.fill('chopin');
  await expect(page.getByRole('option')).toHaveCount(new Set(catalogue.filter(track => track.composer.includes('Chopin')).map(track => track.workId)).size);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/autocomplete-mobile.png', fullPage: true });
});


test('all nocturnes remain accessible and opus searches narrow the results', async ({ page }) => {
  await page.route('**/*.opus', route => route.fulfill({ path: 'static/audio/a7c91e-v1.opus', contentType: 'audio/ogg' }));
  await page.goto('/');
  const input = page.getByRole('combobox', { name: 'Which work do you hear?' });
  await expect(input).toBeEnabled();
  await input.fill('nocturne');
  const count = new Set(catalogue.filter(track => track.work.includes('Nocturne')).map(track => track.workId)).size;
  await expect(page.getByRole('option')).toHaveCount(count);
  await expect(page.getByRole('status')).toContainText(`${count} matching pieces`);
  const target = page.getByRole('option', { name: /C minor, Op. 48 No. 1/ });
  await expect(target).toHaveCount(1);
  const options = await page.getByRole('option').allTextContents();
  const index = options.findIndex(text => text.includes('C minor, Op. 48 No. 1'));
  for (let i = 0; i <= index; i++) await input.press('ArrowDown');
  await expect(target).toHaveAttribute('aria-selected', 'true');
  expect(await page.getByRole('listbox').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await input.press('Enter');
  await expect(input).toHaveValue(/C minor, Op. 48 No. 1/);
  for (const query of ['nocturne opus 48', 'op48', 'Op. 48', '48']) {
    await input.fill(query);
    await expect(page.getByRole('option')).toHaveCount(2);
  }
  await page.getByRole('option', { name: /F-sharp minor, Op. 48 No. 2/ }).click();
  await expect(input).toHaveValue(/F-sharp minor, Op. 48 No. 2/);
});


test('fuzzy suggestions tolerate typos but preserve opus numbers', async ({ page }) => {
  await page.route('**/*.opus', route => route.fulfill({ path: 'static/audio/a7c91e-v1.opus', contentType: 'audio/ogg' }));
  await page.goto('/');
  const input = page.getByRole('combobox', { name: 'Which work do you hear?' });
  await expect(input).toBeEnabled();
  await input.fill('chpoin nocturn opus48');
  await expect(page.getByRole('option')).toHaveCount(2);
  await expect(page.getByRole('option').first()).toContainText('Similar spelling');
  await page.getByRole('option', { name: /C minor, Op. 48 No. 1/ }).click();
  await expect(input).toHaveValue(/Chopin.*C minor, Op. 48 No. 1/);
  await input.fill('beethovan moonlght');
  await expect(page.getByRole('option')).toHaveCount(1);
  await input.press('ArrowDown'); await input.press('Enter');
  await expect(input).toHaveValue(/Beethoven.*Moonlight/);
  await input.fill('nocturn op84');
  await expect(page.getByRole('option')).toHaveCount(0);
});

test('guess effects celebrate success, distinguish misses, and respect reduced motion', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await page.route('**/*.opus', route => route.fulfill({ path: 'static/audio/a7c91e-v1.opus', contentType: 'audio/ogg' }));
  await page.goto('/');
  const input = page.getByRole('combobox', { name: 'Which work do you hear?' });
  const guess = page.getByRole('button', { name: 'Guess', exact: true });
  await expect(input).toBeEnabled();
  await input.fill('not the right piece'); await guess.click();
  await expect(page.locator('.wrong-glow')).toHaveCount(1);
  await expect(page.locator('.feedback')).toContainText('Not quite');
  await expect(page.locator('.confetti')).toHaveCount(0);
  await input.fill('still incorrect'); await guess.click();
  await expect(page.locator('.stage.active')).toHaveText('2s');
  await input.fill('goldberg'); await guess.click();
  await expect(page.locator('.confetti i')).toHaveCount(64);
  await expect(page.locator('.answer-correct')).toHaveCount(1);
  await expect(page.locator('.feedback')).toHaveText('Well heard.');
  await page.screenshot({ path: 'test-results/correct-guess-effects.png', fullPage: true });
  await page.getByRole('button', { name: 'Next piece' }).click();
  await expect(input).toBeEnabled();
  await expect(page.locator('.confetti')).toHaveCount(0);
  for (let i = 0; i < 5; i++) { await input.fill('incorrect piece'); await guess.click(); }
  await expect(page.locator('.answer-missed')).toHaveCount(1);
  await expect(page.locator('.feedback')).toHaveText('One for next time.');
  await expect(page.locator('.confetti')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(input).toBeEnabled();
  await input.fill('incorrect piece'); await guess.click();
  await expect(page.locator('.wrong-glow')).toHaveCount(1);
  expect(await page.locator('.guess-area').evaluate(element => element.getAnimations().length)).toBe(0);
  await input.fill('goldberg'); await guess.click();
  await expect(page.locator('.confetti')).toBeHidden();
  await expect(page.locator('.feedback')).toHaveText('Well heard.');
});
