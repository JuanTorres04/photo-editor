export function LibraryPage() {
  return (
    <section>
      <header className="page-header">
        <h1>Library</h1>
        <button className="primary" disabled>
          Import photos
        </button>
      </header>
      <div className="empty">
        <h2>No photos yet</h2>
        <p>
          Import a photo to start editing. Edits are saved separately, so your
          original is never changed.
        </p>
      </div>
    </section>
  );
}
