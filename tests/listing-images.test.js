import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/lib/supabase', () => ({ supabase: null }));
import { prepareListingImage } from '../src/lib/listingImages';

describe('listing photo validation', () => {
  it('rejects HEIC with actionable instructions before decoding', async () => {
    await expect(prepareListingImage({ type: 'image/heic', size: 100 })).rejects.toThrow('Export HEIC photos as JPEG');
  });
  it('rejects oversized input before decoding', async () => {
    await expect(prepareListingImage({ type: 'image/jpeg', size: 21 * 1024 * 1024 })).rejects.toThrow('20 MB');
  });
  it('rejects incorrect dimensions and releases the bitmap', async () => {
    const bitmap = { width: 4000, height: 3000, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    try {
      await expect(prepareListingImage({ type: 'image/jpeg', size: 100 })).rejects.toThrow('1024 × 768');
      expect(bitmap.close).toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it('encodes required dimensions and releases the decoded image', async () => {
    const bitmap = { width: 1024, height: 768, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const drawImage = vi.fn();
    const blob = new Blob(['image'], { type: 'image/jpeg' });
    const canvas = { getContext: () => ({ fillRect: vi.fn(), drawImage }), toBlob: (callback) => callback(blob) };
    vi.stubGlobal('document', { createElement: () => canvas });
    try {
      expect(await prepareListingImage({ type: 'image/jpeg', size: 100 })).toBe(blob);
      expect(canvas.width).toBe(1024);
      expect(canvas.height).toBe(768);
      expect(bitmap.close).toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
