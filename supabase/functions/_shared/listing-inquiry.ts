const emailPattern = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
export function validateInquiry(body: any) {
 if (!body || typeof body !== 'object') throw new Error('invalid_input');
 const data = { id: body.id, unitId: body.unitId, name: String(body.name || '').trim(), email: String(body.email || '').trim(), message: String(body.message || '').trim() };
 if (![data.id,data.unitId].every(v=>typeof v==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)) || !data.name || data.name.length>100 || !emailPattern.test(data.email) || data.email.length>254 || !data.message || data.message.length>3000) throw new Error('invalid_input');
 return data;
}
export async function handleListingInquiry(request: Request, service: any, config: { enabled?: string; rateSecret?: string }) {
 const headers = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
 const respond=(body: object,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(request.method==='OPTIONS') return respond({});
 if(request.method!=='POST') return respond({error:'method_not_allowed'},405);
 if(config.enabled!=='true' || !config.rateSecret) return respond({error:'unavailable'},503);
 if(Number(request.headers.get('content-length'))>16000) return respond({error:'invalid_input'},413);
 try {
  const raw=await request.text(); if(raw.length>16000) return respond({error:'invalid_input'},413);
  const body=JSON.parse(raw);
  if(body.website) return respond({received:true});
  const data=validateInquiry(body);
  const ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim();
  if(!ip) return respond({error:'unavailable'},503);
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${config.rateSecret}:${ip}`));
  const hashedIp=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  const {error}=await service.rpc('submit_listing_inquiry',{submission_id:data.id,target_unit_id:data.unitId,sender_name:data.name,sender_email:data.email,inquiry_message:data.message,hashed_ip:hashedIp});
  if(error) {
   const code=['rate_limited','unavailable','submission_conflict','invalid_input'].find(code=>error.message?.includes(code));
   return respond({error:code || 'temporarily_unavailable'},code==='rate_limited'?429:code==='submission_conflict'?409:code==='invalid_input'?400:503);
  }
  return respond({received:true});
 } catch { return respond({error:'invalid_input'},400); }
}
