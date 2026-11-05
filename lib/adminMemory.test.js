const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const vm=require('vm');
const {validate,slug}=require('./adminMemoryValidation');
function harness(overrides={}){
 const order={id:'o1',status:'PUBLISHED',payment_status:'PAID',razorpay_order_id:'rp1',razorpay_payment_id:'rp2',memory_slug:'old',memory_url:'https://www.chermo.in/memory/old',customer_email:'example@example.invalid',...overrides};
 const routes=[],calls=[],emails=[],attempts=new Map();let guards=0;
 const guard=()=>{guards++;};
 const query=async(sql,args=[])=>{
 calls.push({sql,args});
 if(sql.includes('SELECT * FROM orders')||sql.includes('SELECT orders.*'))return {rows:overrides.missing?[]:[order]};
 if(sql.includes('SELECT order_id FROM memory_slug_aliases'))return {rows:overrides.collision?[{order_id:'other'}]:[]};
 if(sql.includes('SELECT id FROM orders WHERE memory_slug'))return {rows:[]};
 if(sql.includes('SELECT id FROM templates'))return {rows:[{id:'template'}]};
 if(sql.includes('SELECT status,created_at FROM memory_email_attempts'))return {rows:attempts.has(args[0])?[{status:attempts.get(args[0])}]:[]};
 if(sql.includes('SELECT id FROM memory_email_attempts'))return {rows:[]};
 if(sql.includes('INSERT INTO memory_email_attempts'))attempts.set(args[0],sql.includes("'unknown'")?'unknown':'pending');
 if(sql.includes('UPDATE memory_email_attempts')){if(overrides.failStatus)throw Error('write failed');attempts.set(args[1],args[0]);}
 if(sql.includes('UPDATE orders') && overrides.failWrite)throw Error('db failure');
 return {rows:[],rowCount:1};
 };
 const router={use:g=>{assert.equal(g,guard);assert.equal(routes.length,0);}};
 for(const method of ['get','post','put','patch'])router[method]=(url,...handlers)=>routes.push({method,url,handlers});
 const sandbox={module:{exports:{}},console,require(name){
 if(name==='express')return {Router:()=>router};if(name==='../lib/db')return {query,pool:{connect:async()=>({query,release(){}})}};
 if(name==='../middleware/adminAuth')return {requireAdmin:guard};if(name==='../lib/adminMemoryValidation')return {validate,slug};
 if(name==='../lib/mailer')return {verifyBrevo:async()=>overrides.diagnostic,sendMemoryPublishedEmail:async payload=>{emails.push(payload);return {messageId:'<test-id>',status:'accepted_by_brevo'};}};
 if(name==='multer'){const m=()=>({array:()=>()=>{}});m.memoryStorage=()=>({});return m;}
 if(name==='../lib/storage')return {};if(name==='../lib/memoryLink')return require('./memoryLink');return require(name);
 }};
 vm.runInNewContext(fs.readFileSync(require.resolve('../routes/adminMemory.routes'),'utf8'),sandbox);
 return {order,calls,emails,async request(method,url,body={}){const res={statusCode:200,set(name,value){this[name]=value;return this;},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}};await routes.find(r=>r.method===method&&r.url===url).handlers[0]({params:{id:'o1'},body,admin:{id:'admin1'}},res);return res;}};
}
test('validates types, bounded messages, date and slug',()=>{
 assert.throws(()=>validate({memoryTitle:''}));assert.throws(()=>validate({recipientName:123}));assert.throws(()=>validate({importantDate:'2026-02-30'}));assert.throws(()=>validate({personalMessage:'a'.repeat(10001)}));assert.throws(()=>validate({timeline:[{description:5}]}));
 assert.ok(slug('our-memory'));for(const value of ['../test','A B','-bad','a'.repeat(81)])assert.equal(slug(value),false);
});
test('admin saves draft and published fields in place without email',async()=>{
 for(const status of ['PENDING','READY','PUBLISHED']){const h=harness({status});const res=await h.request('put','/orders/:id/memory',{memoryTitle:'Updated',recipientName:'Recipient',timeline:[{date:'2020-01-01',title:'First',description:'Hello'}]});assert.equal(res.statusCode,200);assert.equal(h.emails.length,0);assert.ok(h.calls.some(c=>c.sql.includes('UPDATE orders')&&c.args.at(-1)==='o1'));assert.ok(!h.calls.some(c=>c.sql.includes('INSERT INTO orders')));assert.ok(h.calls.some(c=>c.sql.includes('INSERT INTO memory_timeline')&&c.args[2]==='2020-01-01'));}
});
test('invalid and missing orders fail before writes',async()=>{
 const h=harness();assert.equal((await h.request('put','/orders/:id/memory',{memoryTitle:12})).statusCode,400);
 const absent=harness({missing:true});assert.equal((await absent.request('put','/orders/:id/memory',{memoryTitle:'Title'})).statusCode,404);
});
test('slug change reserves old and new aliases without inserting an order',async()=>{
 const h=harness();assert.equal((await h.request('post','/orders/:id/lifecycle',{action:'link',newSlug:'new'})).statusCode,200);
 assert.deepEqual(h.calls.filter(c=>c.sql.includes('INSERT INTO memory_slug_aliases')).map(c=>Array.from(c.args)),[['old','o1'],['new','o1']]);
 assert.equal(h.emails.length,0);
 assert.equal((await harness({collision:true}).request('post','/orders/:id/lifecycle',{action:'link',newSlug:'new'})).statusCode,409);
});
test('external migration requires explicit order confirmation',async()=>{
 const h=harness({memory_slug:null,memory_url:'https://external.example/'});
 assert.equal((await h.request('post','/orders/:id/lifecycle',{action:'link',newSlug:'new'})).statusCode,400);
 assert.equal((await h.request('post','/orders/:id/lifecycle',{action:'link',newSlug:'new',confirm:'MIGRATE o1'})).statusCode,200);
});
test('unpublish/archive confirm order, retain content, restore and republish without email',async()=>{
 for(const action of ['archive','unpublish']){const h=harness();assert.equal((await h.request('post','/orders/:id/lifecycle',{action})).statusCode,400);assert.equal((await h.request('post','/orders/:id/lifecycle',{action,confirm:action.toUpperCase()+' o1'})).statusCode,200);assert.ok(!h.calls.some(c=>c.sql.includes('DELETE')));}
 for(const action of ['restore','publish']){const h=harness();assert.equal((await h.request('post','/orders/:id/lifecycle',{action})).statusCode,200);assert.equal(h.emails.length,0);}
 assert.equal((await harness({memory_archived_at:'today'}).request('post','/orders/:id/lifecycle',{action:'publish'})).statusCode,409);
 assert.equal((await harness({payment_status:'UNPAID'}).request('post','/orders/:id/lifecycle',{action:'publish'})).statusCode,409);
});
test('same explicit email request sends once and only after durable attempt commit',async()=>{
 const h=harness();const body={requestId:'a-unique-email-request-123'};
 assert.equal((await h.request('post','/orders/:id/email',body)).body.status,'accepted_by_brevo');
 assert.equal((await h.request('post','/orders/:id/email',body)).body.status,'accepted_by_brevo');assert.equal(h.emails.length,1);
 assert.ok(h.calls.some(c=>c.sql==='COMMIT'));
 assert.equal((await harness({status:'READY'}).request('post','/orders/:id/email',body)).statusCode,409);
});
test('failed save rolls back and sends nothing',async()=>{const h=harness({failWrite:true});assert.equal((await h.request('put','/orders/:id/memory',{memoryTitle:'Title'})).statusCode,500);assert.ok(h.calls.some(c=>c.sql==='ROLLBACK'));assert.equal(h.emails.length,0);});
test('public resolver requires published, nonarchived order and resolves aliases',()=>{const s=fs.readFileSync(require.resolve('../routes/memory.routes'),'utf8');assert.match(s,/memory_slug_aliases WHERE slug=\$1/);assert.match(s,/orders.status = 'PUBLISHED'/);assert.match(s,/memory_archived_at IS NULL/);});
test('real admin middleware rejects absent admin cookie even with a customer cookie',async()=>{
 const sandbox={module:{exports:{}},console,require(n){if(n==='../lib/db')return {};if(n==='../lib/jwt')return {ADMIN_COOKIE:'admin',verifyAdminToken(){throw Error('invalid');}};}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../middleware/adminAuth'),'utf8'),sandbox);
 let next=false;const res={status(n){this.code=n;return this;},json(){}};
 await sandbox.module.exports.requireAdmin({cookies:{customer:'customer-token'}},res,()=>{next=true;});assert.equal(res.code,401);assert.equal(next,false);
});

test('status-write failure retains reservation and replay never resends',async()=>{
 const h=harness({failStatus:true});
 const body={requestId:'database-failure-request-01'};
 const first=await h.request('post','/orders/:id/email',body);
 assert.equal(first.statusCode,503);
 assert.equal(first.body.status,'accepted_by_brevo');
 assert.equal(first.body.messageId,'<test-id>');
 assert.equal((await h.request('post','/orders/:id/email',body)).body.status,'unknown');
 assert.equal(h.emails.length,1);
});

test('guarded diagnostics returns verification status without touching orders or sending',async()=>{
 for(const ok of [true,false]){
  const diagnostic={ok,stage:ok?'verified':'forbidden',authenticationSucceeded:ok?true:null};
  const h=harness({diagnostic});
  const result=await h.request('get','/email/diagnostics');
  assert.equal(result.statusCode,ok?200:503);
  assert.deepEqual(result.body,diagnostic);
  assert.equal(result['Cache-Control'],'no-store');
  assert.equal(h.emails.length,0);
  assert.equal(h.calls.length,0);
 }
});
