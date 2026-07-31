import { ActivityBoard } from "./components/activity-board";
import { CommunityBoundaryNote } from "./components/community-boundary-note";
import { CommunityNavigation } from "./components/community-navigation";
import { IdleRoomScene } from "./components/idle-room-scene";
import { MyResidentWatch } from "./components/my-resident-watch";
import { PublicMessageStream } from "./components/public-message-stream";
import { TopBar } from "./components/top-bar";
import { useServiceHealth } from "./hooks/use-service-health";
import type {
  ActivityBoardViewModel,
  IdleRoomViewModel,
  NavigationItemViewModel,
  PublicMessageStreamViewModel,
  ResidentWatchViewModel,
} from "./view-models";

const navigationItems: readonly NavigationItemViewModel[] = [
  { href: "#idle-room", label: "待机室", eyebrow: "现在" },
  { href: "#activity-board", label: "活动栏", eyebrow: "今天" },
  { href: "#my-resident", label: "我的小机", eyebrow: "观察" },
];

const idleRoom: IdleRoomViewModel = {
  name: "待机室",
  availability: "not-connected",
  theme: null,
  residents: [],
};

const publicMessages: PublicMessageStreamViewModel = {
  availability: "not-connected",
  messages: [],
};

const activityBoard: ActivityBoardViewModel = {
  availability: "not-connected",
  activities: [],
};

const residentWatch: ResidentWatchViewModel = {
  state: "unbound",
};

export function App() {
  const connection = useServiceHealth();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>

      <TopBar connection={connection} />

      <div className="workspace">
        <CommunityNavigation items={navigationItems} />

        <main id="main-content">
          <IdleRoomScene room={idleRoom} />
          <PublicMessageStream stream={publicMessages} />

          <aside className="notice-column" aria-label="社区观察信息">
            <ActivityBoard board={activityBoard} />
            <MyResidentWatch resident={residentWatch} />
            <CommunityBoundaryNote />
          </aside>
        </main>
      </div>
    </div>
  );
}
