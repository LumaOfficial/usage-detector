/* Comprehensive tests for the shared parsing engine: API payloads, progress
   bars and the usage copy every supported site prints.

   Run with:  node --test tests/   (Node 22+, no dependencies) */

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadExtension } = require('./support/extension');
const providers = require('./fixtures/providers');

const { readers, sites, readPage, readMeters } = loadExtension();

/* Values built inside the extension's VM carry that realm's prototypes, so
   normalise them into plain data before the strict comparison. */
const same = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);

/* ------------------------------------------------------------------ */
/* Site registry                                                       */
/* ------------------------------------------------------------------ */

test('site registry lists all 51 supported providers', () => {
  assert.equal(sites.SITES.length, 51);
  assert.equal(sites.IDS.length, 51);
  assert.equal(new Set(sites.IDS).size, 51, 'provider ids are unique');
});

test('every provider declares the fields the readers rely on', () => {
  for (const site of sites.SITES) {
    assert.match(site.id, /^[a-z0-9]+$/, `${site.id} has a usable id`);
    assert.ok(site.name, `${site.id} has a name`);
    assert.ok(site.host.startsWith('https://'), `${site.id} has an https host`);
    assert.ok(Array.isArray(site.hosts) && site.hosts.length > 0, `${site.id} has host names`);
    assert.match(site.accent, /^#[0-9a-f]{6}$/i, `${site.id} has an accent colour`);
    assert.ok(Array.isArray(sites.patterns[site.id]), `${site.id} has match patterns`);
    for (const pattern of sites.patterns[site.id]) {
      assert.equal(pattern, `https://${pattern.slice('https://'.length, -2)}/*`);
    }
  }
});

test('host names belong to exactly one provider', () => {
  const seen = new Map();
  for (const site of sites.SITES) {
    for (const host of site.hosts) {
      assert.equal(seen.has(host), false, `${host} is claimed by ${seen.get(host)} and ${site.id}`);
      seen.set(host, site.id);
    }
  }
});

test('detect resolves a URL to its provider, and only over https', () => {
  assert.equal(sites.detect('https://claude.ai/chat/abc').id, 'claude');
  assert.equal(sites.detect('https://chat.openai.com/c/1').id, 'chatgpt');
  assert.equal(sites.detect('https://www.perplexity.ai/search').id, 'perplexity');
  assert.equal(sites.detect('https://v0.dev/chat').id, 'v0');
  assert.equal(sites.detect('https://app.runwayml.com/video').id, 'runway');
  assert.equal(sites.detect('http://claude.ai/chat'), null, 'http is ignored');
  assert.equal(sites.detect('https://unknown.example/'), null);
  assert.equal(sites.detect('https://www.claude.ai/'), null, 'unlisted subdomain');
  assert.equal(sites.detect('not a url'), null);
  assert.equal(sites.byId('gemini').name, 'Gemini');
  assert.equal(sites.byId('nope'), null);
});

test('every provider has exactly one page fixture', () => {
  const ids = providers.map((fixture) => fixture.id);
  assert.equal(ids.length, 51);
  assert.equal(new Set(ids).size, 51, 'no duplicate fixtures');
  for (const id of sites.IDS) assert.ok(ids.includes(id), `fixture for ${id}`);
});

/* ------------------------------------------------------------------ */
/* Value helpers                                                       */
/* ------------------------------------------------------------------ */

test('number reads plain numbers, percentages and rejects the rest', () => {
  assert.equal(readers.number(42), 42);
  assert.equal(readers.number(0), 0);
  assert.equal(readers.number('42.5'), 42.5);
  assert.equal(readers.number('42.5%'), 42.5);
  assert.equal(readers.number(' 17 '), 17);
  assert.equal(readers.number(''), null);
  assert.equal(readers.number('abc'), null);
  assert.equal(readers.number('1,250'), null, 'grouped digits are not a plain number');
  assert.equal(readers.number(null), null);
  assert.equal(readers.number(NaN), null);
  assert.equal(readers.number(Infinity), null);
});

test('clamp and round1 keep percentages inside 0-100 at one decimal', () => {
  assert.equal(readers.clamp(120, 0, 100), 100);
  assert.equal(readers.clamp(-5, 0, 100), 0);
  assert.equal(readers.round1(29.411), 29.4);
  assert.equal(readers.round1(33.333), 33.3);
  assert.equal(readers.round1(62.5), 62.5);
});

test('toEpoch understands seconds, milliseconds and date strings', () => {
  assert.equal(readers.toEpoch(1764000000), 1764000000000, 'seconds');
  assert.equal(readers.toEpoch(1764000000000), 1764000000000, 'milliseconds');
  assert.equal(readers.toEpoch('1764000000'), 1764000000000, 'numeric string');
  assert.equal(readers.toEpoch('2026-11-19T20:00:00Z'), Date.parse('2026-11-19T20:00:00Z'));
  assert.equal(readers.toEpoch(0), null);
  assert.equal(readers.toEpoch(-5), null);
  assert.equal(readers.toEpoch('soon'), null);
  assert.equal(readers.toEpoch(null), null);
});

/* ------------------------------------------------------------------ */
/* Reset times                                                         */
/* ------------------------------------------------------------------ */

test('resetFromText reads relative resets in every unit', () => {
  const now = Date.parse('2026-11-19T12:00:00Z');
  assert.equal(readers.resetFromText('Resets in 2 hr 14 min', now), now + 2 * 3600000 + 14 * 60000);
  assert.equal(readers.resetFromText('Resets in 45 minutes', now), now + 45 * 60000);
  assert.equal(readers.resetFromText('Refreshes in 30 s', now), now + 30000);
  assert.equal(readers.resetFromText('Resets in 1 week 2 days', now), now + 9 * 86400000);
});

test('resetFromText reads "until the next reset" phrasing', () => {
  const now = Date.parse('2026-11-19T12:00:00Z');
  assert.equal(readers.resetFromText('2 hours until your next reset', now), now + 2 * 3600000);
  assert.equal(readers.resetFromText('15 minutes till your limit resets', now), now + 15 * 60000);
});

test('resetFromText reads clock times, rolling past ones to tomorrow', () => {
  const noon = Date.parse('2026-11-19T12:00:00');
  assert.equal(readers.resetFromText('Resets at 9:00 PM', noon), Date.parse('2026-11-19T21:00:00'));
  assert.equal(readers.resetFromText('Resets at 9:00 AM', noon), Date.parse('2026-11-20T09:00:00'));
  assert.equal(readers.resetFromText('Resets at 5 pm', noon), Date.parse('2026-11-19T17:00:00'));
});

test('resetFromText returns null when the page says nothing usable', () => {
  assert.equal(readers.resetFromText(''), null);
  assert.equal(readers.resetFromText(null), null);
  assert.equal(readers.resetFromText('No usage numbers yet'), null);
  assert.equal(readers.resetFromText('Resets in a while'), null);
});

/* ------------------------------------------------------------------ */
/* API payloads                                                        */
/* ------------------------------------------------------------------ */

test('extractWindows reads every percentage key a site might send', () => {
  const windows = readers.extractWindows({
    daily: { used_percent: 62 },
    weekly: { utilization: 42.5 },
    monthly: { percent: 12 },
  });
  same(
    windows.map((window) => [window.id, window.label, window.usedPercent, window.remainingPercent]),
    [
      ['daily', 'Daily', 62, 38],
      ['weekly', 'Weekly', 42.5, 57.5],
      ['monthly', 'Monthly', 12, 88],
    ]
  );
});

test('extractWindows treats ratio keys as 0-1 and tolerates percentages sent there', () => {
  const [ratio] = readers.extractWindows({ daily: { used_ratio: 0.42 } });
  assert.equal(ratio.usedPercent, 42);
  const [percentInRatio] = readers.extractWindows({ session: { ratio: 42 } });
  assert.equal(percentInRatio.usedPercent, 42);
});

test('extractWindows falls back to used/limit counts', () => {
  const [window] = readers.extractWindows({ daily: { used: 30, limit: 120 } });
  assert.equal(window.usedPercent, 25);
  const [messages] = readers.extractWindows({ five_hour: { messages_used: 12, messages_cap: 40 } });
  assert.equal(messages.usedPercent, 30);
});

test('extractWindows reads reset timestamps and reset-after seconds', () => {
  const fixed = Date.parse('2026-11-24T20:00:00Z');
  const [at] = readers.extractWindows({ seven_day: { utilization: 10, resets_at: '2026-11-24T20:00:00Z' } });
  assert.equal(at.resetsAt, fixed);

  const [after] = readers.extractWindows({ five_hour: { utilization: 10, reset_after_seconds: 3600 } });
  assert.ok(Math.abs(after.resetsAt - (Date.now() + 3600000)) < 5000);
});

test('extractWindows finds named windows nested in a payload', () => {
  const windows = readers.extractWindows({
    data: { usage: { limits: { monthly: { used: 55, limit: 100, resets_at: 1764000000000 } } } },
  });
  assert.equal(windows.length, 1);
  assert.equal(windows[0].id, 'monthly');
  assert.equal(windows[0].usedPercent, 55);
  assert.equal(windows[0].resetsAt, 1764000000000);
});

test('extractWindows labels Claude-specific windows and ignores unrelated objects', () => {
  const windows = readers.extractWindows({
    extra_usage: { utilization: 5 },
    seven_day_opus: { utilization: 95 },
    seven_day_oauth_apps: { utilization: 20 },
    unrelated: { utilization: 99 },
    list: [{ utilization: 99 }],
  });
  same(
    windows.map((window) => [window.id, window.label]),
    [
      ['extra_usage', 'Extra usage credits'],
      ['seven_day_opus', 'Weekly · Opus'],
      ['seven_day_oauth_apps', 'Weekly · Connected apps'],
    ]
  );
});

test('extractWindows keeps the first report of a window and needs a number or a reset', () => {
  const windows = readers.extractWindows({
    daily: { used_percent: 30 },
    nested: { daily: { used_percent: 90 } },
    empty: { daily: {} },
  });
  assert.equal(windows.length, 1);
  assert.equal(windows[0].usedPercent, 30);
});

test('readClaude reads the organization usage endpoint and its plan', async () => {
  const usage = {
    five_hour: { utilization: 42.5, resets_at: '2026-11-19T20:00:00Z' },
    seven_day: { utilization: 12, resets_at: '2026-11-24T20:00:00Z' },
  };
  const requested = [];
  const result = await readers.readClaude(async (path) => {
    requested.push(path);
    if (path === '/api/organizations') return [{ uuid: 'org-1', plan_type: 'Pro' }];
    if (path === '/api/organizations/org-1/usage') return usage;
    throw new Error(`unexpected ${path}`);
  });

  same(requested, ['/api/organizations', '/api/organizations/org-1/usage']);
  assert.equal(result.plan, 'pro');
  assert.equal(result.windows.length, 2);
  assert.equal(result.windows[0].label, '5-hour session');
  assert.equal(result.windows[0].usedPercent, 42.5);
  assert.equal(result.windows[1].usedPercent, 12);
  same(result.notes, []);
});

test('readClaude accepts a wrapped organization list and a plan from the usage payload', async () => {
  const result = await readers.readClaude(async (path) => {
    if (path === '/api/organizations') return { data: [{ uuid: 'org-9' }] };
    return { plan_type: 'max', monthly: { utilization: 20 } };
  });
  assert.equal(result.plan, 'max');
  assert.equal(result.windows.length, 1);
});

test('readClaude explains an account with no usage windows', async () => {
  const result = await readers.readClaude(async (path) => {
    if (path === '/api/organizations') return [{ uuid: 'org-1' }];
    return {};
  });
  same(result.windows, []);
  assert.equal(result.notes.length, 1);
});

test('readClaude refuses an account without an organization', async () => {
  await assert.rejects(
    readers.readClaude(async () => []),
    /no-org/
  );
});

test('readChatGPT turns the message cap into a percentage window', async () => {
  const result = await readers.readChatGPT(async (path) => {
    if (path === '/backend-api/accounts/check/v4-2023-04-27') return { plan_type: 'Plus' };
    if (path === '/backend-api/conversation_limit') {
      return { message_cap: 40, message_usage: 10, resets_at: '2026-11-19T21:00:00Z' };
    }
    throw new Error(`unexpected ${path}`);
  });

  assert.equal(result.plan, 'plus');
  assert.equal(result.windows.length, 1);
  same(
    { label: result.windows[0].label, used: result.windows[0].usedPercent, left: result.windows[0].remainingPercent },
    { label: 'Messages', used: 25, left: 75 }
  );
  assert.equal(result.windows[0].resetsAt, Date.parse('2026-11-19T21:00:00Z'));
});

test('readChatGPT notes a cap it cannot turn into a percentage', async () => {
  const result = await readers.readChatGPT(async (path) => {
    if (path === '/backend-api/accounts/check/v4-2023-04-27') return { plan_type: 'free' };
    return { message_cap: 15 };
  });
  same(result.windows, []);
  assert.match(result.notes.join(' '), /15 messages/);
});

test('readChatGPT recovers the plan from /me after a 403', async () => {
  const result = await readers.readChatGPT(async (path) => {
    if (path === '/backend-api/me') return { plan_type: 'team' };
    const error = new Error('forbidden');
    error.code = 403;
    throw error;
  });
  assert.equal(result.plan, 'team');
  same(result.windows, []);
});

test('readChatGPT reports a signed-out account only when a 401 proves it', async () => {
  await assert.rejects(
    readers.readChatGPT(async () => {
      const error = new Error('unauthorized');
      error.code = 401;
      throw error;
    }),
    (error) => error.code === 401
  );

  const partial = await readers.readChatGPT(async (path) => {
    if (path === '/backend-api/conversation_limit') return { message_cap: 40, message_usage: 4 };
    const error = new Error('unauthorized');
    error.code = 401;
    throw error;
  });
  assert.equal(partial.windows.length, 1, 'a 401 on the profile does not hide the numbers already read');
});

/* ------------------------------------------------------------------ */
/* Progress bars                                                       */
/* ------------------------------------------------------------------ */

test('pageMeters reads accessible progress bars and meters', () => {
  const windows = readMeters({
    meters: [
      { label: 'Weekly limit', now: 42, max: 100 },
      { role: 'meter', label: 'Credits', now: 9, max: 60 },
      { tag: 'progress', label: 'Messages', value: 3, maxValue: 10 },
      { tag: 'meter', label: 'Images', value: 1, maxValue: 4 },
    ],
  });
  same(
    windows.map((window) => [window.label, window.usedPercent, window.remainingPercent]),
    [
      ['Weekly limit', 42, 58],
      ['Credits', 15, 85],
      ['Messages', 30, 70],
      ['Images', 25, 75],
    ]
  );
});

test('pageMeters treats a bar without a max as a percentage and clamps the rest', () => {
  const windows = readMeters({
    meters: [
      { label: 'No max', now: 42 },
      { label: 'Over max', now: 150, max: 100 },
      { label: 'Zero', now: 0, max: 100 },
    ],
  });
  same(
    windows.map((window) => [window.label, window.usedPercent]),
    [
      ['No max', 42],
      ['Over max', 100],
      ['Zero', 0],
    ]
  );
});

test('pageMeters skips nodes with no usable value', () => {
  const windows = readMeters({
    meters: [{ label: 'Nothing', now: null }, { label: 'Negative', now: -1 }, { label: 'Hidden', now: undefined }],
  });
  same(windows, []);
});

test('pageMeters finds the label on the bar, its label node, its neighbour or its parent', () => {
  const windows = readMeters({
    meters: [
      { labelledBy: 'Weekly limit', now: 10 },
      { sibling: 'Messages', now: 20 },
      { parentText: 'Credits\nSome detail', now: 30 },
      { now: 40 },
    ],
  });
  same(
    windows.map((window) => window.label),
    ['Weekly limit', 'Messages', 'Credits', 'Usage']
  );
});

test('pageMeters drops duplicate rows and keeps labels readable', () => {
  const long = 'A very long meter label that runs well past the readable limit of the panel';
  const windows = readMeters({
    meters: [
      { label: 'Messages', now: 30 },
      { label: 'Messages', now: 30 },
      { label: long, now: 10 },
    ],
  });
  assert.equal(windows.length, 2);
  assert.equal(windows[0].label, 'Messages');
  assert.equal(windows[1].label.length, 48);
});

/* ------------------------------------------------------------------ */
/* Usage copy on the page                                              */
/* ------------------------------------------------------------------ */

test('windowsFromText reads percentages used, left and remaining', () => {
  same(
    readers.windowsFromText("You've used 42% of your weekly limit").map((w) => [w.label, w.usedPercent]),
    [['Weekly limit', 42]]
  );
  same(
    readers.windowsFromText('58% left').map((w) => [w.label, w.usedPercent]),
    [['Remaining', 42]]
  );
  same(
    readers.windowsFromText('25% remaining').map((w) => [w.label, w.usedPercent]),
    [['Remaining', 75]]
  );
  same(
    readers.windowsFromText('42% used').map((w) => [w.label, w.usedPercent]),
    [['Usage', 42]]
  );
});

test('windowsFromText reads "x of y" counters', () => {
  same(
    readers.windowsFromText('12 of 40 messages used').map((w) => [w.label, w.usedPercent]),
    [['Messages used', 30]]
  );
  same(
    readers.windowsFromText('2,500 of 8,500 tokens used').map((w) => [w.label, w.usedPercent]),
    [['Tokens used', 29.4]]
  );
  same(
    readers.windowsFromText('9/25 images used').map((w) => [w.label, w.usedPercent]),
    [['Images used', 36]]
  );
});

test('windowsFromText keeps counts and balances that have no percentage', () => {
  same(
    readers.windowsFromText('18 messages left').map((w) => [w.label, w.usedPercent, w.detail]),
    [['Messages', null, '18 left']]
  );
  same(
    readers.windowsFromText('2,000 credits remaining').map((w) => [w.label, w.detail]),
    [['Credits', '2,000 left']]
  );
  same(
    readers.windowsFromText('Credits remaining: 1,250').map((w) => [w.label, w.detail]),
    [['Credits', '1,250 credits']]
  );
});

test('windowsFromText rejects impossible counters and clamps runaway percentages', () => {
  same(readers.windowsFromText('40 of 20 messages used'), []);
  assert.equal(readers.windowsFromText('150% of your monthly limit')[0].usedPercent, 100);
  assert.equal(readers.windowsFromText("You've used 0% of your daily limit")[0].usedPercent, 0);
});

test('windowsFromText removes duplicates and carries the page reset time', () => {
  const reset = Date.parse('2026-11-20T09:00:00Z');
  const windows = readers.windowsFromText("You've used 42% of your weekly limit\nYou've used 42% of your weekly limit", reset);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].resetsAt, reset);
});

test('windowsFromText ignores copy with no usage numbers', () => {
  same(readers.windowsFromText('Ask anything. Usage is up to our discretion.'), []);
  same(readers.windowsFromText(''), []);
  same(readers.windowsFromText(null), []);
});

/* ------------------------------------------------------------------ */
/* Page reader behaviour                                               */
/* ------------------------------------------------------------------ */

test('genericPage merges a bar and the sentence that describes it', () => {
  const page = readPage({
    text: "You've used 42% of your weekly limit\nResets in 2 hr 14 min",
    meters: [{ label: 'Weekly limit', now: 42, max: 100 }],
  });
  assert.equal(page.windows.length, 1, 'one limit is one row');
  assert.equal(page.windows[0].label, 'Weekly limit');
  assert.equal(page.windows[0].usedPercent, 42);
  assert.ok(page.windows[0].resetsAt > Date.now(), 'the sentence supplies the bar’s reset time');
});

test('genericPage reports a reached limit even when the page draws no meter', () => {
  const page = readPage({ text: "You've reached your daily limit. Try again tomorrow.", meters: [] });
  assert.equal(page.windows.length, 1);
  assert.equal(page.windows[0].label, 'Limit');
  assert.equal(page.windows[0].usedPercent, 100);
  assert.equal(page.windows[0].remainingPercent, 0);
});

test('genericPage explains a page with no usage numbers', () => {
  const page = readPage({ text: 'Start a new chat', meters: [] });
  same(page.windows, []);
  assert.equal(page.notes.length, 1);
  assert.match(page.notes[0], /No usage numbers/);
});

/* ------------------------------------------------------------------ */
/* Every supported provider, end to end                                */
/* ------------------------------------------------------------------ */

test('page parsing works for every supported provider', async (t) => {
  for (const fixture of providers) {
    await t.test(fixture.id, () => {
      const page = readPage(fixture.page);
      assert.equal(
        page.windows.length,
        fixture.expect.length,
        `${fixture.id} found ${page.windows.length} window(s): ${JSON.stringify(page.windows)}`
      );

      fixture.expect.forEach((expected, index) => {
        const window = page.windows[index];
        assert.equal(window.label, expected.label, `${fixture.id} window ${index} label`);
        assert.equal(window.usedPercent, expected.usedPercent, `${fixture.id} window ${index} used percent`);
        if ('detail' in expected) assert.equal(window.detail, expected.detail, `${fixture.id} window ${index} detail`);

        if (window.usedPercent == null) {
          assert.equal(window.remainingPercent, null);
        } else {
          assert.ok(window.usedPercent >= 0 && window.usedPercent <= 100, `${fixture.id} percent in range`);
          assert.equal(
            Math.round((window.usedPercent + window.remainingPercent) * 10) / 10,
            100,
            `${fixture.id} remaining complements used`
          );
        }

        if (expected.resetsAt === 'future') {
          assert.ok(window.resetsAt > Date.now(), `${fixture.id} window ${index} reset time is in the future`);
        } else if (!expected.resetsAt) {
          assert.equal(window.resetsAt, null, `${fixture.id} window ${index} has no reset time`);
        }
      });

      assert.equal(new Set(page.windows.map((window) => window.id)).size, page.windows.length, `${fixture.id} ids unique`);
    });
  }
});

/* ------------------------------------------------------------------ */
/* Status buckets                                                      */
/* ------------------------------------------------------------------ */

test('statusFor reports the tightest window', () => {
  assert.equal(readers.statusFor([{ usedPercent: 100 }]), 'limited');
  assert.equal(readers.statusFor([{ usedPercent: 99.9 }]), 'near-limit');
  assert.equal(readers.statusFor([{ usedPercent: 85 }]), 'near-limit');
  assert.equal(readers.statusFor([{ usedPercent: 40 }, { usedPercent: 86 }]), 'near-limit');
  assert.equal(readers.statusFor([{ usedPercent: 84.9 }]), 'ok');
  assert.equal(readers.statusFor([{ usedPercent: null }], 'unknown'), 'unknown');
  assert.equal(readers.statusFor([]), 'ok');
  assert.equal(readers.statusFor([], 'unknown'), 'unknown');
});
