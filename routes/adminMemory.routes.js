"use strict";
const express=require('express');
const crypto=require('crypto');
const db=require('../lib/db');
const {requireAdmin}=require('../middleware/adminAuth');
const {sendMemoryPublishedEmail,verifySmtp}=require('../lib/mailer');
const {validate,slug}=require('../lib/adminMemoryValidation');
const {parseMemoryLink}=require('../lib/memoryLink');
const router=express.Router();
router.use(requireAdmin);
router.get('/email/diagnostics',async(req,res)=>{
 res.set('Cache-Control','no-store');
 const result=await verifySmtp();
 return res.status(result.ok?200:503).json(result);
});
const multer=require('multer');
const storage=require('../lib/storage');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:10}}).array('files',10);
const fail=(status,message)=>Object.assign(new Error(message),{status});
async function transaction(req,res,action,fn) {
 let c;
 try {
  c=await db.pool.connect();await c.query('BEGIN');
  const o=(await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
  if(!o) throw fail(404,'Order not found.');
  const result=await fn(c,o);
  await c.query('INSERT INTO memory_admin_events(id,order_id,admin_id,action) VALUES($1,$2,$3,$4)',[crypto.randomUUID(),o.id,req.admin.id,action]);
  await c.query('COMMIT');res.json({ok:true,...result});return true;
 } catch(e) {if(c) await c.query('ROLLBACK').catch(()=>{});res.status(e.status || (e.code==='23505'?409:500)).json({error:e.status?e.message:e.code==='23505'?'That slug or request is already in use.':'Unable to complete memory operation.'});return false;}
 finally {c?.release();}
}
// Older versions could leave a pending row after the worker exited. Report a
// stale reservation conservatively without rewriting historical records.
function attemptStatus(row) {
 return row.status==='pending' && Date.now()-new Date(row.created_at).getTime()>300000
  ? 'unknown' : row.status;
}
router.get('/orders/:id/lifecycle',async(req,res)=>{
 try {
  const o=(await db.query('SELECT memory_archived_at, memory_occasion, memory_slug, memory_url FROM orders WHERE id=$1',[req.params.id])).rows[0];
  if(!o)return res.status(404).json({error:'Order not found.'});
  const emails=(await db.query('SELECT id,status,created_at FROM memory_email_attempts WHERE order_id=$1 ORDER BY created_at DESC LIMIT 10',[req.params.id])).rows;
  const events=(await db.query('SELECT action,admin_id,created_at FROM memory_admin_events WHERE order_id=$1 ORDER BY created_at DESC LIMIT 20',[req.params.id])).rows;
  res.json({...o,emails:emails.map(row=>({...row,status:attemptStatus(row)})),events});
 }catch{res.status(500).json({error:'Lifecycle unavailable. Apply the reviewed migration before using these controls.'});}
});
router.put('/orders/:id/memory', (req,res)=>{
 let values;try{values=validate(req.body);}catch(e){return res.status(400).json({error:e.message});}
 return transaction(req,res,'save',async(c,o)=>{
  if(values.template_id && !(await c.query('SELECT id FROM templates WHERE id=$1',[values.template_id])).rows.length)throw fail(400,'Template not found.');
  const keys=Object.keys(values);if(keys.length)await c.query(`UPDATE orders SET ${keys.map((k,i)=>k+'=$'+(i+1)).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=$${keys.length+1}`,[...Object.values(values),o.id]);
  if(req.body.timeline!==undefined){await c.query('DELETE FROM memory_timeline WHERE order_id=$1',[o.id]);for(const [i,t] of req.body.timeline.entries())await c.query('INSERT INTO memory_timeline(id,order_id,entry_date,title,description,sort_order) VALUES($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),o.id,t.date||null,t.title||null,t.description||null,i]);}
  return {};
 });
});
const lifecycle=(req,res)=>transaction(req,res,req.body?.action||'invalid',async(c,o)=>{
 const {action,confirm}=req.body||{};
 let newSlug=req.body?.newSlug;const supplied=req.body?.memoryLink;
 const parsed=supplied?parseMemoryLink(supplied):null;
 if(supplied&&!parsed)throw fail(400,'Enter a valid HTTPS URL.');
 if(parsed)newSlug=parsed.slug;
 if(!['link','publish','unpublish','archive','restore'].includes(action))throw fail(400,'Invalid action.');
 if(action==='link'||action==='publish'&&parsed){
  if(!parsed&&!slug(newSlug))throw fail(400,'Use 1–80 lowercase letters, numbers and single hyphens.');
  if(!parsed && o.memory_url && !o.memory_slug && confirm!=='MIGRATE '+o.id)throw fail(400,'Confirm migration. The external site is not copied or disabled.');
  // Serialize the shared slug namespace, including legacy publication routes.
  await c.query('LOCK TABLE memory_slug_aliases IN EXCLUSIVE MODE');
  if((await c.query('SELECT id FROM orders WHERE memory_slug=$1 AND id<>$2',[newSlug,o.id])).rows.length)throw fail(409,'Slug already in use.');
  for(const s of [o.memory_slug,newSlug].filter(Boolean)){
   const a=(await c.query('SELECT order_id FROM memory_slug_aliases WHERE slug=$1',[s])).rows[0];
   if(a && a.order_id!==o.id)throw fail(409,'Slug already reserved.');
   await c.query('INSERT INTO memory_slug_aliases(slug,order_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[s,o.id]);
  }
  await c.query('UPDATE orders SET memory_slug=$1,memory_url=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$3',[newSlug,parsed?.url||'https://www.chermo.in/memory/'+newSlug,o.id]);
  o.memory_slug=newSlug;o.memory_url=parsed?.url||'https://www.chermo.in/memory/'+newSlug;
 }
 if(action==='publish'){
  if(o.memory_archived_at)throw fail(409,'Restore this archived memory first.');
  if(o.payment_status!=='PAID'||!o.razorpay_order_id||!o.razorpay_payment_id)throw fail(409,'Verified payment is required.');
  if(!o.memory_slug && !o.memory_url)throw fail(409,'Set a public link first.');
  await c.query("UPDATE orders SET status='PUBLISHED',published_at=COALESCE(published_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=$1",[o.id]);
 }
 if(['unpublish','archive'].includes(action)){
  if(confirm!==action.toUpperCase()+' '+o.id)throw fail(400,'Confirmation does not match this order.');
  await c.query("UPDATE orders SET status=CASE WHEN status='PUBLISHED' THEN 'READY' ELSE status END,memory_archived_at=CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE memory_archived_at END,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[o.id,action==='archive']);
 }
 if(action==='restore')await c.query('UPDATE orders SET memory_archived_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[o.id]);
 return {};
});
router.post('/orders/:id/lifecycle',lifecycle);
router.post('/orders/:id/publish',(req,res)=>{req.body={...req.body,action:'publish'};return lifecycle(req,res);});
router.post('/orders/:id/email',async(req,res)=>{
 const key=req.body?.requestId;
 if(typeof key!=='string'||!/^[-a-zA-Z0-9]{16,100}$/.test(key))return res.status(400).json({error:'A unique email request ID is required.'});
 let c;
 try{
  c=await db.pool.connect();await c.query('BEGIN');
  const o=(await c.query('SELECT orders.*,users.email AS customer_email FROM orders JOIN users ON users.id=orders.user_id WHERE orders.id=$1 FOR UPDATE OF orders',[req.params.id])).rows[0];
  if(!o)throw fail(404,'Order not found.');
  if(o.status!=='PUBLISHED'||o.memory_archived_at)throw fail(409,'Publish the memory before sending email.');
  const previous=(await c.query('SELECT status,created_at FROM memory_email_attempts WHERE id=$1 AND order_id=$2',[key,o.id])).rows[0];
  if(previous){await c.query('COMMIT');return res.json({ok:true,status:attemptStatus(previous)});}
  if((await c.query("SELECT id FROM memory_email_attempts WHERE order_id=$1 AND created_at>CURRENT_TIMESTAMP-INTERVAL '60 seconds'",[o.id])).rows.length)throw fail(429,'Wait one minute before another email attempt.');
  await c.query("INSERT INTO memory_email_attempts(id,order_id,admin_id,status) VALUES($1,$2,$3,'unknown')",[key,o.id,req.admin.id]);
  await c.query('COMMIT');
  // The durable reservation stays unknown if this process stops or finalization fails.
  c.release();c=null;
  let status='unknown';
  try {
   const result=await sendMemoryPublishedEmail({
    to:o.customer_email,recipientName:o.recipient_name,memoryTitle:o.memory_title,
    memoryUrl:o.memory_url||'https://www.chermo.in/memory/'+o.memory_slug
   });
   status=result.status;
  } catch { /* No reliable acceptance result. Keep the reservation. */ }
  try {
   const updated=await db.query('UPDATE memory_email_attempts SET status=$1 WHERE id=$2',[status,key]);
   if(updated.rowCount!==1)throw new Error('Missing reservation');
  } catch {
   console.error('SMTP attempt outcome could not be persisted',{status});
   return res.status(503).json({error:'Email history update failed. Check provider logs before any new send.',status,requestId:key});
  }
  res.json({ok:true,status});
 }catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});res.status(e.status||500).json({error:e.status?e.message:'Email status unknown. Check history before retrying.'});}finally{c?.release();}
});
router.post('/orders/:id/media', (req,res)=>upload(req,res,err=>{
 if(err)return res.status(400).json({error:'Upload rejected: maximum 10 files, 20 MB each.'});
 const files=req.files||[];
 if(!files.length)return res.status(400).json({error:'Choose files to upload.'});
 const types=files.map(f=>storage.detectFileType(f.buffer));
 if(types.some((t,i)=>!t||t.mimeType!==files[i].mimetype))return res.status(400).json({error:'File signature must match a supported image or video type.'});
 const saved=[];
 return transaction(req,res,'add media',async(c,o)=>{
  const n=(await c.query('SELECT COALESCE(MAX(sort_order),-1) AS n FROM media WHERE order_id=$1',[o.id])).rows[0].n;
  for(let i=0;i<files.length;i++){
   const f=files[i],stored=storage.saveFile(o.id,f,types[i]);saved.push(stored);
   await c.query('INSERT INTO media(id,order_id,filename,stored_path,mime_type,size_bytes,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),o.id,f.originalname.slice(0,200),stored,types[i].mimeType,f.size,Number(n)+1+i]);
  }
  return {};
 }).then(ok=>{if(!ok)for(const stored of saved)storage.deleteFile(stored);});
}));
router.patch('/orders/:id/media/:mediaId', (req,res)=>transaction(req,res,'edit media',async(c,o)=>{
 const {caption,remove,confirm}=req.body||{};
 if(typeof caption!=='string'||caption.length>1000)throw fail(400,'Caption must be text up to 1000 characters.');
 if(remove && confirm!=='REMOVE '+req.params.mediaId)throw fail(400,'Confirm removal of this photo.');
 const result=remove?await c.query('DELETE FROM media WHERE id=$1 AND order_id=$2',[req.params.mediaId,o.id]):await c.query('UPDATE media SET caption=$1 WHERE id=$2 AND order_id=$3',[caption,req.params.mediaId,o.id]);
 if(result.rowCount!==1)throw fail(404,'Media not found in this order.');
 return {};
}));
// Initial publication also requires explicit selection of email; legacy automatic-send behavior is retired.

module.exports=router;
