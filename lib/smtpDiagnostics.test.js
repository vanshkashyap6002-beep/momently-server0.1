const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(failure, overrides = {}) {
  const logs = [];
  const calls = { verify: 0, send: 0 };
  const env = { SMTP_PORT: '2525', SMTP_HOST: 'smtp-relay.brevo.com', SMTP_USER: 'test-login',
    SMTP_PASS: 'secret-marker', ...overrides };
  function finish(value) {
    if (failure) throw Object.assign(new Error('secret-marker'), failure);
    return value;
  }
  const sandbox = { process: { env }, module: { exports: {} },
    console: { warn(...args) { logs.push(args); } },
    require(name) {
      assert.equal(name, 'nodemailer');
      return { createTransport(options) {
        calls.options = options;
        return {
          async verify() { calls.verify++; return finish(true); },
          async sendMail() { calls.send++; return finish({ accepted: ['private@example.invalid'] }); }
        };
      } };
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('./mailer'), 'utf8'), sandbox);
  return { mailer: sandbox.module.exports, calls, logs };
}

test('Brevo verification requires STARTTLS and authentication, and sends nothing', async () => {
  const { mailer, calls } = fixture();
  assert.equal((await mailer.verifySmtp()).authenticationSucceeded, true);
  assert.equal(calls.verify, 1);
  assert.equal(calls.send, 0);
  const o = calls.options;
  assert.deepEqual([o.port,o.secure,o.requireTLS,o.tls.minVersion,o.forceAuth], [2525,false,true,'TLSv1.2',true]);
  assert.deepEqual([o.connectionTimeout,o.greetingTimeout,o.socketTimeout], [15000,10000,30000]);
});

for (const [label, failure, stage, status] of [
  ['authentication rejection', {code:'EAUTH', command:'AUTH PLAIN', responseCode:535}, 'authentication', 'not_sent'],
  ['connection timeout', {code:'ETIMEDOUT', command:'CONN', message:'Connection timeout'}, 'connection', 'not_sent'],
  ['connection refused', {code:'ESOCKET', command:'CONN', syscall:'connect', message:'connect ECONNREFUSED'}, 'connection', 'not_sent'],
  ['TLS failure', {code:'ETLS', command:'STARTTLS'}, 'tls', 'not_sent'],
  ['greeting timeout', {code:'ETIMEDOUT', command:'CONN', message:'Greeting never received'}, 'greeting', 'not_sent'],
  ['socket loss at unknown point', {code:'ESOCKET', command:'CONN'}, 'undetermined', 'unknown'],
  ['timeout during DATA', {code:'ETIMEDOUT', command:'DATA'}, 'message', 'unknown']
]) {
  test(label, async () => {
    const { mailer, calls, logs } = fixture({...failure, response:'secret-marker'});
    const result = await mailer.verifySmtp();
    assert.equal(result.ok, false);
    assert.equal(result.stage, stage);
    if (stage === 'authentication') assert.equal(result.authenticationSucceeded, false);
    assert.equal(calls.send, 0);
    assert.equal((await mailer.sendEmail({to:'private@example.invalid'})).status, status);
    assert.doesNotMatch(JSON.stringify([result, logs]), /secret-marker|private@example|test-login/);
  });
}

test('successful send records SMTP acceptance', async () => {
  const { mailer, calls } = fixture();
  assert.equal((await mailer.sendEmail({to:'private@example.invalid'})).status, 'accepted_by_smtp');
  assert.equal(calls.send, 1);
});

test('verification requires credentials', async () => {
  const { mailer, calls } = fixture(null, {SMTP_PASS:''});
  assert.equal((await mailer.verifySmtp()).stage, 'configuration');
  assert.equal(calls.verify, 0);
});
