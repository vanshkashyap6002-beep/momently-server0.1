const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(status, body, error, key = 'test-only') {
  const calls = [];
  const sandbox = { module: {exports: {}}, process: {env: {BREVO_API_KEY: key}}, AbortSignal,
    console: { warn() {} },
    async fetch(url, options) {
      calls.push({url, options});
      if (error) throw error;
      return new Response(JSON.stringify(body), {status});
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('./mailer'), 'utf8'), sandbox);
  return {mailer: sandbox.module.exports, calls};
}

for (const [code, stage] of [[200,'verified'], [401,'unauthorized'], [403,'forbidden'], [429,'rate_limited']]) {
  test('account diagnostic: ' + stage, async () => {
    const {mailer, calls} = fixture(code, {private: 'account-data'});
    const result = await mailer.verifyBrevo();
    assert.deepEqual({...result}, {ok: code === 200, stage, responseCode: code});
    assert.equal(calls.length, 1);
    const {url, options} = calls[0];
    assert.equal(url, 'https://api.brevo.com/v3/account');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers['api-key'], 'test-only');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
  });
}

for (const [label, error, stage, status] of [
  ['timeout', Object.assign(new Error(), {name:'TimeoutError'}), 'timeout', 'unknown'],
  ['connection refused', Object.assign(new Error(), {cause:{code:'ECONNREFUSED'}}), 'network_error', 'not_sent'],
  ['connection lost', Object.assign(new Error(), {cause:{code:'ECONNRESET'}}), 'network_error', 'unknown']
]) {
  test(label, async () => {
    const {mailer, calls} = fixture(null, null, error);
    assert.equal((await mailer.verifyBrevo()).stage, stage);
    assert.equal((await mailer.sendEmail({})).status, status);
    assert.equal(calls.length, 2);
  });
}
for (const [code, body, expected] of [
  [201,{messageId:'<sample@brevo>'},'accepted_by_brevo'], [201,{},'unknown'],
  [400,{},'not_sent'], [403,{},'not_sent'], [429,{},'not_sent'], [408,{},'unknown'], [503,{},'unknown']
]) {
  test('send response ' + code + ' yields ' + expected, async () => {
    const {mailer, calls} = fixture(code, body);
    const result = await mailer.sendEmail({to:'test@example.invalid',subject:'Subject',html:'<p>Example</p>',text:'Example'});
    assert.equal(result.status, expected);
    assert.equal(result.messageId, body.messageId);
    assert.equal(calls.length, 1);
    const {url, options} = calls[0];
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {sender:{name:'CHERMO',email:'hello@chermo.in'},
      to:[{email:'test@example.invalid'}],subject:'Subject',htmlContent:'<p>Example</p>',textContent:'Example'});
  });
}
test('missing API key makes no requests', async () => {
  const {mailer, calls} = fixture(null, null, null, '');
  assert.equal((await mailer.verifyBrevo()).stage, 'configuration');
  assert.equal((await mailer.sendEmail({})).status, 'not_sent');
  assert.equal(calls.length, 0);
});
