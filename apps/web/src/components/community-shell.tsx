import { useState } from "react";
import type { HumanIdentity } from "../auth/auth-client";
import { LingyeDailyScreen } from "../daily/lingye-daily-screen";
import type {
  CommunityArea,
  LingyePlaceId,
  LingyePlaceViewModel,
  MyHomeViewModel,
  NavigationItemViewModel,
  OwnerProfileViewModel,
} from "../view-models";
import { DOORBELL_FARM_PATH } from "../routes";
import { CommunityNavigation } from "./community-navigation";
import { LingyeMapPage } from "./lingye-map-page";
import { MyHomePage } from "./my-home-page";
import { OwnerProfilePage } from "./owner-profile-page";
import { PublicLoungePage } from "./public-lounge-page";

interface CommunityShellProps {
  identity: HumanIdentity;
}

const navigationItems: readonly NavigationItemViewModel[] = [
  { id: "activity-room", label: "小机活动室", icon: "lounge" },
  { id: "lingye", label: "铃野", icon: "map" },
  { id: "my-home", label: "我的家", icon: "home" },
  { id: "owner-profile", label: "业主档案", icon: "profile" },
];

export const DOORBELL_INTERNAL_PATHS = {
  farm: DOORBELL_FARM_PATH,
  lingyeGlimmer: "/api/lingye-glimmer",
  lingyeTogether: "/api/lingye-together",
} as const;

type DoorbellInternalPath = (typeof DOORBELL_INTERNAL_PATHS)[keyof typeof DOORBELL_INTERNAL_PATHS];

interface SamePageNavigator {
  assign(path: DoorbellInternalPath): void;
}

export function openDoorbellInternalPage(
  path: DoorbellInternalPath,
  navigator: SamePageNavigator = window.location,
) {
  navigator.assign(path);
}

export function getLingyePlaceInternalPath(placeId: LingyePlaceId): DoorbellInternalPath | null {
  if (placeId === "farm-ranch") {
    return DOORBELL_INTERNAL_PATHS.farm;
  }
  if (placeId === "glimmer-meadow") {
    return DOORBELL_INTERNAL_PATHS.lingyeGlimmer;
  }
  return null;
}

export function isLingyeDailyPlace(placeId: LingyePlaceId): boolean {
  return placeId === "lingye-daily";
}

const lingyePlaces: readonly LingyePlaceViewModel[] = [
  {
    id: "moonlight-pond",
    label: "月光池塘",
    imageUrl: "/lingye/labels/moonlight-pond.png",
    left: 18,
    top: 14,
  },
  {
    id: "crystal-cave",
    label: "水晶洞",
    imageUrl: "/lingye/labels/crystal-cave.png",
    left: 50,
    top: 14,
  },
  {
    id: "geyser-waterfall",
    label: "间歇泉瀑布",
    imageUrl: "/lingye/labels/geyser-waterfall.png",
    left: 82,
    top: 16,
  },
  {
    id: "lingye-daily",
    label: "铃野日报社",
    imageUrl: "/lingye/labels/lingye-daily.png",
    left: 25,
    top: 31,
  },
  {
    id: "lingye-public-security-office",
    label: "铃野治安署",
    imageUrl: "/lingye/labels/lingye-public-security-office.png",
    left: 48,
    top: 29,
  },
  {
    id: "animal-hospital",
    label: "铃野动物医院",
    imageUrl: "/lingye/labels/animal-hospital.png",
    left: 69,
    top: 32,
  },
  {
    id: "vocational-school",
    label: "铃野职业学校",
    imageUrl: "/lingye/labels/vocational-school.png",
    left: 27,
    top: 41,
  },
  {
    id: "bank",
    label: "铃野银行",
    imageUrl: "/lingye/labels/bank.png",
    left: 75,
    top: 41,
  },
  {
    id: "floating-lake",
    label: "浮空之湖",
    imageUrl: "/lingye/labels/floating-lake.png",
    left: 15,
    top: 50,
  },
  {
    id: "detention-center",
    label: "铃野看守所",
    imageUrl: "/lingye/labels/detention-center.png",
    left: 59,
    top: 49,
  },
  {
    id: "mangrove-shoal",
    label: "红树林浅滩",
    imageUrl: "/lingye/labels/mangrove-shoal.png",
    left: 82,
    top: 54,
  },
  {
    id: "commercial-street",
    label: "商业街",
    imageUrl: "/lingye/labels/commercial-street.png",
    left: 48,
    top: 61,
  },
  {
    id: "glimmer-meadow",
    label: "流光原野",
    imageUrl: "/lingye/labels/glimmer-meadow.png",
    left: 17,
    top: 70,
  },
  {
    id: "abyssal-trench",
    label: "深渊海沟",
    imageUrl: "/lingye/labels/abyssal-trench.png",
    left: 86,
    top: 68,
  },
  {
    id: "doorbell-community",
    label: "Doorbell社区",
    imageUrl: "/lingye/labels/doorbell-community.png",
    left: 34,
    top: 75,
  },
  {
    id: "farm-ranch",
    label: "农场牧场",
    imageUrl: "/lingye/labels/farm-ranch.png",
    left: 67,
    top: 84,
  },
];

function createHomeViewModel(identity: HumanIdentity): MyHomeViewModel {
  return {
    familyName: identity.home.home_name,
    homeDoorplate: `DB-${identity.farmBinding.farm_doorplate}`,
    backgroundDescription: null,
    climateName: null,
    weather: {
      condition: null,
      temperature: null,
      updatedAt: null,
    },
    remainingVisitTime: null,
    visitEvents: [],
  };
}

function createProfileViewModel(identity: HumanIdentity): OwnerProfileViewModel {
  return {
    qqNumber: identity.account.qq_number,
    residentName: identity.resident.resident_name,
    publicIntro: null,
    publicLocation: null,
    currentActivity: null,
    connectorStatus: null,
    familyName: identity.home.home_name,
    farmDoorplate: identity.farmBinding.farm_doorplate,
    socialConnections: [],
  };
}

export function CommunityShell({ identity }: CommunityShellProps) {
  const [activeArea, setActiveArea] = useState<CommunityArea>("activity-room");
  const [dailyOpen, setDailyOpen] = useState(false);
  const [lingyeNotice, setLingyeNotice] = useState<string | null>(null);
  const home = createHomeViewModel(identity);
  const profile = createProfileViewModel(identity);

  const openLingyePlace = (placeId: LingyePlaceId) => {
    if (isLingyeDailyPlace(placeId)) {
      setLingyeNotice(null);
      setDailyOpen(true);
      return;
    }
    const internalPath = getLingyePlaceInternalPath(placeId);
    if (internalPath) {
      openDoorbellInternalPage(internalPath);
      return;
    }

    const place = lingyePlaces.find((item) => item.id === placeId);
    setLingyeNotice(`${place?.label ?? "这个地点"}暂未开放`);
  };

  const selectArea = (area: CommunityArea) => {
    setActiveArea(area);
    if (area === "lingye") {
      setLingyeNotice(null);
      setDailyOpen(false);
    }
  };

  return (
    <div className={`community-shell community-shell--${activeArea}`}>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>

      {activeArea === "activity-room" ? <PublicLoungePage /> : null}
      {activeArea === "lingye" && dailyOpen ? (
        <LingyeDailyScreen onBack={() => setDailyOpen(false)} />
      ) : null}
      {activeArea === "lingye" && !dailyOpen ? (
        <LingyeMapPage
          notice={lingyeNotice}
          onOpenPlace={openLingyePlace}
          onOpenTogether={() => {
            openDoorbellInternalPage(DOORBELL_INTERNAL_PATHS.lingyeTogether);
          }}
          places={lingyePlaces}
        />
      ) : null}
      {activeArea === "my-home" ? <MyHomePage home={home} /> : null}
      {activeArea === "owner-profile" ? <OwnerProfilePage profile={profile} /> : null}

      <CommunityNavigation activeArea={activeArea} items={navigationItems} onSelect={selectArea} />
    </div>
  );
}
