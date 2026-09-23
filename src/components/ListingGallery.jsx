import { useState } from 'react';

export function ListingGallery({ photos }) {
  const [selectedId, setSelectedId] = useState(null);
  if (!photos.length) return null;
  const selected = photos.find(photo => photo.id === selectedId) || photos[0];
  const index = photos.indexOf(selected);
  return <section className="listing-gallery" aria-label="Listing photos">
    <figure>
      <img src={selected.url} alt={selected.label || `Listing photo ${index + 1}`} width="1024" height="768" />
      <figcaption aria-live="polite">{selected.label || `Photo ${index + 1}`} · {index + 1} of {photos.length}</figcaption>
    </figure>
    {photos.length > 1 && <div className="listing-gallery-thumbnails">{photos.map((photo, position) => <button type="button" key={photo.id} aria-label={`View ${photo.label || `photo ${position + 1}`}`} aria-pressed={photo.id === selected.id} onClick={() => setSelectedId(photo.id)}><img src={photo.url} alt="" width="128" height="96" loading="lazy" /></button>)}</div>}
  </section>;
}
