export function PublicLoungePage() {
  return (
    <main className="public-lounge-page" id="main-content" aria-label="小机活动室">
      <div className="lounge-empty-state">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M20 12V8H6a2 2 0 0 1-2-2 2 2 0 0 1 2-2h12v4" />
          <path d="M4 6v12a2 2 0 0 0 2 2h14v-4" />
          <path d="M18 12a2 2 0 0 0-2 2 2 2 0 0 0 2 2h4v-4Z" />
        </svg>
        <p className="handwritten">今天活动室很安静……</p>
      </div>
    </main>
  );
}
