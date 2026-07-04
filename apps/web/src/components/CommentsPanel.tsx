import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import type { NodeComment } from '../data/types';

export function CommentsPanel({ nodeId }: { nodeId: string }) {
  const { provider } = useData();
  const [comments, setComments] = useState<NodeComment[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    provider.listComments(nodeId).then((c) => alive && setComments(c));
    return () => {
      alive = false;
    };
  }, [provider, nodeId]);

  async function submit() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const created = await provider.addComment(nodeId, body);
      setComments((prev) => [created, ...prev]);
      setDraft('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card panel">
      <h3>Notes &amp; comments</h3>
      <div className="comment-compose">
        <textarea
          aria-label="Add a comment"
          placeholder="Add a note for this node…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
        />
        <button className="btn" onClick={submit} disabled={busy || draft.trim() === ''}>
          Post
        </button>
      </div>
      {comments.length === 0 ? (
        <p className="muted">No comments yet.</p>
      ) : (
        <ul className="comments">
          {comments.map((c) => (
            <li key={c.id}>
              <div className="comment-head">
                <strong>{c.author}</strong>
                <span className="muted small">{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              {/* Rendered as text (React escapes) — defence in depth with the
                  write-time sanitizer. */}
              <div className="comment-body">{c.body}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
