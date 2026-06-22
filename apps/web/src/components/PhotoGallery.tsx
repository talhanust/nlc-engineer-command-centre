import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../data/DataContext';
import { useToast } from './Toast';
import type { ProjectPhoto } from '../data/types';

type SortKey = 'newest' | 'oldest' | 'added';

/** Downscale an image file to a data URL (max edge ~1280px, JPEG) to keep storage small. */
function fileToDataUrl(file: File, maxEdge = 1280, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode failed'));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale); const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(reader.result as string); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Progress photo gallery: upload files (or add by URL), date + caption, sortable. */
export function PhotoGallery({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const { toast } = useToast();
  const [photos, setPhotos] = useState<ProjectPhoto[]>([]);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [dated, setDated] = useState(new Date().toISOString().slice(0, 10));
  const [zoom, setZoom] = useState<ProjectPhoto | null>(null);
  const [sort, setSort] = useState<SortKey>('newest');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function reload() { setPhotos(await provider.listPhotos(projectId)); }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const sorted = useMemo(() => {
    const arr = [...photos];
    if (sort === 'added') return arr.reverse();
    return arr.sort((a, b) => sort === 'newest' ? b.dated.localeCompare(a.dated) : a.dated.localeCompare(b.dated));
  }, [photos, sort]);

  // group date-wise for the "by date" headers
  const groups = useMemo(() => {
    const m = new Map<string, ProjectPhoto[]>();
    for (const p of sorted) { const k = p.dated || 'Undated'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(p); }
    return [...m.entries()];
  }, [sorted]);

  async function add() {
    if (!url.trim()) return;
    await provider.addPhoto(projectId, { url: url.trim(), caption: caption.trim(), dated });
    setUrl(''); setCaption(''); await reload();
    toast({ message: 'Photo added', kind: 'success' });
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    let n = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const dataUrl = await fileToDataUrl(file);
        await provider.addPhoto(projectId, { url: dataUrl, caption: caption.trim() || file.name.replace(/\.[^.]+$/, ''), dated });
        n++;
      } catch { /* skip unreadable file */ }
    }
    setBusy(false); setCaption('');
    if (fileRef.current) fileRef.current.value = '';
    await reload();
    toast({ message: `${n} photo${n === 1 ? '' : 's'} uploaded`, kind: 'success' });
  }

  async function remove(photo: ProjectPhoto) {
    await provider.deletePhoto(projectId, photo.id);
    await reload();
    toast({
      message: 'Photo removed', kind: 'info', actionLabel: 'Undo',
      onAction: async () => { await provider.addPhoto(projectId, { url: photo.url, caption: photo.caption, dated: photo.dated }); await reload(); },
    });
  }

  return (
    <div>
      <div className="section-head">
        <h3>Progress photo gallery</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label className="small muted">Sort
            <select aria-label="Sort photos" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ marginLeft: 6 }}>
              <option value="newest">Date — newest first</option>
              <option value="oldest">Date — oldest first</option>
              <option value="added">Recently added</option>
            </select>
          </label>
          <span className="muted small">{photos.length} photos</span>
        </div>
      </div>

      <div className="card create-row" style={{ flexWrap: 'wrap' }}>
        <input aria-label="Photo date" type="date" value={dated} onChange={(e) => setDated(e.target.value)} />
        <input aria-label="Photo caption" placeholder="Caption / description" value={caption} onChange={(e) => setCaption(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <input ref={fileRef} aria-label="Upload photos" type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => onFiles(e.target.files)} />
        <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Uploading…' : '⬆ Upload images'}</button>
        <span className="muted small">or</span>
        <input aria-label="Photo URL" placeholder="Image URL (https://…)" value={url} onChange={(e) => setUrl(e.target.value)} style={{ minWidth: 180 }} />
        <button className="btn-ghost" onClick={add}>Add by URL</button>
      </div>

      {photos.length === 0 ? (
        <p className="muted">No photos yet. Upload site-progress images (with a date and description) to start the gallery — they'll be arranged by date.</p>
      ) : (
        groups.map(([day, items]) => (
          <div key={day} className="cal-horizon">
            <h4 className="cal-horizon-title">{day} <span className="muted small">· {items.length}</span></h4>
            <div className="photo-grid">
              {items.map((p) => (
                <figure key={p.id} className="photo-card">
                  <button className="photo-zoom" aria-label={`Zoom ${p.caption || p.id}`} onClick={() => setZoom(p)}>
                    <img src={p.url} alt={p.caption} loading="lazy" />
                  </button>
                  <figcaption>
                    <span>{p.caption || 'Untitled'}</span>
                    <span className="muted small">{p.dated}</span>
                  </figcaption>
                  <button className="btn-ghost photo-del" aria-label={`Delete ${p.caption || p.id}`} onClick={() => remove(p)}>✕</button>
                </figure>
              ))}
            </div>
          </div>
        ))
      )}

      {zoom && (
        <div className="lightbox" role="dialog" aria-label="Photo viewer" onClick={() => setZoom(null)}>
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={zoom.url} alt={zoom.caption} />
            <figcaption>{zoom.caption} · <span className="muted">{zoom.dated}</span></figcaption>
          </figure>
          <button className="btn-ghost lightbox-close" aria-label="Close viewer" onClick={() => setZoom(null)}>Close ✕</button>
        </div>
      )}
    </div>
  );
}
