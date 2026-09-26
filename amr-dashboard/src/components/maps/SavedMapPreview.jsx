import { useEffect, useRef, useState } from 'react';
import storage from '../../services/MapStorageService.js';
import { screenToWorld, getCellOccupancy } from '../../utils/mapGeometry.js';

export default function SavedMapPreview({ map, onPick }) {
  const [pkg, setPackage] = useState(null);
  const [error, setError] = useState(null);
  const canvas = useRef(null);
  useEffect(() => {
    let alive = true;
    setPackage(null); setError(null);
    storage.loadMapArtifact(map).then(value => { if (alive) setPackage(value); }).catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [map]);
  useEffect(() => {
    if (!pkg || !canvas.current) return;
    const target = canvas.current;
    // Native grid pixels; CSS scales both display and pointer conversion.
    target.width = pkg.width; target.height = pkg.height;
    const context = target.getContext('2d');
    const pixels = context.createImageData(pkg.width, pkg.height);
    for (let row = 0; row < pkg.height; row++) for (let col = 0; col < pkg.width; col++) {
      const occupancy = pkg.data[row * pkg.width + col];
      const value = occupancy === 0 ? 155 : occupancy === 100 ? 25 : 70;
      const offset = ((pkg.height - 1 - row) * pkg.width + col) * 4;
      pixels.data.set([value, value, value, 255], offset);
    }
    context.putImageData(pixels, 0, 0);
  }, [pkg]);
  function pick(event) {
    if (!pkg || !onPick) return;
    const rect = canvas.current.getBoundingClientRect();
    const point = screenToWorld({ sx: (event.clientX-rect.left) * pkg.width / rect.width, sy: (event.clientY-rect.top) * pkg.height / rect.height, ...pkg.manifest.grid });
    if (point.isInside && getCellOccupancy(point.col, point.row, pkg.width, pkg.height, pkg.data).type === 'free') {
      onPick({ x: point.wx.toFixed(3), y: point.wy.toFixed(3) }); setError(null);
    } else setError('Select a free cell inside the saved map.');
  }
  return <figure className="my-3 rounded border border-deck-line p-2">
    <figcaption className="font-mono text-xs text-ink-mid">SAVED MAP PREVIEW · {onPick ? 'Click a free cell or enter coordinates below.' : 'Not live robot telemetry.'}</figcaption>
    <canvas ref={canvas} onClick={pick} aria-label="Saved occupancy map preview" className="mx-auto mt-2 max-h-64 max-w-full" style={{ imageRendering: 'pixelated' }} />
    {error && <p role="alert" className="text-signal-amber text-xs">{error}</p>}
  </figure>;
}
