/** Shimmer placeholders shown while async data resolves. */
export function SkeletonBlock({ width = '100%', height = 14, radius = 6 }: { width?: number | string; height?: number; radius?: number }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius, display: 'inline-block' }} />;
}

export function SkeletonTiles({ count = 6 }: { count?: number }) {
  return (
    <div className="dash-grid" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div className="dash-tile" key={i}>
          <SkeletonBlock width="55%" height={10} />
          <div style={{ marginTop: 8 }}><SkeletonBlock width="70%" height={22} /></div>
          <div style={{ marginTop: 8 }}><SkeletonBlock width="40%" height={10} /></div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <table className="data-table" aria-busy="true" aria-label="Loading">
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c}><SkeletonBlock width={c === 0 ? '60%' : '80%'} /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
