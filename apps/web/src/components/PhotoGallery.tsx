import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import { useToast } from './Toast';
import type { ProjectPhoto } from '../data/types';

/** Progress photo gallery: add by URL, view in a lightbox, delete. */
export function PhotoGallery({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const { toast } = useToast();
  const [photos, setPhotos] = useState<ProjectPhoto[]>([]);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [dated, setDated] = useState('2026-06-01');
  const [zoom, setZoom] = useState<ProjectPhoto | null>(null);

  async function reload() { setPhotos(await provider.listPhotos(projectId)); }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId]);

  async function add() {
    if (!url.trim()) return;
    await provider.addPhoto(projectId, { url: url.trim(), caption: caption.trim(), dated });
    setUrl(''); setCaption(''); await reload();
    toast({ message: 'Photo added', kind: 'success' });
  }
  async function remove(photo: ProjectPhoto) {
    await provider.deletePhoto(projectId, photo.id);
    await reload();
    toast({
      message: 'Photo removed', kind: 'info', actionLabel: 'Undo',
      onAction: async () => {
        await provider.addPhoto(projectId, { url: photo.url, caption: photo.caption, dated: photo.dated });
        await reload();
      },
    });
  }

  return (
    <div>
      <div className="section-head"><h3>Progress photo gallery</h3><span className="muted">{photos.length} photos</span></div>
      <div className="card create-row">
        <input aria-label="Photo URL" placeholder="Image URL (https://…)" value={url} onChange={(e) => setUrl(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        <input aria-label="Photo caption" placeholder="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <input aria-label="Photo date" type="date" value={dated} onChange={(e) => setDated(e.target.value)} />
        <button className="btn" onClick={add}>Add photo</button>
      </div>

      {photos.length === 0 ? (
        <p className="muted">No photos yet. Paste an image URL above to start a site-progress gallery.</p>
      ) : (
        <div className="photo-grid">
          {photos.map((p) => (
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
