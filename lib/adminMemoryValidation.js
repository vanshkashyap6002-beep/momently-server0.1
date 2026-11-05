"use strict";
const fields = {recipientName:['recipient_name',200],memoryTitle:['memory_title',200],memorySubtitle:['memory_subtitle',1000],personalMessage:['personal_message',10000],memoryClosingMessage:['memory_closing_message',10000],memorySongTitle:['memory_song_title',200],memorySongArtist:['memory_song_artist',200],importantDate:['important_date',10],occasion:['memory_occasion',200],templateId:['template_id',100]};
function validate(body) {
 if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('Invalid memory details.');
 const values={};
 for (const [key,[column,max]] of Object.entries(fields)) if (Object.hasOwn(body,key)) {
  if (typeof body[key] !== 'string' || body[key].length>max) throw Error(`${key} must be text up to ${max} characters.`);
  const value=body[key].trim();
  if (['memoryTitle','recipientName','templateId'].includes(key) && !value) throw Error(`${key} is required.`);
  if (key==='importantDate' && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value)) throw Error('Invalid date.');
  values[column]=value || null;
 }
 if (body.timeline !== undefined && (!Array.isArray(body.timeline) || body.timeline.length>100 || body.timeline.some(t=>!t || ['date','title','description'].some(k=>t[k]!==undefined && (typeof t[k]!=='string'||t[k].length>(k==='description'?5000:200)))))) throw Error('Invalid timeline; maximum 100 entries.');
 return values;
}
function slug(value) { return typeof value==='string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length<=80; }
module.exports={validate,slug};
