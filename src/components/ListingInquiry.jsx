import { useEffect, useId, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

async function sendListingInquiry(payload) {
 const { data, error } = await supabase.functions.invoke('submit-listing-inquiry',{body:payload,signal:AbortSignal.timeout(20000)});
 if(error || !data?.received) throw new Error('We could not confirm your inquiry. Please retry.');
}

export function InquiryDialog({ listing, onClose, send = sendListingInquiry }) {
 const dialog=useRef(null);
 const heading=useId();
 const payload=useRef(null);
 const [busy,setBusy]=useState(false);
 const [sent,setSent]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{ const element=dialog.current; element.showModal(); element.querySelector('[name=name]')?.focus(); return ()=>element.close(); },[]);
 useEffect(()=>{if(sent) dialog.current?.querySelector('[data-done]')?.focus();},[sent]);
 async function submit(event) {
  event.preventDefault(); if(busy) return;
  if(!payload.current) {
   const values=new FormData(event.currentTarget);
   if (!String(values.get('name') || '').trim() || !String(values.get('message') || '').trim()) { setError('Please enter your name and message.'); return; }
   payload.current={id:crypto.randomUUID(),unitId:listing.unit_id,name:values.get('name'),email:values.get('email'),message:values.get('message'),website:values.get('website')};
  }
  setBusy(true);setError('');
  try {await send(payload.current);setSent(true);} catch(e){setError(e.message || 'Could not send. Please retry.');} finally{setBusy(false);}
 }
 return <dialog ref={dialog} className="listing-inquiry-dialog" aria-labelledby={heading} onCancel={event=>{if(busy) event.preventDefault();}} onClose={event=>{if(!event.currentTarget.open) onClose();}}>
  <button type="button" className="inquiry-close" aria-label="Close inquiry" disabled={busy} onClick={()=>dialog.current.close()}>×</button>
  <h2 id={heading}>{sent?'Inquiry received':'Contact about this home'}</h2>
  <p>{listing.property_name}{listing.unit_name?.toLowerCase()!=='main unit' && ` · ${listing.unit_name}`}</p>
  {sent ? <><p role="status">Your inquiry has been received and email notifications are queued for this property’s admins. They can reply to the email address you supplied.</p><button type="button" data-done onClick={()=>dialog.current.close()}>Done</button></> : <form onSubmit={submit}>
   <fieldset disabled={busy || Boolean(payload.current)}>
    <label>Name<input autoFocus name="name" required maxLength={100} autoComplete="name" /></label>
    <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
    <label>Message<textarea name="message" required maxLength={3000} rows={4} placeholder="Ask about rent, availability, or arranging a viewing." /></label>
    <label className="inquiry-trap" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
   </fieldset>
   {error && <p role="alert">{error} Your details are saved here for retrying.</p>}
   <button type="submit" disabled={busy}>{busy?'Sending…':error?'Retry inquiry':'Send inquiry'}</button>
  </form>}
 </dialog>;
}

export function ListingInquiry({ listing }) {
 const [available,setAvailable]=useState(false);
 const [open,setOpen]=useState(false);
 useEffect(()=>{let active=true;setAvailable(false);if(supabase) supabase.rpc('listing_inquiry_available',{target_unit_id:listing.unit_id}).then(({data,error})=>{if(active) setAvailable(!error && data===true);}).catch(()=>{if(active) setAvailable(false);});return()=>{active=false;};},[listing.unit_id]);
 if(!available) return null;
 return <><button className="listing-rent inquiry-link" type="button" onClick={()=>setOpen(true)}>Contact for rent</button>{open && <InquiryDialog listing={listing} onClose={()=>setOpen(false)} />}</>;
}
