import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {InquiryDialog} from '../../src/components/ListingInquiry';
import '../../src/index.css';
import '../../src/App.css';
let attempt=0;
export function Harness(){const [open,setOpen]=useState(false);return <main><h1>Local dialog test — no emails sent</h1><button onClick={()=>setOpen(true)}>Contact for rent</button>{open&&<InquiryDialog listing={{unit_id:'cccccccc-1111-4111-8111-111111111111',property_name:'469 Carthage',unit_name:'Main Unit'}} onClose={()=>setOpen(false)} send={async()=>{attempt++;if(attempt===1)throw new Error('Simulated connection failure. Please retry.');}}/>}</main>}
createRoot(document.getElementById('root')).render(<React.StrictMode><Harness/></React.StrictMode>);
