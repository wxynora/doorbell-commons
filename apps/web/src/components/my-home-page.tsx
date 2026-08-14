import type { MyHomeViewModel } from "../view-models";

const hempRopeUrl = new URL("../preview/assets/hemp-rope-tile.png", import.meta.url).href;
const homeMailboxUrl = new URL("../preview/assets/home-mailbox-candidate2.png", import.meta.url)
  .href;

interface MyHomePageProps {
  home: MyHomeViewModel;
}

function currentSeason(date = new Date()) {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) {
    return "春季";
  }
  if (month >= 5 && month <= 7) {
    return "夏季";
  }
  if (month >= 8 && month <= 10) {
    return "秋季";
  }
  return "冬季";
}

function DisplayValue({ value, empty = "—" }: { value: string | null; empty?: string }) {
  return value ? value : <span className="empty-value">{empty}</span>;
}

export function MyHomePage({ home }: MyHomePageProps) {
  return (
    <main className="app-screen my-home-page" id="main-content">
      <header className="home-overview-header">
        <div className="hanging-home-sign-wrap">
          <span
            className="home-sign-cord home-sign-cord--left"
            style={{ backgroundImage: `url(${hempRopeUrl})` }}
            aria-hidden="true"
          />
          <span
            className="home-sign-cord home-sign-cord--right"
            style={{ backgroundImage: `url(${hempRopeUrl})` }}
            aria-hidden="true"
          />
          <div className="hanging-home-sign">
            <span className="home-sign-rivet home-sign-rivet--left" aria-hidden="true" />
            <span className="home-sign-rivet home-sign-rivet--right" aria-hidden="true" />
            <p>
              家园门牌 <DisplayValue value={home.homeDoorplate} />
            </p>
            <h1>{home.familyName}</h1>
          </div>
        </div>

        <div className="home-overview-meta">
          <p>
            <DisplayValue value={home.climateName} empty="气候未设置" />
          </p>
          <p>
            <DisplayValue value={home.weather.condition} empty="天气未接入" /> / {currentSeason()}
          </p>
        </div>
      </header>

      <section className="home-entry-grid" aria-label="家园入口">
        <button disabled type="button">
          <span>会客厅</span>
          <small>当前无人来访</small>
        </button>
        <button disabled type="button">
          <span>家庭设置</span>
          <small>环境描述与气候</small>
        </button>
      </section>

      <section className="home-status-note" aria-label="当前家园状态">
        <p>门铃与访客功能尚未接入</p>
        <span className="serrated-rule" aria-hidden="true" />
      </section>

      <button
        className="home-mailbox-entry"
        disabled
        type="button"
        aria-label="Doorbell 信箱尚未接入"
      >
        <img alt="" draggable="false" src={homeMailboxUrl} />
      </button>
    </main>
  );
}
