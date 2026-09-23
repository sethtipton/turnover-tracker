// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ListingGallery } from '../src/components/ListingGallery';
import { ListingImages } from '../src/components/ListingImages';
import { loadListingImages, reorderListingImages, updateListingImage } from '../src/lib/listingImages';
vi.mock('../src/lib/listingImages', () => ({ loadListingImages: vi.fn(), uploadListingImage: vi.fn(), reorderListingImages: vi.fn(), updateListingImage: vi.fn() }));
const photos = [{ id:'a',label:'Kitchen',url:'/a.jpg',sort_order:0 },{ id:'b',label:'Bedroom',url:'/b.jpg',sort_order:1 }];
let root, container;
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; vi.clearAllMocks(); loadListingImages.mockResolvedValue(photos); container=document.createElement('div'); document.body.append(container); root=createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
it('changes the large photo and accessible caption from thumbnail selection',async () => {
 await act(async () => root.render(<ListingGallery photos={photos} />));
 await act(async () => container.querySelectorAll('button')[1].click());
 expect(container.querySelector('figure img').getAttribute('src')).toBe('/b.jpg');
 expect(container.querySelector('figcaption').textContent).toContain('Bedroom · 2 of 2');
 expect(container.querySelectorAll('button')[1].getAttribute('aria-pressed')).toBe('true');
});
it('starts collapsed and persists cover order through the reorder API',async () => {
 await act(async () => root.render(<ListingImages unit={{id:'unit',name:'Main Unit'}} />));
 expect(container.querySelector('details').open).toBe(false);
 expect(container.textContent).toContain('1024 × 768');
 const covers=[...container.querySelectorAll('button')].filter(b=>b.textContent==='Make cover');
 await act(async () => covers[1].click());
 expect(reorderListingImages).toHaveBeenCalledWith('unit',['b','a']);
});
it('removes a photo reversibly and can undo',async () => {
 await act(async () => root.render(<ListingImages unit={{id:'unit',name:'Main Unit'}} />));
 await act(async () => [...container.querySelectorAll('button')].find(b=>b.textContent==='Remove').click());
 expect(updateListingImage).toHaveBeenCalledWith('a',{removed_at:expect.any(String)});
 await act(async () => [...container.querySelectorAll('button')].find(b=>b.textContent==='Undo removal').click());
 expect(updateListingImage).toHaveBeenLastCalledWith('a',{removed_at:null});
});
