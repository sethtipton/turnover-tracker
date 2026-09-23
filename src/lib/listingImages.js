import { supabase } from './supabase';

const bucket = 'listing-images';
const pathFor = (image) => `${image.unit_id}/${image.id}.jpg`;

export async function prepareListingImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP photo. Export HEIC photos as JPEG first.');
  }
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This photo could not be read. Try exporting it as JPEG.');
  }
  try {
    if (bitmap.width !== 1024 || bitmap.height !== 768) throw new Error('Images must be 1024 × 768 pixels. Resize or crop this photo before uploading.');
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 768;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Could not prepare this photo. Try another image.');
    return blob;
  } finally {
    bitmap.close();
  }
}

export async function loadListingImages(unitId, publicOnly = false) {
  const { data, error } = publicOnly
    ? await supabase.rpc('get_public_listing_images', { target_unit_id: unitId })
    : await supabase.from('listing_images').select('*').eq('unit_id', unitId).eq('ready', true).is('removed_at', null).order('sort_order').order('created_at').order('id');
  if (error) throw error;
  return Promise.all(data.map(async (row) => {
    const { data: signed, error: signingError } = await supabase.storage.from(bucket).createSignedUrl(pathFor(row), 3600);
    if (signingError) throw signingError;
    return { ...row, url: signed.signedUrl };
  }));
}

export async function uploadListingImage(unitId, entry, onStatus) {
  onStatus('Preparing…');
  const blob = await prepareListingImage(entry.file);
  const row = { id: entry.id, unit_id: unitId, original_name: entry.file.name, sort_order: entry.order };
  const { error: metadataError } = await supabase.from('listing_images').upsert(row, { onConflict: 'id' });
  if (metadataError) throw metadataError;
  onStatus('Uploading…');
  const { error } = await supabase.storage.from(bucket).upload(pathFor(row), blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { error: saveError } = await supabase.from('listing_images').update({ ready: true }).eq('id', entry.id);
  if (saveError) throw saveError;
}

export async function updateListingImage(id, patch) {
  const { error } = await supabase.from('listing_images').update(patch).eq('id', id);
  if (error) throw error;
}
export async function reorderListingImages(unitId, ids) {
  const { error } = await supabase.rpc('reorder_listing_images', { target_unit_id: unitId, image_ids: ids });
  if (error) throw error;
}
