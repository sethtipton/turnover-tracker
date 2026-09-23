import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { loadListingImages, uploadListingImage, updateListingImage, reorderListingImages } from '../lib/listingImages';

export function ListingImages({ unit }) {
  const [images, setImages] = useState([]);
  const [queue, setQueue] = useState([]);
  const [error, setError] = useState('');
  const [removed, setRemoved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  async function refresh() {
    setError('');
    try { setImages(await loadListingImages(unit.id)); }
    catch { setError('Could not load saved photos. Try again.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const rows = await loadListingImages(unit.id); if (active) { setImages(rows); setError(''); } }
      catch { if (active) setError('Could not load saved photos. Try again.'); }
      finally { if (active) setLoading(false); }
    };
    load();
    const timer = setInterval(load, 50 * 60 * 1000);
    return () => { active = false; clearInterval(timer); };
  }, [unit.id]);

  async function run(entries) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    const update = (id, patch) => setQueue(current => current.map(entry => entry.id === id ? { ...entry, ...patch } : entry));
    try {
      for (const entry of entries) {
        update(entry.id, { error: '', status: 'Preparing…' });
        try {
          await uploadListingImage(unit.id, entry, status => update(entry.id, { status }));
          update(entry.id, { status: 'Saved', file: null });
        } catch (uploadError) {
          update(entry.id, { status: 'Not saved', error: uploadError.message || 'Upload failed. Try again.' });
        }
      }
      await refresh();
    } finally { running.current = false; setBusy(false); }
  }

  function choose(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || running.current) return;
    const start = Math.max(-1, ...images.map(image => image.sort_order), ...queue.map(entry => entry.order)) + 1;
    const entries = files.map((file, index) => ({ id: crypto.randomUUID(), file, name: file.name, order: start + index, status: 'Waiting' }));
    setQueue(current => [...current.filter(entry => entry.status !== 'Saved'), ...entries]);
    run(entries);
  }

  async function changePhoto(action) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try { await action(); await refresh(); }
    catch (e) { setError(e.message || 'Could not save photo changes. Try again.'); }
    finally { running.current = false; setBusy(false); }
  }
  function move(index, destination) {
    const ids = images.map(image => image.id);
    const [id] = ids.splice(index, 1);
    ids.splice(destination, 0, id);
    return changePhoto(() => reorderListingImages(unit.id, ids));
  }

  return <details aria-label={`${unit.name} listing images`}>
    <summary><span>Images</span><ChevronDown size={18} aria-hidden="true" /></summary>
    <div className="listing-images">
    <p>Add photos and labels, then choose their order. The first photo is the cover. Photos appear publicly when this listing is published as Available or Coming soon.</p>
    <label className="form-field"><span>Add photos</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || loading} onChange={choose} /></label>
    <p>Images must be 1024 × 768 pixels. JPEG, PNG or WebP, up to 20 MB each.</p>
    {removed && <p role="status">Photo removed. <button type="button" disabled={busy} onClick={() => changePhoto(async () => { await updateListingImage(removed.id, { removed_at: null }); setRemoved(null); })}>Undo removal</button></p>}
    {loading && <p role="status">Loading photos…</p>}
    {error && <p role="alert">{error} <button type="button" onClick={refresh}>Retry loading</button></p>}
    {!loading && !error && !images.length && <p>No photos uploaded yet.</p>}
    <ul className="listing-image-grid">{images.map((image, index) => <li key={image.id}>
      <img src={image.url} alt={image.label || `Listing photo ${index + 1}`} />
      {index === 0 && <strong>Cover photo</strong>}
      <PhotoLabel image={image} busy={busy} onSave={label => changePhoto(() => updateListingImage(image.id, { label }))} />
      <div className="listing-photo-actions">
        <button type="button" disabled={busy || index === 0} onClick={() => move(index, 0)}>Make cover</button>
        <button type="button" aria-label={`Move photo ${index + 1} earlier`} disabled={busy || index === 0} onClick={() => move(index, index - 1)}>Earlier</button>
        <button type="button" aria-label={`Move photo ${index + 1} later`} disabled={busy || index === images.length - 1} onClick={() => move(index, index + 1)}>Later</button>
        <button type="button" disabled={busy} onClick={() => changePhoto(async () => { await updateListingImage(image.id, { removed_at: new Date().toISOString() }); setRemoved(image); })}>Remove</button>
      </div>
    </li>)}</ul>
    <ul className="listing-image-progress" aria-live="polite">{queue.map(entry => <li key={entry.id}><span>{entry.name} — {entry.status}</span>{entry.error && <><span role="alert">{entry.error}</span><button type="button" disabled={busy} onClick={() => run([entry])}>Retry upload</button></>}</li>)}</ul>
    </div>
  </details>;
}

function PhotoLabel({ image, busy, onSave }) {
  const [label, setLabel] = useState(image.label);
  return <div className="form-field"><label><span>Photo label</span><input value={label} maxLength={120} placeholder="Kitchen, bedroom, exterior…" onChange={event => setLabel(event.target.value)} /></label><button type="button" disabled={busy || label === image.label} onClick={() => onSave(label.trim())}>Save label</button></div>;
}
