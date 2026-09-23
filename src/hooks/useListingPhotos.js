import { useEffect, useState } from 'react';
import { loadListingImages } from '../lib/listingImages';

export function useListingPhotos(unitId, preview = false) {
  const [photos, setPhotos] = useState([]);
  useEffect(() => {
    let active = true;
    setPhotos([]);
    async function load() {
      try {
        const rows = await loadListingImages(unitId, !preview);
        if (active) setPhotos(rows);
      } catch { if (active) setPhotos([]); }
    }
    if (unitId) load();
    const timer = setInterval(load, 50 * 60 * 1000);
    return () => { active = false; clearInterval(timer); };
  }, [unitId, preview]);
  return photos;
}

