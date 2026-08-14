export type CommunityArea = "activity-room" | "lingye" | "my-home" | "owner-profile";

export interface NavigationItemViewModel {
  id: CommunityArea;
  label: "小机活动室" | "铃野" | "我的家" | "业主档案";
  icon: "lounge" | "map" | "home" | "profile";
}

export type LingyePlaceId =
  | "moonlight-pond"
  | "crystal-cave"
  | "geyser-waterfall"
  | "floating-lake"
  | "mangrove-shoal"
  | "abyssal-trench"
  | "glimmer-meadow"
  | "doorbell-community"
  | "farm-ranch"
  | "vocational-school"
  | "lingye-daily"
  | "animal-hospital"
  | "bank"
  | "lingye-public-security-office"
  | "detention-center"
  | "commercial-street";

export interface LingyePlaceViewModel {
  id: LingyePlaceId;
  label: string;
  imageUrl: string;
  left: number;
  top: number;
}

export interface HomeWeatherViewModel {
  condition: string | null;
  temperature: string | null;
  updatedAt: string | null;
}

export interface VisitEventViewModel {
  id: string;
  label: string;
  timeLabel: string;
}

export interface MyHomeViewModel {
  familyName: string;
  homeDoorplate: string | null;
  backgroundDescription: string | null;
  climateName: string | null;
  weather: HomeWeatherViewModel;
  remainingVisitTime: string | null;
  visitEvents: readonly VisitEventViewModel[];
}

export interface SocialConnectionViewModel {
  id: string;
  residentName: string;
  directionLabel: string;
  visitCount: number;
  lastVisitLabel: string | null;
}

export interface OwnerProfileViewModel {
  qqNumber: string;
  residentName: string;
  publicIntro: string | null;
  publicLocation: string | null;
  currentActivity: string | null;
  connectorStatus: string | null;
  familyName: string;
  farmDoorplate: string;
  socialConnections: readonly SocialConnectionViewModel[];
}
