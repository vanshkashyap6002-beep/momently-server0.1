const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseMemoryLink } = require('./memoryLink');
const destinations = ['https://the-blooming.vercel.app/', 'https://Example.com/a%2Fb?x=1&y=%2F#Chapter', 'https://chermo.in/memory/a-b?view=1#letter', `https://example.com/${'a'.repeat(2200)}`];
test('preserves complete HTTPS destinations, trimming only outer whitespace', () => {
  for (const url of destinations) assert.equal(parseMemoryLink(`  ${url}  `).url, url);
});
test('rejects malformed, credential-bearing and unsafe URLs', () => {
  for (const value of ['', null, {}, 'http://example.com', 'javascript:alert(1)', '//example.com', 'https://', 'https://user:pass@example.com', 'https://example.com/a b', 'https://example.com/"', 'https://example.com/\\evil']) assert.equal(parseMemoryLink(value), null);
});
test('real email template preserves text and HTML destination through mock Brevo API', async () => {
  let sent;
  const sandbox = { module: { exports: {} }, process: { env: { BREVO_API_KEY: 'test-only' } }, AbortSignal,
    async fetch(url, options) {
      sent = JSON.parse(options.body);
      return new Response(JSON.stringify({messageId:'test-id'}), {status:201});
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('./mailer'), 'utf8'), sandbox);
  const url = destinations[1];
  assert.equal((await sandbox.module.exports.sendMemoryPublishedEmail({ to: 'customer@example.invalid', memoryTitle: '<script>bad</script>', memoryUrl: url })).status, 'accepted_by_brevo');
  assert.ok(sent.textContent.includes(url));
  assert.equal(sent.htmlContent.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&'), url);
  assert.ok(!sent.htmlContent.includes('<script>'));
});
