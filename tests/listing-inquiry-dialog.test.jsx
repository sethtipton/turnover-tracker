// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {InquiryDialog,ListingInquiry} from '../src/components/ListingInquiry';
import {supabase} from '../src/lib/supabase';
vi.mock('../src/lib/supabase',()=>({supabase:{rpc:vi.fn()}}));
let root,container;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;HTMLDialogElement.prototype.showModal=function(){this.open=true};HTMLDialogElement.prototype.close=function(){this.open=false};container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.clearAllMocks();});
it('hides action when no admin email is available',async()=>{supabase.rpc.mockResolvedValue({data:false});await act(async()=>root.render(<ListingInquiry listing={{unit_id:'unit'}}/>));expect(container.querySelector('button')).toBeNull();});
it('retains identical submission details and id after failure, then acknowledges receipt',async()=>{
 const send=vi.fn().mockRejectedValueOnce(new Error('Connection failed')).mockResolvedValueOnce();
 await act(async()=>root.render(<InquiryDialog listing={{unit_id:'unit',property_name:'Carthage',unit_name:'Main Unit'}} onClose={()=>{}} send={send}/>));
 container.querySelector('[name=name]').value='Test sender';container.querySelector('[name=email]').value='sender@example.invalid';container.querySelector('[name=message]').value='Is this available?';
 const submit=()=>act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 await submit();expect(container.textContent).toContain('Retry inquiry');expect(container.querySelector('[name=message]').value).toBe('Is this available?');
 await submit();expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);expect(container.textContent).toContain('Inquiry received');
});
