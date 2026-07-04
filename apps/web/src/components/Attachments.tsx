import { useEffect, useRef, useState } from 'react';
import { useData } from '../data/DataContext';
import { useToast } from './Toast';
import { readImageDownscaled, readFileAsDataUrl, dataUrlBytes, humanSize } from '../domain/files';
import type { Attachment } from '../data/types';

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB ceiling for non-image files

/** Upload, list, view and remove documents attached to one entity (IPC, RAR, …). */
export function Attachments({ projectId, entity, reference }: { projectId: string; entity: string; reference: string }) {
  const { provider } = useData();
  const { toast } = useToast();
  const [items, setItems] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function reload() { setItems(await provider.listAttachments(projectId, entity, reference)); }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId, entity, reference]);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    let n = 0; let skipped = 0;
    for (const file of Array.from(files)) {
      try {
        const isImage = file.type.startsWith('image/');
        const dataUrl = isImage ? await readImageDownscaled(file) : await readFileAsDataUrl(file);
        const size = dataUrlBytes(dataUrl);
        if (!isImage && size > MAX_BYTES) { skipped++; continue; }
        await provider.addAttachment(projectId, {
          entity, reference, name: file.name, dataUrl,
          mime: isImage ? 'image/jpeg' : (file.type || 'application/octet-stream'),
          size, dated: new Date().toISOString().slice(0, 10),
        });
        n++;
      } catch { skipped++; }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
    await reload();
    toast({ message: `${n} attached${skipped ? ` · ${skipped} skipped (>4 MB)` : ''}`, kind: skipped ? 'info' : 'success' });
  }

  function open(att: Attachment) {
    const w = window.open();
    if (w) w.document.write(`<title>${att.name}</title><iframe src="${att.dataUrl}" style="border:0;width:100%;height:100%"></iframe>`);
  }

  async function remove(att: Attachment) {
    await provider.deleteAttachment(projectId, att.id);
    await reload();
    toast({
      message: 'Attachment removed', kind: 'info', actionLabel: 'Undo',
      onAction: async () => { await provider.addAttachment(projectId, { entity, reference, name: att.name, dataUrl: att.dataUrl, mime: att.mime, size: att.size, dated: att.dated, note: att.note }); await reload(); },
    });
  }

  const icon = (mime: string) => (mime.startsWith('image/') ? '🖼' : mime.includes('pdf') ? '📄' : '📎');

  return (
    <div>
      <div className="section-head" style={{ marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>Attachments <span className="muted small">· {items.length}</span></h3>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple aria-label={`Attach to ${reference}`} style={{ display: 'none' }} onChange={(e) => onFiles(e.target.files)} />
        <button className="btn-ghost btn-mini" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Uploading…' : '＋ Attach file'}</button>
      </div>
      <p className="muted small" style={{ margin: '0 0 8px' }}>Measurement sheets, test certificates, approvals. Images are downscaled; other files up to 4 MB.</p>
      {items.length === 0 ? (
        <p className="muted small">No documents attached to {reference} yet.</p>
      ) : (
        <ul className="attach-list" aria-label={`Attachments for ${reference}`}>
          {items.map((a) => (
            <li key={a.id} className="attach-row">
              <button className="attach-open" onClick={() => open(a)} aria-label={`Open ${a.name}`}>
                <span className="attach-ic" aria-hidden>{icon(a.mime)}</span>
                <span className="attach-name">{a.name}</span>
              </button>
              <span className="muted small">{humanSize(a.size)} · {a.dated}</span>
              <button className="btn-ghost btn-mini" aria-label={`Remove ${a.name}`} onClick={() => remove(a)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
