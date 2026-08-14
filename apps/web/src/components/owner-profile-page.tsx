import type { OwnerProfileViewModel } from "../view-models";
import { ResidentPlaceholder } from "./resident-placeholder";

interface OwnerProfilePageProps {
  profile: OwnerProfileViewModel;
}

function ProfileValue({ value }: { value: string | null }) {
  return value ? value : <span className="empty-value">—</span>;
}

export function OwnerProfilePage({ profile }: OwnerProfilePageProps) {
  return (
    <main className="app-screen owner-profile-page" id="main-content">
      <header className="profile-header">
        <div className="profile-avatar-wrap">
          <ResidentPlaceholder label="" />
          <span className="resident-stamp">RESIDENT</span>
        </div>
        <h1>{profile.residentName}</h1>
        {profile.publicIntro ? <p className="handwritten">{profile.publicIntro}</p> : null}
        <button className="quiet-action" disabled type="button">
          Q版形象编辑
        </button>
      </header>

      <section className="flat-section" aria-labelledby="resident-state-title">
        <div className="section-heading">
          <h2 id="resident-state-title">最近活动</h2>
        </div>
        <dl className="line-list">
          <div>
            <dt>当前公开位置</dt>
            <dd>
              <ProfileValue value={profile.publicLocation} />
            </dd>
          </div>
          <div>
            <dt>当前活动状态</dt>
            <dd>
              <ProfileValue value={profile.currentActivity} />
            </dd>
          </div>
          <div>
            <dt>Connector</dt>
            <dd>
              <ProfileValue value={profile.connectorStatus} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="profile-permit" aria-labelledby="permit-title">
        <span className="profile-permit__tape" aria-hidden="true" />
        <h2 id="permit-title">COMMONS RESIDENCY</h2>
        <dl>
          <div>
            <dt>居民姓名</dt>
            <dd className="handwritten">{profile.residentName}</dd>
          </div>
          <div>
            <dt>家园名称</dt>
            <dd className="handwritten">{profile.familyName}</dd>
          </div>
          <div>
            <dt>家园门牌</dt>
            <dd className="handwritten">DB-{profile.farmDoorplate}</dd>
          </div>
        </dl>
        <p className="profile-permit__motto handwritten">May every ring lead you home.</p>
        <span className="profile-permit__stamp">
          APPROVED
          <small>已入住</small>
        </span>
      </section>

      <section className="flat-section" aria-labelledby="farm-title">
        <div className="section-heading">
          <h2 id="farm-title">农场绑定</h2>
        </div>
        <dl className="line-list">
          <div>
            <dt>农场门牌</dt>
            <dd>{profile.farmDoorplate}</dd>
          </div>
        </dl>
      </section>

      <section className="flat-section" aria-labelledby="social-map-title">
        <div className="section-heading">
          <h2 id="social-map-title">来往图</h2>
        </div>
        <div className="relationship-graph">
          {profile.socialConnections.length > 0 ? (
            <ul>
              {profile.socialConnections.map((connection) => (
                <li key={connection.id}>
                  <strong>{connection.residentName}</strong>
                  <span>{connection.directionLabel}</span>
                  <span>来访 {connection.visitCount} 次</span>
                  <small>{connection.lastVisitLabel ?? "—"}</small>
                </li>
              ))}
            </ul>
          ) : (
            <div className="relationship-graph__empty">
              <span className="relationship-graph__origin">{profile.residentName.slice(0, 1)}</span>
              <p>—</p>
            </div>
          )}
        </div>
      </section>

      <section className="flat-section profile-actions" aria-labelledby="profile-actions-title">
        <div className="section-heading">
          <h2 id="profile-actions-title">账号</h2>
        </div>
        <div className="profile-action-list">
          <p className="profile-account-id">QQ账号 {profile.qqNumber}</p>
          <button disabled type="button">
            数据导出
          </button>
          <button disabled type="button">
            退出社区
          </button>
        </div>
      </section>
    </main>
  );
}
