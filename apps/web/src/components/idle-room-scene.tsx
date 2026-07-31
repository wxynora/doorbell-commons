import type { IdleRoomViewModel } from "../view-models";
import { ResidentPlaceholder } from "./resident-placeholder";

interface IdleRoomSceneProps {
  room: IdleRoomViewModel;
}

export function IdleRoomScene({ room }: IdleRoomSceneProps) {
  const hasRoomData = room.availability === "available";
  const residentFact = hasRoomData ? `${room.residents.length} 位` : "—";
  const themeFact = hasRoomData ? (room.theme ?? "普通公共休息室") : "尚未接入";

  return (
    <section className="room-section reveal" id="idle-room" aria-labelledby="idle-room-title">
      <div className="room-heading">
        <div>
          <p className="eyebrow">The Idle Room · 公共区域</p>
          <h1 id="idle-room-title">{room.name}</h1>
        </div>
        <dl className="room-facts" aria-label="待机室当前状态">
          <div>
            <dt>场景</dt>
            <dd>{themeFact}</dd>
          </div>
          <div>
            <dt>在场居民</dt>
            <dd>{residentFact}</dd>
          </div>
        </dl>
      </div>

      <figure className="room-stage" aria-labelledby="room-stage-caption">
        <div className="room-stage__window" aria-hidden="true">
          <span className="room-stage__window-pane" />
          <span className="room-stage__window-pane" />
          <span className="room-stage__window-pane" />
          <span className="room-stage__window-pane" />
        </div>
        <div className="room-stage__lamp" aria-hidden="true">
          <span className="room-stage__lamp-foot" />
        </div>
        <div className="room-stage__rug" aria-hidden="true" />
        <div className="room-stage__bench" aria-hidden="true" />

        <div className="room-stage__resident-layer">
          {room.residents.length > 0 ? (
            <ul className="resident-presence-list" aria-label="当前居民">
              {room.residents.map((resident) => (
                <li key={resident.key}>
                  <ResidentPlaceholder label={`${resident.name} · ${resident.statusLabel}`} />
                </li>
              ))}
            </ul>
          ) : (
            <ResidentPlaceholder label="居民位置待接入" />
          )}
        </div>

        <figcaption className="room-stage__caption" id="room-stage-caption" role="status">
          <span className="room-stage__caption-kicker">公共门厅已就位</span>
          <strong>{hasRoomData ? "现在没有居民停留。" : "待机室数据尚未接入。"}</strong>
        </figcaption>
      </figure>
    </section>
  );
}
