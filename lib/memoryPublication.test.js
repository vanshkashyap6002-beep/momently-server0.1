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
// Real route with isolated DB/email doubles; never connects to a database or SMTP.
function harness(options = {}) {
  const calls = [], emails = [], routes = [];
  const order = { id: 'test-order', status: 'READY', payment_status: 'PAID', razorpay_order_id: 'test-order', razorpay_payment_id: 'test-payment', customer_email: 'customer@example.invalid', ...options.order };
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes('FOR UPDATE')) return { rows: [order] };
    if (sql.startsWith('SELECT id')) return { rows: [] };
    if (sql.includes('UPDATE orders')) { if (options.failWrite) throw Error('mock write failure'); return { rowCount: 1 }; }
    return { rows: [] };
  }, release() {} };
  const guard = () => {};
  const router = new Proxy({}, { get: (_, method) => (...args) => { routes.push({ method, args }); } });
  const sandbox = { module: { exports: {} }, console: { error() {} }, require(name) {
    if (name === 'express') return { Router: () => router };
    if (name === '../lib/db') return { pool: { connect: async () => client } };
    if (name === '../middleware/adminAuth') return { requireAdmin: guard };
    if (name === '../lib/memoryLink') return { parseMemoryLink };
    if (name === '../lib/mailer') return { sendMemoryPublishedEmail: async value => { emails.push(value); if (options.failEmail) throw Error('mock SMTP failure'); return { delivered: !options.noSMTP }; } };
    return {};
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../routes/admin.routes'), 'utf8'), sandbox);
  const route = routes.find(r => r.method === 'post' && r.args[0] === '/orders/:id/publish');
  assert.equal(route.args[1], guard);
  return { calls, emails, async publish(url) {
    const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
    await route.args.at(-1)({ params: { id: order.id }, body: { memoryLink: url } }, res);
    return res;
  } };
}
test('publication passes exact URL to SQL, email and API after commit', async () => {
  for (const url of destinations) {
    const h = harness(); const res = await h.publish(url);
    assert.equal(res.statusCode, 200); assert.equal(res.body.memoryUrl, url);
    assert.equal(h.calls.find(c => c.sql.includes('UPDATE orders')).params[2], url);
    assert.equal(h.emails[0].memoryUrl, url); assert.equal(h.emails[0].to, 'customer@example.invalid');
    assert.ok(h.calls.some(c => c.sql === 'COMMIT'));
  }
});
test('email failure is reported without undoing publication', async () => {
  for (const options of [{ failEmail: true }, { noSMTP: true }]) {
    const h = harness(options); const res = await h.publish(destinations[0]);
    assert.equal(res.body.emailDelivered, false); assert.equal(res.body.ok, true);
    assert.ok(h.calls.some(c => c.sql === 'COMMIT')); assert.ok(!h.calls.some(c => c.sql === 'ROLLBACK'));
  }
});
test('invalid input, unpaid/duplicate orders and DB failure never send email', async () => {
  for (const [options, url, status] of [[{}, 'javascript:alert(1)', 400], [{ order: { payment_status: 'PENDING' } }, destinations[0], 409], [{ order: { status: 'PUBLISHED' } }, destinations[0], 409], [{ order: { razorpay_payment_id: null } }, destinations[0], 409], [{ failWrite: true }, destinations[0], 500]]) {
    const h = harness(options); const res = await h.publish(url);
    assert.equal(res.statusCode, status); assert.equal(h.emails.length, 0);
  }
});
test('real email template preserves text and HTML destination through mock SMTP', async () => {
  let sent;
  const sandbox = { module: { exports: {} }, process: { env: { SMTP_HOST: 'smtp.example.invalid' } }, require(name) { assert.equal(name, 'nodemailer'); return { createTransport: () => ({ sendMail: async mail => { sent = mail; } }) }; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./mailer'), 'utf8'), sandbox);
  const url = destinations[1];
  assert.equal((await sandbox.module.exports.sendMemoryPublishedEmail({ to: 'customer@example.invalid', memoryTitle: '<script>bad</script>', memoryUrl: url })).delivered, true);
  assert.ok(sent.text.includes(url));
  assert.equal(sent.html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&'), url);
  assert.ok(!sent.html.includes('<script>'));
});
