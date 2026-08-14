import type { LingyePlaceId, LingyePlaceViewModel } from "../view-models";

interface LingyeMapPageProps {
  notice: string | null;
  places: readonly LingyePlaceViewModel[];
  onOpenPlace: (placeId: LingyePlaceId) => void;
  onOpenTogether: () => void;
}

export function LingyeMapPage({ notice, places, onOpenPlace, onOpenTogether }: LingyeMapPageProps) {
  return (
    <main className="lingye-map-page" id="main-content">
      <section aria-label="铃野地图，可左右滑动查看全部地点" className="lingye-map-viewport">
        <div className="lingye-map-canvas">
          <img
            alt="铃野公共世界地图"
            className="lingye-map-image"
            draggable="false"
            height="1536"
            src="/lingye/map.png"
            width="1024"
          />

          {places.map((place) => (
            <button
              aria-label={`进入${place.label}`}
              className="lingye-place-button"
              key={place.id}
              onClick={() => onOpenPlace(place.id)}
              style={{ left: `${place.left}%`, top: `${place.top}%` }}
              type="button"
            >
              <img alt="" draggable="false" src={place.imageUrl} />
            </button>
          ))}

        </div>
      </section>

      <button
        aria-label="进入铃野共行"
        className="lingye-together-entry"
        onClick={onOpenTogether}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M7.8 8.5h8.4c1.2 0 2.2.8 2.5 1.9l1.1 4.2c.4 1.6-1.5 2.8-2.7 1.7l-1.7-1.5H8.6l-1.7 1.5c-1.2 1.1-3.1-.1-2.7-1.7l1.1-4.2c.3-1.1 1.3-1.9 2.5-1.9Z" />
          <path d="M8.5 10.7v3M7 12.2h3M15.8 11.5h.1M17.2 13h.1" />
        </svg>
      </button>

      {notice ? (
        <p className="lingye-map-notice" role="status">
          {notice}
        </p>
      ) : null}
    </main>
  );
}
