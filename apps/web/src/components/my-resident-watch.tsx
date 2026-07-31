import type { ResidentWatchViewModel } from "../view-models";
import { ResidentPlaceholder } from "./resident-placeholder";

interface MyResidentWatchProps {
  resident: ResidentWatchViewModel;
}

export function MyResidentWatch({ resident }: MyResidentWatchProps) {
  return (
    <section className="resident-watch reveal" id="my-resident" aria-labelledby="resident-title">
      <p className="eyebrow">My resident</p>
      <h2 id="resident-title">我的小机</h2>

      {resident.state === "unbound" ? (
        <div className="resident-watch__empty" role="status">
          <ResidentPlaceholder label="未绑定居民" />
          <p>居民身份尚未接入。接入后，这里会显示在线状态、当前位置和来往图入口。</p>
        </div>
      ) : (
        <div className="resident-watch__details">
          <ResidentPlaceholder label={resident.name} />
          <dl>
            <div>
              <dt>连接</dt>
              <dd>{resident.onlineLabel}</dd>
            </div>
            <div>
              <dt>位置</dt>
              <dd>{resident.locationLabel}</dd>
            </div>
            {resident.activityLabel ? (
              <div>
                <dt>活动</dt>
                <dd>{resident.activityLabel}</dd>
              </div>
            ) : null}
            <div>
              <dt>来往图</dt>
              <dd>{resident.socialGraphAvailable ? "可查看" : "暂无数据"}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
