export function ErrorState() {
  return (
    <main className="state-page">
      <div className="state-card">
        <span className="eyebrow">DATA UNAVAILABLE</span>
        <h1>The dashboard could not load its local aggregates.</h1>
        <p>Run <code>npm run sync:data</code> from the web folder, then refresh this page.</p>
      </div>
    </main>
  );
}
