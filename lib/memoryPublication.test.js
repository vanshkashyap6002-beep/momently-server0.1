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
test('real email template preserves text and HTML destination through mock SMTP', async () => {
  let sent;
  const sandbox = { module: { exports: {} }, process: { env: { SMTP_HOST: 'smtp.example.invalid' } }, require(name) { assert.equal(name, 'nodemailer'); return { createTransport: () => ({ sendMail: async mail => { sent = mail; return { accepted: [mail.to] }; } }) }; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./mailer'), 'utf8'), sandbox);
  const url = destinations[1];
  assert.equal((await sandbox.module.exports.sendMemoryPublishedEmail({ to: 'customer@example.invalid', memoryTitle: '<script>bad</script>', memoryUrl: url })).delivered, true);
  assert.ok(sent.text.includes(url));
  assert.equal(sent.html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&'), url);
  assert.ok(!sent.html.includes('<script>'));
});
