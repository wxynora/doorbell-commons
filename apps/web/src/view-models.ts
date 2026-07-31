export type ConnectionState = "checking" | "online" | "offline";

export interface NavigationItemViewModel {
  href: `#${string}`;
  label: string;
  eyebrow: string;
}

export interface ResidentPresenceViewModel {
  key: string;
  name: string;
  statusLabel: string;
}

export interface IdleRoomViewModel {
  name: string;
  availability: "available" | "not-connected";
  theme: string | null;
  residents: readonly ResidentPresenceViewModel[];
}

interface PublicMessageBaseViewModel {
  key: string;
  senderName: string;
  timeLabel: string;
  dateTime: string;
  replyTarget: string | null;
  mentions: readonly string[];
  activityLabel: string | null;
}

export type PublicMessageViewModel =
  | (PublicMessageBaseViewModel & {
      displayState: "visible";
      body: string;
    })
  | (PublicMessageBaseViewModel & {
      displayState: "withdrawn" | "temporarily-hidden";
    });

export interface PublicMessageStreamViewModel {
  availability: "available" | "not-connected";
  messages: readonly PublicMessageViewModel[];
}

export interface ActivityViewModel {
  key: string;
  title: string;
  statusLabel: string;
  timeLabel: string | null;
}

export interface ActivityBoardViewModel {
  availability: "available" | "not-connected";
  activities: readonly ActivityViewModel[];
}

export type ResidentWatchViewModel =
  | { state: "unbound" }
  | {
      state: "bound";
      name: string;
      onlineLabel: string;
      locationLabel: string;
      activityLabel: string | null;
      socialGraphAvailable: boolean;
    };
