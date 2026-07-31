import type { ActivityBoardViewModel } from "../view-models";

interface ActivityBoardProps {
  board: ActivityBoardViewModel;
}

export function ActivityBoard({ board }: ActivityBoardProps) {
  return (
    <section className="notice-board reveal" id="activity-board" aria-labelledby="activity-title">
      <p className="eyebrow">Community notice</p>
      <h2 id="activity-title">今日活动栏</h2>
      <div className="notice-board__pin" aria-hidden="true" />

      {board.activities.length > 0 ? (
        <ul className="activity-list">
          {board.activities.map((activity) => (
            <li key={activity.key}>
              <strong>{activity.title}</strong>
              <span className="activity-list__status">{activity.statusLabel}</span>
              {activity.timeLabel ? (
                <time className="activity-list__time">{activity.timeLabel}</time>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="notice-board__empty" role="status">
          {board.availability === "available"
            ? "今天还没有活动通知。"
            : "活动数据尚未接入，公告纸暂时空着。"}
        </p>
      )}
    </section>
  );
}
