export function VillageMapGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" focusable="false">
      <path
        d="M3.5 8.6 9 6l5.8 2.6 5.7-2.4v12l-5.7 2.5L9 18l-5.5 2.5zM9 6v12m5.8-9.4v12.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.5 3.25a3 3 0 0 0-3 3c0 2.1 3 4.8 3 4.8s3-2.7 3-4.8a3 3 0 0 0-3-3z"
        fill="var(--map-pin, #ad7553)"
        stroke="var(--map-pin-edge, #faf3dc)"
        strokeWidth="1"
      />
      <circle cx="15.5" cy="6.25" r=".8" fill="var(--map-pin-edge, #faf3dc)" />
    </svg>
  );
}
