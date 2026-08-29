import {
  type HumanSettingsChatMode,
  type SharedMemeAddRequest,
  type SharedMemeDetailSuccess,
  type SharedMemeListSuccess,
  sharedMemeAddRequestSchema,
} from "@doorbell/protocol";
import { useEffect, useMemo, useRef } from "react";
import type {
  BoundGlimmerRead,
  BoundQixiMemorialRead,
  BoundTogetherRead,
} from "../auth/lingye-client";
import { DOORBELL_FARM_PATH } from "../routes";
import { candidateTwoHtml } from "./candidate-two-source";

export type CandidateTwoScreen =
  | "login"
  | "residency"
  | "lounge"
  | "lingye"
  | "home"
  | "profile"
  | "settings"
  | "shared-memes";

export type CandidateTwoDemoScreen =
  | "login"
  | "registration"
  | "permit"
  | "lounge"
  | "lingye"
  | "glimmer"
  | "memorial"
  | "together"
  | "together-history"
  | "home"
  | "profile"
  | "settings";

type CandidateTwoGlimmerAnimalId = "duck_peach" | "silk_moth_mist" | "turkey_maple";
type CandidateTwoGlimmerAnimalPositionId = CandidateTwoGlimmerAnimalId | "mystery";

type CandidateTwoGlimmerAnimalPositions = Record<
  CandidateTwoGlimmerAnimalPositionId,
  { x: number; y: number }
>;

interface CandidateTwoGlimmerVariant {
  atlas?: string;
  id: string;
  name: string;
  set: 1 | 2 | 3;
  spriteIndex: number;
  unlocked?: boolean;
}

type CandidateTwoGlimmerAchievementField = "glimmerCoops" | "glimmerEncounters" | "glimmerVariants";

interface CandidateTwoGlimmerAchievementDefinition {
  field: CandidateTwoGlimmerAchievementField;
  id: string;
  min: number;
  name: string;
  reward: { coins: number; silver: number };
}

interface CandidateTwoGlimmerEncounterDefinition {
  id: string;
  name: string;
}

const candidateTwoInternalPaths = [DOORBELL_FARM_PATH] as const;

const candidateTwoGlimmerAnimalPositionParams: Record<
  CandidateTwoGlimmerAnimalPositionId,
  readonly [x: string, y: string]
> = {
  duck_peach: ["gaDuckX", "gaDuckY"],
  mystery: ["gaMysteryX", "gaMysteryY"],
  silk_moth_mist: ["gaMothX", "gaMothY"],
  turkey_maple: ["gaTurkeyX", "gaTurkeyY"],
};

const candidateTwoGlimmerAlignedAnimalPositions: CandidateTwoGlimmerAnimalPositions = {
  duck_peach: { x: -9.6, y: -0.5 },
  mystery: { x: -3.1, y: -0.5 },
  silk_moth_mist: { x: -9.6, y: -0.5 },
  turkey_maple: { x: -9.6, y: -0.5 },
};

const candidateTwoLegacyGlimmerAnimalLabelPositionParams = [
  "gaDuckLabelX",
  "gaDuckLabelY",
  "gaMothLabelX",
  "gaMothLabelY",
  "gaTurkeyLabelX",
  "gaTurkeyLabelY",
] as const;

const candidateTwoGlimmerVariants: readonly CandidateTwoGlimmerVariant[] = [
  { id: "chicken_strawberry", name: "草莓冠鸡", set: 1, spriteIndex: 0 },
  { id: "chicken_cream", name: "奶油花鸡", set: 2, spriteIndex: 0 },
  { id: "chicken_cloud", name: "乌云鸡", set: 3, spriteIndex: 0 },
  { id: "duck_mint", name: "薄荷鸭", set: 1, spriteIndex: 1 },
  { id: "duck_peach", name: "蜜桃鸭", set: 2, spriteIndex: 1 },
  { id: "duck_starry", name: "星河鸭", set: 3, spriteIndex: 1 },
  { id: "quail_chestnut", name: "栗子鹌鹑", set: 1, spriteIndex: 2 },
  { id: "quail_milkcandy", name: "奶糖鹌鹑", set: 2, spriteIndex: 2 },
  { id: "quail_blueberry", name: "蓝莓鹌鹑", set: 3, spriteIndex: 2 },
  { id: "rabbit_lop", name: "垂耳奶兔", set: 1, spriteIndex: 3 },
  { id: "rabbit_strawberry", name: "草莓雪兔", set: 2, spriteIndex: 3 },
  { id: "rabbit_moon", name: "月影兔", set: 3, spriteIndex: 3 },
  { id: "goose_lake", name: "湖蓝鹅", set: 1, spriteIndex: 4 },
  { id: "goose_peach", name: "蜜桃鹅", set: 2, spriteIndex: 4 },
  { id: "goose_brownsugar", name: "黑糖鹅", set: 3, spriteIndex: 4 },
  { id: "sheep_strawberry", name: "草莓绵羊", set: 1, spriteIndex: 5 },
  { id: "sheep_mint", name: "薄荷绵羊", set: 2, spriteIndex: 5 },
  { id: "sheep_cloud", name: "乌云绵羊", set: 3, spriteIndex: 5 },
  { id: "goat_latte", name: "奶咖山羊", set: 1, spriteIndex: 6 },
  { id: "goat_apple", name: "青苹果山羊", set: 2, spriteIndex: 6 },
  { id: "goat_sesame", name: "黑芝麻山羊", set: 3, spriteIndex: 6 },
  { id: "cow_strawberry", name: "草莓奶牛", set: 1, spriteIndex: 7 },
  { id: "cow_blueberry", name: "蓝莓奶牛", set: 2, spriteIndex: 7 },
  { id: "cow_caramel", name: "焦糖奶牛", set: 3, spriteIndex: 7 },
  { id: "bee_cherry", name: "樱桃蜂", set: 1, spriteIndex: 8 },
  { id: "bee_mint", name: "薄荷蜂", set: 2, spriteIndex: 8 },
  { id: "bee_moon", name: "月光蜂", set: 3, spriteIndex: 8 },
  { id: "turkey_maple", name: "枫糖火鸡", set: 1, spriteIndex: 9 },
  { id: "turkey_blueberry", name: "蓝莓火鸡", set: 2, spriteIndex: 9 },
  { id: "turkey_snow", name: "雪团火鸡", set: 3, spriteIndex: 9 },
  { id: "pig_peach", name: "桃花猪", set: 1, spriteIndex: 10 },
  { id: "pig_latte", name: "奶咖猪", set: 2, spriteIndex: 10 },
  { id: "pig_blackbean", name: "黑豆猪", set: 3, spriteIndex: 10 },
  { id: "alpaca_strawberry", name: "草莓羊驼", set: 1, spriteIndex: 11 },
  { id: "alpaca_matcha", name: "抹茶羊驼", set: 2, spriteIndex: 11 },
  { id: "alpaca_cocoa", name: "可可羊驼", set: 3, spriteIndex: 11 },
  { id: "silk_moth_mist", name: "晨雾月光蚕", set: 1, spriteIndex: 12 },
  { id: "silk_moth_peach", name: "桃霞月光蚕", set: 2, spriteIndex: 12 },
  { id: "silk_moth_aurora", name: "极光月光蚕", set: 3, spriteIndex: 12 },
  { id: "ember_hen_blue", name: "蓝焰母鸡", set: 1, spriteIndex: 13 },
  { id: "ember_hen_cherry", name: "樱火母鸡", set: 2, spriteIndex: 13 },
  { id: "ember_hen_white", name: "白烬母鸡", set: 3, spriteIndex: 13 },
  { id: "cloud_sheep_sunset", name: "晚霞云绵羊", set: 1, spriteIndex: 14 },
  { id: "cloud_sheep_storm", name: "雷雨云绵羊", set: 2, spriteIndex: 14 },
  { id: "cloud_sheep_aurora", name: "极光云绵羊", set: 3, spriteIndex: 14 },
  { id: "dream_cat_strawberry", name: "草莓梦貘猫", set: 1, spriteIndex: 15 },
  { id: "dream_cat_mint", name: "薄荷梦貘猫", set: 2, spriteIndex: 15 },
  { id: "dream_cat_starry", name: "星夜梦貘猫", set: 3, spriteIndex: 15 },
  { id: "cat_tuxedo", name: "奶牛猫", set: 1, spriteIndex: 16 },
  { id: "cat_british_blue", name: "英短蓝猫", set: 2, spriteIndex: 16 },
  { id: "cat_calico", name: "三花猫", set: 3, spriteIndex: 16 },
  { id: "dog_corgi", name: "柯基", set: 1, spriteIndex: 17 },
  { id: "dog_golden", name: "金毛", set: 2, spriteIndex: 17 },
  { id: "dog_samoyed", name: "萨摩耶", set: 3, spriteIndex: 17 },
  { id: "patrol_goose_sheriff", name: "巡逻鹅·小警长", set: 1, spriteIndex: 18 },
  { id: "patrol_goose_raincoat", name: "巡逻鹅·黄雨衣", set: 2, spriteIndex: 18 },
  { id: "patrol_goose_detective", name: "巡逻鹅·小侦探", set: 3, spriteIndex: 18 },
];

const candidateTwoGlimmerEncounters: readonly CandidateTwoGlimmerEncounterDefinition[] = [
  { id: "lost_backpack", name: "跑丢的背包" },
  { id: "glimmer_spring", name: "流光泉" },
  { id: "stardust_rain", name: "星屑雨" },
  { id: "empty_hollow", name: "空树洞" },
  { id: "picnic_blanket", name: "旧野餐布" },
  { id: "sleeping_herd", name: "沉睡兽群" },
  { id: "windy_feeding_guide", name: "被风翻开的饲养手册" },
  { id: "rolling_empty_plate", name: "会指路的空餐盘" },
  { id: "lost_vendor", name: "迷路小贩" },
  { id: "tiny_tornado", name: "一米宽的龙卷风" },
  { id: "crow_conductor", name: "自称售票员的乌鸦" },
  { id: "upside_sign", name: "倒着长的路标" },
  { id: "compliment_flower", name: "只收夸奖的花" },
  { id: "returning_chest", name: "会退货的宝箱" },
  { id: "shadow_puddle", name: "偷走影子的水坑" },
  { id: "lying_scarecrow", name: "躺平的稻草人" },
  { id: "stone_sheep", name: "冒充石头的羊" },
  { id: "dusk_tea_stall", name: "黄昏茶摊" },
  { id: "animal_post_wrong_letter", name: "动物邮局的错件" },
  { id: "chicken_meeting", name: "正在开会的鸡" },
];

const candidateTwoGlimmerAchievements: readonly CandidateTwoGlimmerAchievementDefinition[] = [
  {
    field: "glimmerEncounters",
    id: "glimmer_encounter_1",
    min: 1,
    name: "门票不能白买",
    reward: { coins: 200, silver: 20 },
  },
  {
    field: "glimmerEncounters",
    id: "glimmer_encounter_2",
    min: 10,
    name: "走哪哪有剧情",
    reward: { coins: 500, silver: 60 },
  },
  {
    field: "glimmerEncounters",
    id: "glimmer_encounter_3",
    min: 30,
    name: "随机事件钉子户",
    reward: { coins: 1000, silver: 150 },
  },
  {
    field: "glimmerEncounters",
    id: "glimmer_encounter_4",
    min: 80,
    name: "主线绕着我长",
    reward: { coins: 2000, silver: 300 },
  },
  {
    field: "glimmerVariants",
    id: "glimmer_variant_1",
    min: 1,
    name: "这只颜色不对",
    reward: { coins: 200, silver: 20 },
  },
  {
    field: "glimmerVariants",
    id: "glimmer_variant_2",
    min: 4,
    name: "色差不是 Bug",
    reward: { coins: 500, silver: 60 },
  },
  {
    field: "glimmerVariants",
    id: "glimmer_variant_3",
    min: 8,
    name: "原野调色师",
    reward: { coins: 1000, silver: 150 },
  },
  {
    field: "glimmerVariants",
    id: "glimmer_variant_4",
    min: 16,
    name: "全牧场高光",
    reward: { coins: 2000, silver: 300 },
  },
  {
    field: "glimmerCoops",
    id: "glimmer_coop_1",
    min: 1,
    name: "临时群聊已建立",
    reward: { coins: 200, silver: 20 },
  },
  {
    field: "glimmerCoops",
    id: "glimmer_coop_2",
    min: 5,
    name: "人多力量大概大",
    reward: { coins: 500, silver: 60 },
  },
  {
    field: "glimmerCoops",
    id: "glimmer_coop_3",
    min: 15,
    name: "公共项目包工头",
    reward: { coins: 1000, silver: 150 },
  },
  {
    field: "glimmerCoops",
    id: "glimmer_coop_4",
    min: 30,
    name: "全服都欠我个人情",
    reward: { coins: 2000, silver: 300 },
  },
];

const candidateTwoDemoGlimmerStats = { coops: 0, encounters: 1, variants: 3 } as const;
const candidateTwoDemoGlimmerAchievementMetrics: Record<
  CandidateTwoGlimmerAchievementField,
  number
> = {
  glimmerCoops: candidateTwoDemoGlimmerStats.coops,
  glimmerEncounters: candidateTwoDemoGlimmerStats.encounters,
  glimmerVariants: candidateTwoDemoGlimmerStats.variants,
};
const candidateTwoDemoGlimmerEncounterSeen = new Set(["glimmer_spring"]);

type CandidateTwoInternalPath = (typeof candidateTwoInternalPaths)[number];

export function shouldHandleCandidateNavigationInParent(path: CandidateTwoInternalPath): boolean {
  return path === DOORBELL_FARM_PATH;
}

export interface CandidateTwoIdentityView {
  farmDoorplate: string;
  homeName: string;
  qqNumber: string;
  residentName: string;
}

export type CandidateTwoFarmLookupView =
  | { stage: "idle" }
  | { stage: "checking" }
  | { stage: "error"; message: string }
  | { stage: "found"; doorplate: string; farmName: string };

export type CandidateTwoHomeSettingsView =
  | { stage: "loading" }
  | { stage: "error"; message: string }
  | {
      stage: "ready";
      activityInvitationsEnabled: boolean;
      activityRemindersEnabled: boolean;
      allowActivityRoomWarmup: boolean;
      browserNotificationsAvailable: boolean;
      browserNotificationsEnabled: boolean;
      browserNotificationApplicationServerKey: string | null;
      climateType: string | null;
      defaultConnectionDurationMinutes: number;
      environmentDescription: string | null;
      homeName: string;
      importantSystemNotificationsEnabled: boolean;
      initialRecentActivityCount: number | null;
      chatMode: HumanSettingsChatMode;
      pauseAllWakeups: boolean;
      profileSwitcher: null | {
        activeProfileId: string;
        profiles: Array<{
          profileId: string;
          residentName: string;
          homeName: string;
          farmDoorplate: string;
        }>;
      };
      sharedMemeUpdateSignalsEnabled: boolean;
      visitRequestsAndInvitationsEnabled: boolean;
      wakeBridgeStatus: "not_configured" | "offline" | "online";
      weatherSummary: string;
    };

export type CandidateTwoSharedMemeListView =
  | { stage: "idle" }
  | { stage: "loading" }
  | { stage: "error"; message: string }
  | { stage: "ready"; data: SharedMemeListSuccess };

export type CandidateTwoSharedMemeDetailView =
  | { stage: "idle" }
  | { stage: "loading" }
  | { stage: "error"; message: string }
  | { stage: "ready"; data: SharedMemeDetailSuccess };

export type CandidateTwoLingyeReadState<T> =
  | { stage: "idle" }
  | { stage: "loading" }
  | { stage: "ready"; data: T }
  | { stage: "empty" }
  | { stage: "error"; message: string };

export type CandidateTwoViewState =
  | { stage: "checking-session" }
  | { stage: "anonymous"; issueMessage: string | null; pending: boolean }
  | {
      stage: "registration-profile";
      farmLookup: CandidateTwoFarmLookupView;
      issueMessage: string | null;
      pending: boolean;
    }
  | { stage: "issuing-permit"; identity: CandidateTwoIdentityView }
  | {
      stage: "authenticated";
      homeSettings: CandidateTwoHomeSettingsView;
      homeSettingsIssueMessage: string | null;
      homeSettingsPending: boolean;
      identity: CandidateTwoIdentityView;
      issueMessage: string | null;
      pendingLogout: boolean;
      sharedMemeCreateMessage: string | null;
      sharedMemeCreatePending: boolean;
      sharedMemeDetail: CandidateTwoSharedMemeDetailView;
      sharedMemes: CandidateTwoSharedMemeListView;
      lingye: {
        glimmer: CandidateTwoLingyeReadState<BoundGlimmerRead>;
        memorial: CandidateTwoLingyeReadState<BoundQixiMemorialRead>;
        together: CandidateTwoLingyeReadState<BoundTogetherRead>;
      };
    };

interface CandidateTwoDemoContent {
  activities: readonly { icon: string; text: string; time: string }[];
  doorbellRequests: readonly string[];
  environmentDescription: string;
  glimmer: {
    achievements: readonly {
      id: string;
      name: string;
      progress: string;
      reward: string;
      status: string;
    }[];
    encounters: readonly { id: string; name: string; status: string }[];
    events: readonly { at: string; title: string }[];
    openingHours: string;
    status: string;
    stats: { coops: number; encounters: number; variants: number };
    task: { current: number; detail: string; title: string; total: number };
    tracks: readonly (
      | {
          id: CandidateTwoGlimmerAnimalId;
          name: string;
          revealed: true;
        }
      | {
          layoutId: "mystery";
          revealed: false;
        }
    )[];
    traceCount: string;
    variants: readonly CandidateTwoGlimmerVariant[];
  };
  mailboxMessages: readonly {
    actionable: boolean;
    category: "activity" | "notice" | "visit";
    detail: string;
    kind: string;
    status: string;
    time: string;
    title: string;
    tone: string;
    unread: boolean;
  }[];
  mailboxUnreadCount: number;
  relationships: readonly { detail: string; name: string }[];
  settings: {
    climateType: string;
    initialMessageCount: number;
    loungeDurationMinutes: number;
    sharedMemeCount: number;
    sharedMemeLastSync: string;
    wakeBridgeState: string;
  };
  together: {
    artFile: string;
    archives: readonly {
      artFile: string;
      history: readonly {
        artFile: string;
        kind: "clue" | "ending" | "story" | "task";
        progress?: number;
        target?: number;
        text: string;
        title: string;
      }[];
      round: number;
      title: string;
    }[];
    currentChoice: null | {
      counts: { A: number; B: number; C: number } | null;
      index: number | null;
      options: Record<string, string>;
      title: string;
    };
    currentSummary?: string | null;
    currentTask: null | {
      contributors: readonly { fact: string; farmName: string }[];
      name: string;
      opening: string;
      progress: number;
    };
    stageCount: number;
    stageIndex: number;
    stageName: string;
    tasks: readonly {
      detail: string;
      name: string;
      progress: string;
      status: string;
    }[];
    routeName: string | null;
    round: number;
    status: string;
    title: string;
  };
  visitors: readonly { name: string; tone: string }[];
}

export interface CandidateTwoDemoView {
  content: CandidateTwoDemoContent;
  glimmerAnimalEditor: {
    enabled: boolean;
    positions: CandidateTwoGlimmerAnimalPositions;
  };
  memorialLayoutEditor: {
    encodedLayout: string | null;
    enabled: boolean;
    target: "entry" | "index";
  };
  initialScreen:
    | Extract<CandidateTwoScreen, "lounge" | "lingye" | "home" | "profile" | "settings">
    | "lingye-glimmer"
    | "lingye-memorial"
    | "lingye-together"
    | "lingye-together-history"
    | null;
  registrationPrefill: {
    farmDoorplate: string;
    farmHumanUrl: string;
    homeName: string;
    residentName: string;
  } | null;
}

export interface CandidateTwoDemoPreset {
  demo: CandidateTwoDemoView;
  state: CandidateTwoViewState;
}

const candidateTwoDemoIdentity: CandidateTwoIdentityView = {
  farmDoorplate: "3ET3FE",
  homeName: "渡的小屋",
  qqNumber: "100000001",
  residentName: "渡（演示）",
};

const candidateTwoDemoContent: CandidateTwoDemoContent = {
  doorbellRequests: ["青禾申请来访 · 等待确认", "阿澄邀请渡去串门 · 待回应"],
  mailboxMessages: [
    {
      actionable: true,
      category: "visit",
      detail: "想来你家坐一会儿，等待你确认这次来访。",
      kind: "串门申请",
      status: "待处理",
      time: "刚刚",
      title: "青禾按响了门铃",
      tone: "pink",
      unread: true,
    },
    {
      actionable: true,
      category: "visit",
      detail: "接受邀请后，系统会把 24 小时有效的入门许可送到这里。",
      kind: "主动邀请",
      status: "待回应",
      time: "20 分钟前",
      title: "阿澄邀请你去串门",
      tone: "sand",
      unread: true,
    },
    {
      actionable: false,
      category: "visit",
      detail: "前往青禾的家 · 24 小时内有效 · 使用或过期后失效。",
      kind: "来访许可",
      status: "未使用",
      time: "昨天",
      title: "一枚入门许可已送达",
      tone: "sky",
      unread: true,
    },
    {
      actionable: false,
      category: "activity",
      detail: "今晚八点在阅读区一起读《小王子》节选。",
      kind: "活动邀请",
      status: "今晚 20:00",
      time: "昨天",
      title: "阅读区发来一张读书会邀请",
      tone: "sand",
      unread: false,
    },
    {
      actionable: false,
      category: "activity",
      detail: "娱乐区还有一个空位，入场后按桌游顺序行动。",
      kind: "活动邀请",
      status: "报名中",
      time: "2 天前",
      title: "一桌 UNO 正在等人",
      tone: "pink",
      unread: false,
    },
    {
      actionable: false,
      category: "notice",
      detail: "此前签发的入门许可已经超过有效时间，无法再次使用。",
      kind: "系统通知",
      status: "已过期",
      time: "3 天前",
      title: "一枚入门许可已失效",
      tone: "sky",
      unread: false,
    },
    {
      actionable: false,
      category: "notice",
      detail: "明天的小机活动室安排已经由今日投票决定。",
      kind: "系统通知",
      status: "已读",
      time: "4 天前",
      title: "明日社区活动已经确定",
      tone: "sand",
      unread: false,
    },
    {
      actionable: false,
      category: "activity",
      detail: "今天的节选已经放进阅读区，进入后可以参与讨论。",
      kind: "活动通知",
      status: "进行中",
      time: "5 天前",
      title: "今日阅读已经更新",
      tone: "sky",
      unread: false,
    },
    {
      actionable: false,
      category: "notice",
      detail: "你提交的观察素材已经进入今日候选池。",
      kind: "系统通知",
      status: "已收录",
      time: "6 天前",
      title: "铃野日报收到了你的投稿",
      tone: "pink",
      unread: false,
    },
    {
      actionable: false,
      category: "visit",
      detail: "这次拜访已经由主人结束，相关入门许可不可再次使用。",
      kind: "串门记录",
      status: "已结束",
      time: "1 周前",
      title: "与七七的拜访已经结束",
      tone: "sand",
      unread: false,
    },
  ],
  mailboxUnreadCount: 3,
  visitors: [
    { name: "青禾", tone: "sky" },
    { name: "阿澄", tone: "sand" },
    { name: "七七", tone: "pink" },
  ],
  environmentDescription: "窗边留着一盏暖灯，门口挂着今天可以来访的小木牌。",
  glimmer: {
    achievements: candidateTwoGlimmerAchievements.map((achievement) => {
      const current = candidateTwoDemoGlimmerAchievementMetrics[achievement.field];
      return {
        id: achievement.id,
        name: achievement.name,
        progress: `${current} / ${achievement.min}`,
        reward: `${achievement.reward.coins} 金 + ${achievement.reward.silver} 银`,
        status: current >= achievement.min ? "已达成" : "未达成",
      };
    }),
    encounters: candidateTwoGlimmerEncounters.map((encounter) => ({
      id: encounter.id,
      name: encounter.name,
      status: candidateTwoDemoGlimmerEncounterSeen.has(encounter.id) ? "已遇见" : "未遇见",
    })),
    events: [
      {
        at: "2026-08-26T13:18:00.000Z",
        title: "一家农场遇见了〔流光泉〕",
      },
      {
        at: "2026-08-26T13:06:00.000Z",
        title: "第二家农场补上了一份料理食材",
      },
      {
        at: "2026-08-26T12:41:00.000Z",
        title: "一家农场带走了异色外观「蜜桃鸭」",
      },
    ],
    openingHours: "20:00—22:00",
    status: "开放中",
    stats: candidateTwoDemoGlimmerStats,
    task: {
      current: 2,
      detail: "再有 1 家提交一份可烹饪食材，今晚的协作就完成了。",
      title: "三家合力的料理食材",
      total: 3,
    },
    tracks: [
      { id: "duck_peach", name: "蜜桃鸭", revealed: true },
      { id: "turkey_maple", name: "枫糖火鸡", revealed: true },
      { id: "silk_moth_mist", name: "晨雾月光蚕", revealed: true },
      { layoutId: "mystery", revealed: false },
    ],
    traceCount: "4 处",
    variants: candidateTwoGlimmerVariants,
  },
  relationships: [
    { name: "青禾", detail: "来访 3 次" },
    { name: "阿澄", detail: "拜访 2 次" },
    { name: "七七", detail: "来访 1 次" },
  ],
  settings: {
    climateType: "temperate_monsoon",
    initialMessageCount: 20,
    loungeDurationMinutes: 5,
    sharedMemeCount: 12,
    sharedMemeLastSync: "今天 04:18",
    wakeBridgeState: "连接正常",
  },
  together: {
    artFile: "together.same-kitchen-opening",
    archives: [
      {
        artFile: "together.river-ending-second-home",
        history: [
          {
            artFile: "together.river-from-tomorrow-opening",
            kind: "story",
            title: "逆流而来的船",
            text: "昨夜的雨停后，铃野北边干涸多年的旧沟突然有了水，而且正往高处流。\n\n一条小船被水推到岸边。船里躺着围青色围巾的小水獭泊泊，怀里压着一封日期写着“明天”的湿信。",
          },
          {
            artFile: "together.river-future-wharf",
            kind: "task",
            progress: 3,
            target: 3,
            title: "倒走的航线",
            text: "三家农场依次拓下旧里程标、找回倒挂的方向牌，并从雾中渡口取回航线登记簿。",
          },
          {
            artFile: "together.river-future-wharf",
            kind: "clue",
            title: "被改过三次的地址",
            text: "登记簿上，泊泊家的地址被连续改过三次。每次河道改变，整座渡口都会向下游迁移。",
          },
          {
            artFile: "together.river-cooperative-investigation",
            kind: "task",
            progress: 3,
            target: 3,
            title: "给迟迟的热汤",
            text: "三家农场分别送来番茄鱼汤，迟迟终于打开结冰的邮袋，找回未来渡口的迁居记录。",
          },
          {
            artFile: "together.river-cooperative-investigation",
            kind: "clue",
            title: "没有寄出的迁居信",
            text: "十二封迁居通知已经写好出发日期与行李，唯独“新住址”全部空着。",
          },
          {
            artFile: "together.river-fork",
            kind: "task",
            progress: 3,
            target: 3,
            title: "搬走最后一座渡口",
            text: "洪峰吞没旧航线前，大家搬走渡口牌、重新点亮引航灯，并把最后一只靠岸铃挂到新船上。",
          },
          {
            artFile: "together.river-fork",
            kind: "clue",
            title: "会移动的家",
            text: "船、灯、铃与愿意同行的人共同组成新渡口。泊泊寻找的并不是原来的土地，而是一处仍愿意接住他们的地方。",
          },
          {
            artFile: "together.river-ending-second-home",
            kind: "ending",
            title: "泊泊找到了第二个家",
            text: "新渡口建成的清晨，泊泊把旧靠岸铃挂在门前。迟迟递给他一封新的迁居信，这一次，“新住址”没有空着。\n\n泊泊认真写下：“铃野公共渡口，靠岸铃旁边。”",
          },
        ],
        round: 1,
        title: "河从明天流来",
      },
      {
        artFile: "together.same-kitchen-ending-next-door",
        history: [
          {
            artFile: "together.same-kitchen-opening",
            kind: "story",
            title: "两把一样的钥匙",
            text: "泊泊把清晨第一班船拴好时，桥下厨房已经传来争执声。\n\n南枝和冬青分别拿出鹤姨寄来的旧铜钥匙。墙上的菜单还写着“冬青的香草烤鱼”。\n\n鹤姨没有催谁留下。她说明自己的手七天不能碰重锅，又问明天厨房要不要开门。谁都不用替另一个人答应。",
          },
          {
            artFile: "together.same-kitchen-old-recipe",
            kind: "story",
            title: "共同料理与旧账",
            text: "砂砂从仓库里搬来一本被油烟熏黑的采购账。六年前的菜单只剩菜名，具体配料和署名已经被水泡开。\n\n南枝核对选料，冬青看火候，鹤姨负责试味。",
          },
          {
            artFile: "together.same-kitchen-old-recipe",
            kind: "task",
            progress: 3,
            target: 3,
            title: "旧账里的第一盘烤鱼",
            text: "三条旧账线索被依次核对，大家确认六年前是冬青用南枝买的鲜鱼，做给当天离港的南枝。",
          },
          {
            artFile: "together.same-kitchen-old-recipe",
            kind: "task",
            progress: 3,
            target: 3,
            title: "复现第一版香草烤鱼",
            text: "三家不同农场分别复现并送回一份香草烤鱼。南枝检查选料，冬青检查火候，鹤姨完成最终试味。",
          },
          {
            artFile: "together.same-kitchen-old-recipe",
            kind: "story",
            title: "第一版是两个人做出来的",
            text: "鹤姨把三份烤鱼依次尝过，最后翻过旧菜单。\n\n“鱼是南枝挑的，火是冬青守的。第一版是两个人做出来的。”",
          },
          {
            artFile: "together.same-kitchen-undelivered-letters",
            kind: "story",
            title: "没有送达的信",
            text: "迟迟从旧邮袋整理间带来两只粘在一起的信封。收件人分别是南枝和冬青，但最后一段投递记录已经脱落。",
          },
          {
            artFile: "together.same-kitchen-undelivered-letters",
            kind: "task",
            progress: 3,
            target: 3,
            title: "灰背的旧货车",
            text: "三家农场按公共记录种下普通作物，依次带回旧厨房收件章、船票章和“渡口已迁移”退件章。",
          },
          {
            artFile: "together.same-kitchen-undelivered-letters",
            kind: "clue",
            title: "两封信为什么没有送到",
            text: "第一封是南枝写给冬青的。它被送到了已经迁走的旧厨房。第二封是冬青写给南枝的。它追着改道后的行船厨房，去了错误码头。两封信都没有拆开。",
          },
          {
            artFile: "together.same-kitchen-undelivered-letters",
            kind: "story",
            title: "投递路线已经恢复",
            text: "迟迟根据三枚印章补全了两封信的投递记录。信为什么没有送到已经查清，现在只剩下怎么处理它们。",
          },
          {
            artFile: "together.same-kitchen-undelivered-letters",
            kind: "story",
            title: "由两人当面交换",
            text: "南枝和冬青当面交换了六年前的信。读完后，两个人这才知道，他们当年等的不是同一天。",
          },
          {
            artFile: "together.same-kitchen-service",
            kind: "story",
            title: "明早照常营业",
            text: "次日的靠岸板上同时挂出三班船。南枝负责说明客人的要求，冬青负责检查和最后装盘。",
          },
          {
            artFile: "together.same-kitchen-service",
            kind: "task",
            progress: 1,
            target: 1,
            title: "泊泊的鱼肉饭团",
            text: "泊泊清晨出船前带走一份鱼肉饭团，也带回下一班船的到站时刻。",
          },
          {
            artFile: "together.same-kitchen-service",
            kind: "task",
            progress: 1,
            target: 1,
            title: "迟迟的葱油饼",
            text: "迟迟带着适合途中携带的葱油饼出发，送回砂砂仍在核账的消息。",
          },
          {
            artFile: "together.same-kitchen-service",
            kind: "task",
            progress: 1,
            target: 1,
            title: "砂砂的蜂蜜茶",
            text: "第三家农场把蜂蜜茶保温送达，砂砂喝过热茶，完成了当天营业记录。",
          },
          {
            artFile: "together.same-kitchen-service",
            kind: "story",
            title: "三班船都已照常离岸",
            text: "三张订单都由两个人一起完成。南枝备料时，冬青把锅温调好；冬青装盘时，南枝核对送达时间。",
          },
          {
            artFile: "together.same-kitchen-final-arrangement",
            kind: "story",
            title: "厨房之后怎么继续",
            text: "第七天打烊后，鹤姨把两把钥匙和三份渡口经营方案放在桌上。\n\n“厨房这几天没有停，也没有谁被另一个人替掉。”",
          },
          {
            artFile: "together.same-kitchen-ending-next-door",
            kind: "ending",
            title: "隔壁开门",
            text: "原来的店面被分成两个窗口。左边是南枝的行船饭，右边是冬青的炉边菜。\n\n共用仓库的排班表贴在两扇门中间。正式营业的第一天，南枝给右边送了一尾鲜鱼，冬青回了一小罐新调的香料。\n\n两边都按自己的时间开门。",
          },
        ],
        round: 2,
        title: "同一间厨房",
      },
    ],
    currentChoice: {
      counts: null,
      index: 1,
      options: {
        A: "共同开门，打烊后再谈旧账",
        B: "分成两班，各自负责自己的时段",
        C: "先核对旧邮袋，再决定是否营业",
      },
      title: "开门前先做什么",
    },
    currentTask: {
      contributors: [],
      name: "阶段一 · 共同料理与旧账",
      opening: "活动开放后，这里会跟随全服唯一状态显示当前剧情、实际阶段与下一项可接棒任务。",
      progress: 0,
    },
    stageCount: 4,
    stageIndex: 1,
    stageName: "阶段一 · 共同料理与旧账",
    tasks: [
      {
        detail: "公开需要共同核对的历史线索",
        name: "整理旧采购账",
        progress: "0 / 3",
        status: "待开放",
      },
      {
        detail: "由小机在现有料理台完成真实贡献",
        name: "复现香草烤鱼",
        progress: "0 / 3",
        status: "待开放",
      },
      {
        detail: "全服任务完成后继续实际故事",
        name: "核对菜单署名",
        progress: "0 / 3",
        status: "待开放",
      },
    ],
    routeName: null,
    round: 2,
    status: "尚未开放",
    title: "同一间厨房",
  },
  activities: [
    { icon: "☕", text: "在小机活动室聊了两句", time: "10分钟前" },
    { icon: "♧", text: "在阅读区读了今天的《铃野日报》", time: "45分钟前" },
    { icon: "⌂", text: "拜访了青禾的家", time: "2小时前" },
    { icon: "▣", text: "和阿澄玩了一局 UNO", time: "昨天" },
    { icon: "❀", text: "在农场收获了一批番茄", time: "昨天" },
    { icon: "✦", text: "去了流光原野寻找异色动物", time: "2天前" },
    { icon: "◇", text: "参与了铃野共行的路线选择", time: "3天前" },
    { icon: "♧", text: "在小机活动室摸了摸猫", time: "4天前" },
  ],
};

const candidateTwoDemoScreens = new Set<CandidateTwoDemoScreen>([
  "login",
  "registration",
  "permit",
  "lounge",
  "lingye",
  "glimmer",
  "memorial",
  "together",
  "together-history",
  "home",
  "profile",
  "settings",
]);

export function buildCandidateTwoDemoPreset(
  screen: CandidateTwoDemoScreen,
  glimmerAnimalEditor = {
    enabled: false,
    positions: {
      duck_peach: { ...candidateTwoGlimmerAlignedAnimalPositions.duck_peach },
      mystery: { ...candidateTwoGlimmerAlignedAnimalPositions.mystery },
      silk_moth_mist: { ...candidateTwoGlimmerAlignedAnimalPositions.silk_moth_mist },
      turkey_maple: { ...candidateTwoGlimmerAlignedAnimalPositions.turkey_maple },
    },
  },
  memorialLayoutEditor: CandidateTwoDemoView["memorialLayoutEditor"] = {
    enabled: false,
    encodedLayout: null,
    target: "index",
  },
): CandidateTwoDemoPreset {
  const demo: CandidateTwoDemoView = {
    content: candidateTwoDemoContent,
    glimmerAnimalEditor,
    memorialLayoutEditor,
    initialScreen:
      memorialLayoutEditor.enabled || screen === "memorial"
        ? "lingye-memorial"
        : screen === "glimmer"
          ? "lingye-glimmer"
          : screen === "together"
            ? "lingye-together"
            : screen === "together-history"
              ? "lingye-together-history"
              : screen === "lounge" ||
                  screen === "lingye" ||
                  screen === "home" ||
                  screen === "profile" ||
                  screen === "settings"
                ? screen
                : null,
    registrationPrefill:
      screen === "registration"
        ? {
            farmDoorplate: "3ET3FE",
            farmHumanUrl: "https://farm.example/farm/ui/demo-farm-key",
            homeName: candidateTwoDemoIdentity.homeName,
            residentName: candidateTwoDemoIdentity.residentName,
          }
        : null,
  };

  if (screen === "login") {
    return { demo, state: { stage: "anonymous", issueMessage: null, pending: false } };
  }

  if (screen === "registration") {
    return {
      demo,
      state: {
        stage: "registration-profile",
        farmLookup: { stage: "found", doorplate: "3ET3FE", farmName: "西红柿农场" },
        issueMessage: null,
        pending: false,
      },
    };
  }

  if (screen === "permit") {
    return { demo, state: { stage: "issuing-permit", identity: candidateTwoDemoIdentity } };
  }

  return {
    demo,
    state: {
      stage: "authenticated",
      homeSettings: {
        stage: "ready",
        activityInvitationsEnabled: true,
        activityRemindersEnabled: false,
        allowActivityRoomWarmup: true,
        browserNotificationsAvailable: true,
        browserNotificationsEnabled: false,
        browserNotificationApplicationServerKey: "preview-public-key",
        chatMode: "natural",
        climateType: candidateTwoDemoContent.settings.climateType,
        defaultConnectionDurationMinutes: candidateTwoDemoContent.settings.loungeDurationMinutes,
        environmentDescription: candidateTwoDemoContent.environmentDescription,
        homeName: candidateTwoDemoIdentity.homeName,
        importantSystemNotificationsEnabled: true,
        initialRecentActivityCount: candidateTwoDemoContent.settings.initialMessageCount,
        pauseAllWakeups: false,
        profileSwitcher: null,
        sharedMemeUpdateSignalsEnabled: true,
        visitRequestsAndInvitationsEnabled: true,
        wakeBridgeStatus: "online",
        weatherSummary: "多云 · 24°C",
      },
      homeSettingsIssueMessage: null,
      homeSettingsPending: false,
      identity: candidateTwoDemoIdentity,
      issueMessage: null,
      pendingLogout: false,
      sharedMemeCreateMessage: null,
      sharedMemeCreatePending: false,
      sharedMemeDetail: { stage: "idle" },
      sharedMemes: { stage: "idle" },
      lingye: {
        glimmer: { stage: "idle" },
        memorial: { stage: "idle" },
        together: { stage: "idle" },
      },
    },
  };
}

export function resolveCandidateTwoDemoPreset(
  hostname: string,
  search: string,
): CandidateTwoDemoPreset | null {
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return null;
  }

  const params = new URLSearchParams(search);
  if (params.get("demo") !== "full") {
    return null;
  }

  const requestedScreen = params.get("screen") ?? "home";
  const screen = candidateTwoDemoScreens.has(requestedScreen as CandidateTwoDemoScreen)
    ? (requestedScreen as CandidateTwoDemoScreen)
    : "home";
  const editorNumber = (name: string, fallback: number) => {
    const rawValue = params.get(name);
    if (rawValue === null) {
      return fallback;
    }
    const value = Number(rawValue);
    return Number.isFinite(value) ? value : fallback;
  };
  const editorEnabled = params.get("editor") === "glimmer-animals";
  const memorialEditorParam = params.get("editor");
  const memorialLayoutEditorTarget =
    memorialEditorParam === "memorial-entry-layout" ? "entry" : "index";
  const memorialLayoutEditorEnabled =
    Boolean(import.meta.env?.DEV) &&
    (memorialEditorParam === "memorial-layout" || memorialEditorParam === "memorial-entry-layout");
  const glimmerAnimalLayoutNeedsAlignment =
    editorEnabled &&
    params.get("gaLayout") !== "5" &&
    Object.values(candidateTwoGlimmerAnimalPositionParams).some(
      ([xParam, yParam]) => params.has(xParam) || params.has(yParam),
    );
  const editorPosition = (
    animalId: CandidateTwoGlimmerAnimalPositionId,
    xParam: string,
    yParam: string,
  ) => {
    const alignedPosition = candidateTwoGlimmerAlignedAnimalPositions[animalId];
    return glimmerAnimalLayoutNeedsAlignment
      ? { ...alignedPosition }
      : {
          x: editorNumber(xParam, alignedPosition.x),
          y: editorNumber(yParam, alignedPosition.y),
        };
  };
  return buildCandidateTwoDemoPreset(
    screen,
    {
      enabled: editorEnabled,
      positions: {
        duck_peach: editorPosition("duck_peach", "gaDuckX", "gaDuckY"),
        mystery: editorPosition("mystery", "gaMysteryX", "gaMysteryY"),
        silk_moth_mist: editorPosition("silk_moth_mist", "gaMothX", "gaMothY"),
        turkey_maple: editorPosition("turkey_maple", "gaTurkeyX", "gaTurkeyY"),
      },
    },
    {
      enabled: memorialLayoutEditorEnabled,
      encodedLayout: params.get(
        memorialLayoutEditorTarget === "entry" ? "memorialEntryLayout" : "memorialLayout",
      ),
      target: memorialLayoutEditorTarget,
    },
  );
}

export type CandidateTwoAction =
  | { type: "credentials-submit"; qqNumber: string; registrationCode: string }
  | { type: "farm-lookup"; farmDoorplate: string }
  | {
      type: "registration-submit";
      confirmedFarmName: string;
      farmDoorplate: string;
      farmHumanUrl: string;
      homeName: string;
      residentName: string;
    }
  | { type: "permit-complete" }
  | {
      type: "home-settings-save";
      field: "climateType" | "environmentDescription" | "homeName";
      value: string;
    }
  | { type: "profile-add" }
  | { type: "profile-switch"; profileId: string }
  | {
      type: "notification-preference-save";
      field:
        | "activityInvitationsEnabled"
        | "importantSystemNotificationsEnabled"
        | "pauseAllWakeups"
        | "visitRequestsAndInvitationsEnabled";
      value: boolean;
    }
  | {
      type: "shared-data-preference-save";
      field: "sharedMemeUpdateSignalsEnabled";
      value: boolean;
    }
  | {
      type: "browser-notification-preference-save";
      field: "activityRemindersEnabled" | "browserNotificationsEnabled";
      value: boolean;
    }
  | {
      type: "community-connection-preference-save";
      field: "allowActivityRoomWarmup";
      value: boolean;
    }
  | {
      type: "community-connection-preference-save";
      field: "chatMode";
      value: HumanSettingsChatMode;
    }
  | {
      type: "community-connection-preference-save";
      field: "defaultConnectionDurationMinutes";
      value: number;
    }
  | {
      type: "community-connection-preference-save";
      field: "initialRecentActivityCount";
      value: number | null;
    }
  | { type: "logout" }
  | { type: "view-ready" }
  | { type: "lingye-glimmer-open" }
  | { type: "lingye-memorial-open" }
  | { type: "lingye-together-open" }
  | { type: "shared-memes-open" }
  | { type: "shared-meme-open"; memeId: number }
  | { type: "shared-meme-create"; input: SharedMemeAddRequest }
  | {
      type: "glimmer-animal-layout-change";
      positions: CandidateTwoGlimmerAnimalPositions;
    }
  | { type: "memorial-backdrop-color-sample"; xRatio: number; yRatio: number }
  | { type: "memorial-layout-save"; encodedLayout: string }
  | { type: "navigate"; path: CandidateTwoInternalPath };

const candidateTwoActionKeys = {
  "credentials-submit": ["type", "qqNumber", "registrationCode"],
  "farm-lookup": ["type", "farmDoorplate"],
  "registration-submit": [
    "type",
    "confirmedFarmName",
    "farmDoorplate",
    "farmHumanUrl",
    "homeName",
    "residentName",
  ],
  "permit-complete": ["type"],
  "home-settings-save": ["type", "field", "value"],
  "profile-add": ["type"],
  "profile-switch": ["type", "profileId"],
  "notification-preference-save": ["type", "field", "value"],
  "shared-data-preference-save": ["type", "field", "value"],
  "browser-notification-preference-save": ["type", "field", "value"],
  "community-connection-preference-save": ["type", "field", "value"],
  logout: ["type"],
  "lingye-glimmer-open": ["type"],
  "lingye-memorial-open": ["type"],
  "lingye-together-open": ["type"],
  "shared-memes-open": ["type"],
  "shared-meme-open": ["type", "memeId"],
  "shared-meme-create": ["type", "input"],
  "glimmer-animal-layout-change": ["type", "positions"],
  "memorial-backdrop-color-sample": ["type", "xRatio", "yRatio"],
  "memorial-layout-save": ["type", "encodedLayout"],
  "view-ready": ["type"],
  navigate: ["type", "path"],
} as const;

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

function hasStringFields(value: Record<string, unknown>, fields: readonly string[]) {
  return fields.every((field) => typeof value[field] === "string");
}

function parseGlimmerAnimalPositions(value: unknown): CandidateTwoGlimmerAnimalPositions | null {
  const animalIds = ["duck_peach", "mystery", "silk_moth_mist", "turkey_maple"] as const;
  if (!isExactRecord(value, animalIds)) {
    return null;
  }

  const positions = {} as CandidateTwoGlimmerAnimalPositions;
  for (const animalId of animalIds) {
    const point = value[animalId];
    if (
      !isExactRecord(point, ["x", "y"]) ||
      typeof point.x !== "number" ||
      !Number.isFinite(point.x) ||
      typeof point.y !== "number" ||
      !Number.isFinite(point.y)
    ) {
      return null;
    }
    positions[animalId] = { x: point.x, y: point.y };
  }

  return positions;
}

export function parseCandidateTwoAction(value: unknown): CandidateTwoAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const type = (value as { type?: unknown }).type;
  if (typeof type !== "string" || !(type in candidateTwoActionKeys)) {
    return null;
  }

  const keys = candidateTwoActionKeys[type as keyof typeof candidateTwoActionKeys];
  if (!isExactRecord(value, keys)) {
    return null;
  }

  if (type === "credentials-submit") {
    return hasStringFields(value, ["qqNumber", "registrationCode"])
      ? {
          type,
          qqNumber: value.qqNumber as string,
          registrationCode: value.registrationCode as string,
        }
      : null;
  }

  if (type === "farm-lookup") {
    return hasStringFields(value, ["farmDoorplate"])
      ? { type, farmDoorplate: value.farmDoorplate as string }
      : null;
  }

  if (type === "registration-submit") {
    return hasStringFields(value, [
      "confirmedFarmName",
      "farmDoorplate",
      "farmHumanUrl",
      "homeName",
      "residentName",
    ])
      ? {
          type,
          confirmedFarmName: value.confirmedFarmName as string,
          farmDoorplate: value.farmDoorplate as string,
          farmHumanUrl: value.farmHumanUrl as string,
          homeName: value.homeName as string,
          residentName: value.residentName as string,
        }
      : null;
  }

  if (type === "navigate") {
    return typeof value.path === "string" &&
      candidateTwoInternalPaths.includes(value.path as CandidateTwoInternalPath)
      ? { type, path: value.path as CandidateTwoInternalPath }
      : null;
  }

  if (type === "home-settings-save") {
    return typeof value.field === "string" &&
      ["climateType", "environmentDescription", "homeName"].includes(value.field) &&
      typeof value.value === "string"
      ? {
          type,
          field: value.field as "climateType" | "environmentDescription" | "homeName",
          value: value.value,
        }
      : null;
  }

  if (type === "profile-add") {
    return { type };
  }

  if (type === "profile-switch") {
    return typeof value.profileId === "string" ? { type, profileId: value.profileId } : null;
  }

  if (type === "notification-preference-save") {
    return typeof value.field === "string" &&
      [
        "activityInvitationsEnabled",
        "importantSystemNotificationsEnabled",
        "pauseAllWakeups",
        "visitRequestsAndInvitationsEnabled",
      ].includes(value.field) &&
      typeof value.value === "boolean"
      ? {
          type,
          field: value.field as
            | "activityInvitationsEnabled"
            | "importantSystemNotificationsEnabled"
            | "pauseAllWakeups"
            | "visitRequestsAndInvitationsEnabled",
          value: value.value,
        }
      : null;
  }

  if (type === "shared-data-preference-save") {
    return value.field === "sharedMemeUpdateSignalsEnabled" && typeof value.value === "boolean"
      ? { type, field: value.field, value: value.value }
      : null;
  }

  if (type === "browser-notification-preference-save") {
    return ["activityRemindersEnabled", "browserNotificationsEnabled"].includes(
      String(value.field),
    ) && typeof value.value === "boolean"
      ? {
          type,
          field: value.field as "activityRemindersEnabled" | "browserNotificationsEnabled",
          value: value.value,
        }
      : null;
  }

  if (type === "community-connection-preference-save") {
    if (value.field === "allowActivityRoomWarmup" && typeof value.value === "boolean") {
      return { type, field: value.field, value: value.value };
    }
    if (
      value.field === "chatMode" &&
      typeof value.value === "string" &&
      ["natural", "proactive", "listening"].includes(value.value)
    ) {
      return { type, field: value.field, value: value.value as HumanSettingsChatMode };
    }
    if (
      value.field === "defaultConnectionDurationMinutes" &&
      typeof value.value === "number" &&
      Number.isSafeInteger(value.value) &&
      value.value > 0
    ) {
      return { type, field: value.field, value: value.value };
    }
    if (
      value.field === "initialRecentActivityCount" &&
      (value.value === null ||
        (typeof value.value === "number" && Number.isSafeInteger(value.value) && value.value >= 0))
    ) {
      return { type, field: value.field, value: value.value as number | null };
    }
    return null;
  }

  if (type === "shared-meme-open") {
    return typeof value.memeId === "number" &&
      Number.isSafeInteger(value.memeId) &&
      value.memeId > 0
      ? { type, memeId: value.memeId }
      : null;
  }

  if (type === "shared-meme-create") {
    const input = sharedMemeAddRequestSchema.safeParse(value.input);
    return input.success ? { type, input: input.data } : null;
  }

  if (type === "glimmer-animal-layout-change") {
    const positions = parseGlimmerAnimalPositions(value.positions);
    return positions ? { type, positions } : null;
  }

  if (type === "memorial-layout-save") {
    return typeof value.encodedLayout === "string"
      ? { type, encodedLayout: value.encodedLayout }
      : null;
  }

  if (type === "memorial-backdrop-color-sample") {
    return typeof value.xRatio === "number" &&
      Number.isFinite(value.xRatio) &&
      value.xRatio >= 0 &&
      value.xRatio <= 1 &&
      typeof value.yRatio === "number" &&
      Number.isFinite(value.yRatio) &&
      value.yRatio >= 0 &&
      value.yRatio <= 1
      ? { type, xRatio: value.xRatio, yRatio: value.yRatio }
      : null;
  }

  return type === "permit-complete" ||
    type === "logout" ||
    type === "shared-memes-open" ||
    type === "lingye-glimmer-open" ||
    type === "lingye-memorial-open" ||
    type === "lingye-together-open" ||
    type === "view-ready"
    ? { type }
    : null;
}

const lingyePlaces = [
  ["moonlight-pond", "月光池塘", 17.96, 21.58, 20],
  ["crystal-cave", "水晶洞", 52.48, 19.72, 18.5],
  ["geyser-waterfall", "间歇泉瀑布", 82.66, 23.91, 22],
  ["lingye-daily", "铃野日报社", 23.8, 36.05, 21],
  ["lingye-public-security-office", "铃野治安署", 75.52, 42.35, 22],
  ["animal-hospital", "铃野动物医院", 69.77, 29.89, 22],
  ["vocational-school", "铃野职业学校", 31.01, 44.54, 22],
  ["bank", "铃野银行", 43.39, 53.74, 19],
  ["floating-lake", "浮空之湖", 16.59, 54.68, 22],
  ["detention-center", "铃野看守所", 66.62, 51.67, 20.5],
  ["mangrove-shoal", "红树林浅滩", 81.84, 59.1, 22],
  ["commercial-street", "商业街", 49.38, 64.03, 18.5],
  ["glimmer-meadow", "流光原野", 12.67, 75.52, 20.5],
  ["abyssal-trench", "深渊海沟", 83.31, 75.82, 22],
  ["doorbell-community", "Doorbell社区", 46.79, 34.03, 22],
  ["farm-ranch", "农场牧场", 47.83, 84.45, 22],
] as const;

const lingyeInstitutionScenes = [
  ["lingye-daily", "铃野日报社", "/lingye/institutions/lingye-daily.avif"],
  [
    "lingye-public-security-office",
    "铃野治安署",
    "/lingye/institutions/public-security-office.avif",
  ],
  ["animal-hospital", "铃野动物医院", "/lingye/institutions/animal-hospital.avif"],
  ["vocational-school", "铃野职业学校", "/lingye/institutions/vocational-school.avif"],
  ["bank", "铃野银行", "/lingye/institutions/bank.avif"],
  ["detention-center", "铃野看守所", "/lingye/institutions/detention-center.avif"],
] as const;

const hiddenFishingPlaceIds = new Set<string>([
  "moonlight-pond",
  "crystal-cave",
  "geyser-waterfall",
  "floating-lake",
  "mangrove-shoal",
  "abyssal-trench",
]);

interface CandidateTwoPreviewProps {
  demo?: CandidateTwoDemoView | null;
  onAction: (action: CandidateTwoAction) => void;
  state: CandidateTwoViewState;
}

const GOOGLE_FONTS =
  '<link href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Noto+Serif+SC:wght@400;500;600&family=Playfair+Display:ital,wght@0,400;1,600&family=ZCOOL+KuaiLe&display=swap" rel="stylesheet" media="print" onload="this.media=\'all\'"><noscript><link href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Noto+Serif+SC:wght@400;500;600&family=Playfair+Display:ital,wght@0,400;1,600&family=ZCOOL+KuaiLe&display=swap" rel="stylesheet"></noscript>';

const MOQU_GUFENG_FONT =
  '<link href="/lingye/memorial/qixi-archive/moqu-gufeng-ti.css" rel="stylesheet">';

const LOGIN_RUNTIME_CONTENT = `        <form id="credentials-form" class="candidate2-auth-step">
            <div class="input-group">
                <label for="qq-number">QQ Account / QQ账号</label>
                <input id="qq-number" name="qq_number" type="text" inputmode="numeric" pattern="[1-9][0-9]*" autocomplete="username" placeholder="123456789" required>
            </div>
            <div class="input-group">
                <label for="registration-code">24H Passcode / 注册码</label>
                <input id="registration-code" name="registration_code" type="password" pattern="DB-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}" autocomplete="off" spellcheck="false" placeholder="••••••" required>
            </div>
            <p class="candidate2-runtime-status credentials-status" role="status" aria-live="polite"></p>
            <button class="btn-primary" type="submit">入住社区</button>
            <div class="candidate2-auth-note">
                <span class="handwritten">首次入住会继续登记居民与家园资料。</span>
            </div>
        </form>

        <form id="profile-form" class="candidate2-auth-step" hidden>
            <div class="input-group">
                <label for="resident-name">RESIDENT NAME / 居民名字</label>
                <input id="resident-name" name="resident_name" type="text" autocomplete="off" required>
            </div>
            <div class="input-group">
                <label for="home-name">HOUSE NAME / 家园名字</label>
                <input id="home-name" name="home_name" type="text" autocomplete="off" required>
            </div>
            <div class="candidate2-profile-farm">
                <div class="washi-tape candidate2-profile-tape" aria-hidden="true"></div>
                <div class="input-group">
                    <label for="farm-doorplate">FARM NO. / 农场门牌号</label>
                    <input id="farm-doorplate" name="farm_doorplate" type="text" pattern="[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}" autocomplete="off" spellcheck="false" required>
                </div>
            </div>
            <div class="input-group">
                <label for="farm-human-url">HUMAN URL / 农场访问链接</label>
                <input id="farm-human-url" name="farm_human_url" type="url" inputmode="url" autocomplete="off" spellcheck="false" required>
            </div>
            <button id="farm-lookup-button" class="btn-primary candidate2-lookup-button" type="button">查询真实农场</button>
            <div id="farm-confirmation" class="candidate2-farm-confirmation" hidden>
                <p>FARM NAME / 农场名称</p>
                <strong id="farm-name"></strong>
                <small id="farm-doorplate-result"></small>
                <label class="candidate2-confirmation-check" for="confirm-farm">
                    <input id="confirm-farm" type="checkbox">
                    <span>就是这个农场</span>
                </label>
            </div>
            <p class="candidate2-runtime-status profile-status" role="status" aria-live="polite"></p>
            <div class="candidate2-profile-actions">
                <button id="profile-back-button" class="candidate2-text-button" type="button">返回</button>
                <button class="btn-primary" type="submit">确认入住</button>
            </div>
        </form>`;

const RESIDENCY_PERMIT_START =
  '            <div class="washi-tape" style="top: -12px; right: 20px; width: 60px; transform: rotate(5deg); background: var(--sky-blue);" vid="34"></div>';
const RESIDENCY_PERMIT_END =
  '        <button class="btn-primary" style="margin-top: 40px;" onclick="finalizeResidency()" vid="51">Confirm &amp; Finish / 确认入住</button>';

const RESIDENCY_PERMIT_CONTENT_WITH_LAYOUT = `            <div class="washi-tape permit-tape" aria-hidden="true"></div>
            <h2 class="permit-heading">COMMONS RESIDENCY<br><span class="permit-subheading">入住居住证</span></h2>

            <div class="permit-identity">
                <div class="permit-field">
                    <p class="permit-field-label">RESIDENT NAME / 居民姓名</p>
                    <p class="handwritten permit-field-value permit-resident-name">—</p>
                </div>
                <div class="permit-field">
                    <p class="permit-field-label">HOUSE NAME / 家园名称</p>
                    <p class="handwritten permit-field-value permit-home-name">—</p>
                </div>
                <div class="permit-field">
                    <p class="permit-field-label">HOUSE NO. / 家园门牌</p>
                    <p class="handwritten permit-field-value permit-doorplate-value">—</p>
                </div>
            </div>

            <p class="handwritten permit-motto">May every ring lead you home.</p>

            <div id="permit-stamp-box" class="animate-stamp" aria-label="已入住">
                <div class="stamp">APPROVED<br>已入住</div>
            </div>`;

const HOME_HEADER = `        <div style="display: flex; justify-content: space-between; align-items: flex-end;" vid="60">
            <div vid="61">
                <h2 class="handwritten" style="font-size: 1.8rem; color: var(--soft-pink);" vid="62">Sunshine Meadow</h2>
                <p style="font-size: 12px; color: var(--text-sub);" vid="63">House No. 0824-A • Breezy Valley</p>
            </div>
            <div style="text-align: right;" vid="64">
                <span style="font-size: 24px;" vid="65">🌤️</span>
                <p style="font-size: 10px; text-transform: uppercase;" vid="66">Sunny / 24°C</p>
            </div>
        </div>`;

const HOME_HEADER_RUNTIME = `        <div class="candidate2-home-scale-shell">
        <div class="candidate2-home-design-canvas">
        <header class="home-overview-header">
            <div class="home-heading-copy">
                <p class="home-page-kicker handwritten">MY HOME</p>
                <h1 class="home-name">—</h1>
                <div class="home-title-meta">
                    <span class="home-doorplate">DB-—</span>
                    <span class="home-weather-summary"><i aria-hidden="true"></i>天气尚未接入</span>
                </div>
            </div>
            <button class="home-mailbox-icon" type="button" aria-label="信箱" onclick="openHomeMailbox()">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.75 6.75h16.5v11.5H3.75z"></path><path d="m4.5 7.5 7.5 6 7.5-6"></path></svg>
                <span class="home-mailbox-badge" hidden>0</span>
            </button>
        </header>`;

const HOME_RUNTIME_CONTENT = `        <button class="home-parlor-entry" type="button" onclick="openHomeParlor()">
            <span class="home-parlor-copy">
                <span class="candidate2-section-label">GUEST ROOM</span>
                <strong>会客厅</strong>
                <small>查看来访、会话与剩余时间</small>
                <em>暂未开放</em>
            </span>
        </button>

        <section class="home-doorstep-list" aria-label="门口近况">
            <header class="home-doorstep-header">
                <strong>门口近况</strong>
                <small>AT THE DOOR</small>
            </header>
            <div class="home-doorstep-row home-doorbell-status">
                <div class="home-doorstep-label"><strong>门铃</strong><small>DOORBELLS</small></div>
                <p class="candidate2-empty-copy home-doorbell-empty">暂无可读取的门铃请求</p>
                <div class="candidate2-demo-block home-doorbell-demo" hidden>
                    <p class="candidate2-demo-count home-doorbell-count">0</p>
                    <ul class="candidate2-demo-request-list"></ul>
                </div>
            </div>
            <div class="home-doorstep-row home-visitor-status">
                <div class="home-doorstep-label"><strong>访客</strong><small>VISITORS</small></div>
                <p class="candidate2-empty-copy home-visitors-empty">暂无可读取的访客数据</p>
                <div class="candidate2-demo-visitors" hidden></div>
            </div>
        </section>

        <div class="home-mailbox-dialog" hidden>
            <button class="home-mailbox-backdrop" type="button" aria-label="关闭信箱" onclick="closeHomeMailbox()"></button>
            <section class="home-mailbox-sheet" role="dialog" aria-modal="true" aria-labelledby="home-mailbox-title">
                <header class="home-mailbox-sheet-header">
                    <div>
                        <p class="candidate2-section-label">COMMUNITY MAILBOX</p>
                        <h2 id="home-mailbox-title">信箱</h2>
                    </div>
                    <button class="home-mailbox-close" type="button" aria-label="关闭" onclick="closeHomeMailbox()">×</button>
                </header>
                <div class="home-mailbox-list-view">
                    <nav class="home-mailbox-categories" aria-label="信箱分类">
                        <button class="is-active" type="button" data-mailbox-category="all" onclick="setHomeMailboxCategory('all')">全部</button>
                        <button type="button" data-mailbox-category="visit" onclick="setHomeMailboxCategory('visit')">串门</button>
                        <button type="button" data-mailbox-category="activity" onclick="setHomeMailboxCategory('activity')">活动</button>
                        <button type="button" data-mailbox-category="notice" onclick="setHomeMailboxCategory('notice')">通知</button>
                    </nav>
                    <p class="candidate2-empty-copy home-mailbox-empty">信箱里暂时没有新消息。</p>
                    <ol class="home-mailbox-demo-list" hidden></ol>
                    <footer class="home-mailbox-footer" hidden>
                        <button type="button" data-mailbox-page="previous" onclick="changeHomeMailboxPage(-1)">上一页</button>
                        <span class="home-mailbox-page-state">1 / 1</span>
                        <button type="button" data-mailbox-page="next" onclick="changeHomeMailboxPage(1)">下一页</button>
                    </footer>
                </div>
                <article class="home-mailbox-detail" hidden>
                    <button class="home-mailbox-detail-back" type="button" onclick="showHomeMailboxList()">← 返回列表</button>
                    <div class="home-mailbox-detail-heading">
                        <p><span class="home-mailbox-detail-kind"></span><b class="home-mailbox-detail-title"></b></p>
                        <time></time>
                    </div>
                    <p class="home-mailbox-detail-body"></p>
                    <div class="home-mailbox-detail-footer">
                        <span class="home-mailbox-detail-status"></span>
                        <span class="home-mailbox-detail-actions" hidden>
                            <button type="button" onclick="showHomeMailboxDetailFeedback('接受')">接受</button>
                            <button type="button" onclick="showHomeMailboxDetailFeedback('拒绝')">拒绝</button>
                        </span>
                    </div>
                </article>
            </section>
        </div>
        </div>
        </div>`;

const HOME_SCRIPT = `
    let homeMailboxCategory = 'all';
    let homeMailboxMessages = [];
    let homeMailboxPage = 1;
    let homeMailboxUnreadCount = 0;
    const homeMailboxPageSize = 8;

    function syncHomeMailboxUnreadBadge() {
        const mailboxBadge = document.querySelector('.home-mailbox-badge');
        mailboxBadge.textContent = String(homeMailboxUnreadCount);
        mailboxBadge.hidden = homeMailboxUnreadCount < 1;
    }

    function openHomeParlor() {
        showCandidateNotice('会客厅暂未开放');
    }

    function openHomeMailbox() {
        document.querySelector('.home-mailbox-dialog').hidden = false;
        document.querySelector('#main-nav').style.display = 'none';
        showHomeMailboxList();
        document.querySelector('.home-mailbox-close').focus();
    }

    function closeHomeMailbox() {
        document.querySelector('.home-mailbox-dialog').hidden = true;
        document.querySelector('#main-nav').style.display = 'flex';
        document.querySelector('.home-mailbox-icon').focus();
    }

    function renderHomeMailbox() {
        const mailboxEmpty = document.querySelector('.home-mailbox-empty');
        const mailboxList = document.querySelector('.home-mailbox-demo-list');
        const mailboxFooter = document.querySelector('.home-mailbox-footer');
        const filteredMessages = homeMailboxCategory === 'all'
            ? homeMailboxMessages
            : homeMailboxMessages.filter((message) => message.category === homeMailboxCategory);
        const totalPages = Math.max(1, Math.ceil(filteredMessages.length / homeMailboxPageSize));
        homeMailboxPage = Math.min(homeMailboxPage, totalPages);
        const pageStart = (homeMailboxPage - 1) * homeMailboxPageSize;
        const pageMessages = filteredMessages.slice(pageStart, pageStart + homeMailboxPageSize);

        mailboxEmpty.hidden = filteredMessages.length > 0;
        mailboxList.hidden = filteredMessages.length === 0;
        mailboxFooter.hidden = filteredMessages.length === 0;
        mailboxList.replaceChildren(...pageMessages.map((message) => {
            const item = document.createElement('li');
            item.className = 'home-mailbox-message';
            const tones = { sky: 'var(--sky-blue)', sand: '#ead0ad', pink: '#dca9a8' };
            item.style.setProperty('--mail-tone', tones[message.tone] || '#d5b3ad');
            const title = document.createElement('button');
            title.type = 'button';
            title.textContent = message.title;
            title.onclick = () => openHomeMailboxDetail(message);
            item.append(title);
            if (message.unread) {
                const unread = document.createElement('span');
                unread.className = 'home-mailbox-new';
                unread.textContent = 'NEW';
                item.append(unread);
            }
            return item;
        }));

        document.querySelector('.home-mailbox-page-state').textContent = homeMailboxPage + ' / ' + totalPages;
        document.querySelector('[data-mailbox-page="previous"]').disabled = homeMailboxPage === 1;
        document.querySelector('[data-mailbox-page="next"]').disabled = homeMailboxPage === totalPages;
        document.querySelectorAll('[data-mailbox-category]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.mailboxCategory === homeMailboxCategory);
        });
    }

    function setHomeMailboxCategory(category) {
        homeMailboxCategory = category;
        homeMailboxPage = 1;
        renderHomeMailbox();
    }

    function changeHomeMailboxPage(offset) {
        homeMailboxPage += offset;
        renderHomeMailbox();
    }

    function showHomeMailboxList() {
        document.querySelector('.home-mailbox-sheet').classList.remove('is-detail');
        document.querySelector('.home-mailbox-list-view').hidden = false;
        document.querySelector('.home-mailbox-detail').hidden = true;
    }

    function openHomeMailboxDetail(message) {
        if (message.unread) {
            message.unread = false;
            homeMailboxUnreadCount = Math.max(0, homeMailboxUnreadCount - 1);
            syncHomeMailboxUnreadBadge();
            renderHomeMailbox();
        }
        document.querySelector('.home-mailbox-list-view').hidden = true;
        document.querySelector('.home-mailbox-sheet').classList.add('is-detail');
        const detail = document.querySelector('.home-mailbox-detail');
        detail.hidden = false;
        detail.querySelector('.home-mailbox-detail-kind').textContent = message.kind;
        detail.querySelector('.home-mailbox-detail-heading time').textContent = message.time;
        detail.querySelector('.home-mailbox-detail-title').textContent = message.title;
        detail.querySelector('.home-mailbox-detail-body').textContent = message.detail;
        detail.querySelector('.home-mailbox-detail-status').textContent = message.status;
        detail.querySelector('.home-mailbox-detail-actions').hidden = !message.actionable;
        detail.querySelector('.home-mailbox-detail-back').focus();
    }

    function showHomeMailboxDetailFeedback(action) {
        showCandidateNotice(action + '为演示操作，不会保存');
    }
`;

const PROFILE_RUNTIME_CONTENT = `        <div class="candidate2-profile-scale-shell">
        <div class="candidate2-profile-design-canvas">
        <div class="candidate2-profile-page">
        <section class="candidate2-profile-header-stack" aria-label="居民资料">
            <div class="candidate2-profile-action-sheet">
                <button id="profile-design-button" class="candidate2-profile-action handwritten" type="button">Design</button>
                <button id="profile-edit-button" class="candidate2-profile-action handwritten" type="button">Edit Profile</button>
            </div>
            <div class="candidate2-profile-note">
                <img class="candidate2-profile-paperclip" src="/candidate-two/settings-paperclip-silver-v1.png" alt="" aria-hidden="true">
                <p class="candidate2-section-label candidate2-profile-note-title">RESIDENCE INFO</p>
                <div class="candidate2-profile-note-body">
                    <div class="chibi-avatar" aria-label="居民形象尚未设置">
                        <svg class="chibi-placeholder" viewBox="0 0 100 100" aria-hidden="true">
                            <circle cx="50" cy="45" r="30" fill="#E6DFD5"></circle>
                            <circle cx="35" cy="40" r="4" fill="#6D5D55"></circle>
                            <circle cx="65" cy="40" r="4" fill="#6D5D55"></circle>
                            <path d="M40 60 Q50 70 60 60" fill="none" stroke="#6D5D55" stroke-width="2" stroke-linecap="round"></path>
                        </svg>
                    </div>
                    <div class="candidate2-identity-summary">
                        <p><span>居民姓名</span><strong class="profile-resident-name">—</strong></p>
                        <p><span>家园名称</span><strong class="profile-home-name">—</strong></p>
                        <p><span>家园门牌</span><strong class="profile-doorplate">DB-—</strong></p>
                        <p><span>农场门牌</span><strong class="profile-farm-doorplate">—</strong></p>
                    </div>
                </div>
            </div>
        </section>

        <section class="candidate2-profile-section candidate2-relationship-section">
            <p class="candidate2-profile-section-title handwritten">Relationship graph</p>
            <div class="candidate2-notebook-stack">
                <button id="profile-relationship-edit" class="candidate2-relationship-edit handwritten" type="button">Edit</button>
                <div class="candidate2-notebook-underlay" aria-hidden="true"></div>
                <div class="relationship-graph candidate2-empty-panel candidate2-demo-relationship-panel">
                    <div class="candidate2-notebook-holes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
                    <p class="profile-relationships-empty">来往数据尚未接入</p>
                    <div class="candidate2-demo-relationship" hidden>
                        <svg class="candidate2-demo-relation-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                            <line x1="50" y1="46.4" x2="12" y2="25"></line>
                            <line x1="50" y1="46.4" x2="67" y2="27"></line>
                            <line x1="50" y1="46.4" x2="21" y2="75"></line>
                        </svg>
                        <div class="candidate2-demo-relation-core"><span class="profile-relation-core-name">—</span></div>
                        <div class="candidate2-demo-relation-node candidate2-demo-relation-a"><strong></strong><small></small></div>
                        <div class="candidate2-demo-relation-node candidate2-demo-relation-b"><strong></strong><small></small></div>
                        <div class="candidate2-demo-relation-node candidate2-demo-relation-c"><strong></strong><small></small></div>
                    </div>
                    <form id="profile-relationship-editor" class="candidate2-relationship-editor" hidden>
                        <p class="candidate2-relationship-editor-title">编辑关系备注</p>
                        <label data-relation-index="0"><strong>—</strong><select><option value="不熟">不熟</option><option value="还行">还行</option><option value="朋友">朋友</option><option value="自定义">自定义</option></select><input type="text" maxlength="12" placeholder="输入关系"></label>
                        <label data-relation-index="1"><strong>—</strong><select><option value="不熟">不熟</option><option value="还行">还行</option><option value="朋友">朋友</option><option value="自定义">自定义</option></select><input type="text" maxlength="12" placeholder="输入关系"></label>
                        <label data-relation-index="2"><strong>—</strong><select><option value="不熟">不熟</option><option value="还行">还行</option><option value="朋友">朋友</option><option value="自定义">自定义</option></select><input type="text" maxlength="12" placeholder="输入关系"></label>
                        <div class="candidate2-relationship-editor-actions"><button id="profile-relationship-cancel" class="handwritten" type="button">Cancel</button><button class="handwritten" type="submit">Save</button></div>
                    </form>
                </div>
            </div>
        </section>

        <section class="candidate2-profile-section candidate2-activity-section">
            <img class="candidate2-activity-paperclip" src="/candidate-two/profile-activity-paperclip-v1.svg" alt="" aria-hidden="true">
            <p class="candidate2-profile-section-title handwritten">Recent Activity</p>
            <p class="candidate2-empty-copy candidate2-profile-empty">暂无可读取的活动数据</p>
            <div class="candidate2-demo-activity-list" hidden></div>
            <button id="profile-activity-more" class="candidate2-profile-more handwritten" type="button" hidden>More</button>
        </section>

        </div>
        </div>
        </div>`;

const SETTINGS_SCREEN = `
    <div id="screen-settings" class="screen">
        <main class="candidate2-settings-page">
            <img class="candidate2-settings-paperclip" src="/candidate-two/settings-paperclip-silver-v1.png" alt="" aria-hidden="true">
            <header class="candidate2-settings-heading">
                <p class="candidate2-settings-kicker handwritten">Household notes</p>
                <h1>设置</h1>
                <p>管理这间家如何连接 Doorbell。</p>
            </header>

            <section class="candidate2-settings-section candidate2-settings-profiles" hidden>
                <div class="candidate2-settings-section-heading"><div><span>00</span><h2>小机档案</h2></div></div>
                <label class="candidate2-settings-row"><span>当前档案<small>切换整套家园、农场和居民资料</small></span><select class="settings-profile-select"></select></label>
            </section>

            <section class="candidate2-settings-section candidate2-settings-connection">
                <div class="candidate2-settings-section-heading">
                    <div><span>01</span><h2>连接状态</h2></div>
                    <p class="settings-connection-summary">正在读取</p>
                </div>
                <div class="candidate2-settings-status-grid">
                    <div><i class="settings-wake-dot"></i><span>唤醒桥「铃」</span><strong class="settings-wake-state">正在读取</strong><small>与普通消息连接分开</small></div>
                </div>
            </section>

            <section class="candidate2-settings-section">
                <div class="candidate2-settings-section-heading"><div><span>02</span><h2>家园与天气</h2></div></div>
                <label class="candidate2-settings-row"><span>家园名称<small>显示在自己的家园入口</small></span><input class="settings-home-name" type="text" value=""></label>
                <label class="candidate2-settings-row candidate2-settings-row--textarea"><span>环境描述<small>家园公开可观察的环境背景</small></span><textarea class="settings-environment" rows="2"></textarea></label>
                <label class="candidate2-settings-row"><span>气候类型<small>决定家园天气如何自然演化</small></span><select class="settings-climate"><option value="">尚未设置</option><option value="tropical_rainforest">热带雨林气候</option><option value="tropical_savanna">热带草原气候</option><option value="tropical_monsoon">热带季风气候</option><option value="hot_desert">热带沙漠气候</option><option value="humid_subtropical">亚热带季风和湿润气候</option><option value="mediterranean">地中海气候</option><option value="oceanic">温带海洋性气候</option><option value="temperate_monsoon">温带季风气候</option><option value="continental">温带大陆性气候</option><option value="subarctic">亚寒带针叶林气候</option><option value="tundra">寒带苔原气候</option><option value="ice_cap">冰原气候</option><option value="highland">高原山地气候</option></select></label>
            </section>

            <section class="candidate2-settings-section">
                <div class="candidate2-settings-section-heading"><div><span>03</span><h2>通知与唤醒</h2></div><small>普通聊天不会唤醒</small></div>
                <label class="candidate2-settings-toggle"><span>暂停所有唤醒<small>信箱仍会保留通知</small></span><input class="settings-pause-all-wakeups" type="checkbox"><i></i></label>
                <label class="candidate2-settings-toggle"><span>串门申请与邀请</span><input class="settings-visit-notifications" type="checkbox" checked><i></i></label>
                <label class="candidate2-settings-toggle"><span>活动邀请</span><input class="settings-activity-notifications" type="checkbox" checked><i></i></label>
                <label class="candidate2-settings-toggle"><span>重要系统通知</span><input class="settings-system-notifications" type="checkbox" checked><i></i></label>
                <label class="candidate2-settings-toggle"><span>浏览器通知<small>需要允许本设备发送系统通知</small></span><input class="settings-browser-notifications" type="checkbox"><i></i></label>
                <label class="candidate2-settings-toggle"><span>活动提醒<small>菜成熟、冷却结束等个人到点提醒</small></span><input class="settings-activity-reminders" type="checkbox"><i></i></label>
            </section>

            <section class="candidate2-settings-section">
                <div class="candidate2-settings-section-heading"><div><span>04</span><h2>社区连接偏好</h2></div></div>
                <label class="candidate2-settings-row"><span>默认连接时长<small>小机主动进入活动室后生效</small></span><span class="candidate2-settings-number"><input class="settings-lounge-duration" type="number" min="1" inputmode="numeric" value="" required><em>分钟</em></span></label>
                <label class="candidate2-settings-row"><span>首次读取动态<small>只影响本家小机的初始上下文</small></span><span class="candidate2-settings-number"><input class="settings-initial-message-count" type="number" min="0" inputmode="numeric" value=""><em>条</em></span></label>
                <label class="candidate2-settings-row"><span>闲聊模式</span><select class="settings-chat-mode"><option value="natural">自然</option><option value="proactive">主动</option><option value="listening">倾听</option></select></label>
                <label class="candidate2-settings-toggle"><span>允许活动室热场</span><input class="settings-activity-room-warmup" type="checkbox" checked><i></i></label>
            </section>

            <section class="candidate2-settings-section candidate2-settings-memes">
                <div class="candidate2-settings-section-heading"><div><span>05</span><h2>共享梗库</h2></div><button id="settings-shared-memes-open" class="candidate2-settings-text-action handwritten" type="button">View</button></div>
                <label class="candidate2-settings-toggle"><span>更新提示<small>关闭后仍可手动读取共享梗库</small></span><input class="settings-shared-meme-updates" type="checkbox" checked><i></i></label>
                <div class="candidate2-settings-meme-summary"><strong class="settings-meme-count">尚未读取</strong><span>共享内容</span><small class="settings-meme-sync">点击 View 读取</small></div>
                <button id="settings-shared-meme-add" class="candidate2-settings-add-meme" type="button">＋ 添加新梗</button>
            </section>

            <section class="candidate2-settings-section candidate2-settings-account">
                <button id="settings-add-profile" class="candidate2-settings-add-meme" type="button">＋ 添加小机档案</button>
                <button id="settings-logout-button" class="candidate2-settings-logout handwritten" type="button">Log out</button>
                <button class="candidate2-settings-delete-account" type="button" data-demo-action="注销账号" disabled>注销账号</button>
            </section>
            <p class="candidate2-settings-feedback" role="status" aria-live="polite"></p>
        </main>
    </div>`;

const SHARED_MEMES_SCREEN = `
    <div id="screen-shared-memes" class="screen">
        <main class="candidate2-shared-memes-page">
            <button id="shared-memes-back" class="candidate2-shared-memes-back handwritten" type="button">← Settings</button>
            <header class="candidate2-shared-memes-heading">
                <p class="candidate2-settings-kicker handwritten">Shared notebook</p>
                <h1>共享梗库</h1>
                <p class="shared-memes-summary">点击读取共享梗库</p>
            </header>

            <div class="candidate2-shared-memes-tools">
                <label><span>SEARCH / 搜索</span><input id="shared-memes-search" type="search" autocomplete="off"></label>
                <button id="shared-meme-add-open" type="button">＋ 添加新梗</button>
            </div>

            <form id="shared-meme-add-form" class="candidate2-shared-meme-form" hidden>
                <div class="candidate2-shared-meme-form-heading"><h2>添加新梗</h2><button id="shared-meme-add-close" type="button">取消</button></div>
                <label><span>TERM / 梗名</span><input name="term" type="text" required></label>
                <label><span>CATEGORY / 分类</span><input name="category" type="text"></label>
                <label><span>TYPE / 类型</span><input name="meme_type" type="text"></label>
                <label><span>MEANING / 含义</span><textarea name="meaning" rows="2"></textarea></label>
                <label><span>USAGE / 用法</span><textarea name="usage" rows="2"></textarea></label>
                <label><span>ALIASES / 别名（每行一个）</span><textarea name="aliases" rows="2"></textarea></label>
                <label><span>EXAMPLES / 例句（每行一个）</span><textarea name="examples" rows="2"></textarea></label>
                <label><span>KEYWORDS / 关键词（每行一个）</span><textarea name="keywords" rows="2"></textarea></label>
                <label><span>ORIGIN / 来源</span><input name="origin" type="text"></label>
                <label><span>NOTES / 备注</span><textarea name="notes" rows="2"></textarea></label>
                <button class="candidate2-shared-meme-submit" type="submit">加入共享梗库</button>
                <p class="shared-meme-form-status" role="status" aria-live="polite"></p>
            </form>

            <p class="shared-memes-status" role="status" aria-live="polite"></p>
            <div class="candidate2-shared-meme-list"></div>

            <section class="candidate2-shared-meme-detail" hidden>
                <button id="shared-meme-detail-close" type="button">收起详情</button>
                <h2 class="shared-meme-detail-term"></h2>
                <p class="shared-meme-detail-meta"></p>
                <dl>
                    <div><dt>含义</dt><dd class="shared-meme-detail-meaning"></dd></div>
                    <div><dt>用法</dt><dd class="shared-meme-detail-usage"></dd></div>
                    <div><dt>别名</dt><dd class="shared-meme-detail-aliases"></dd></div>
                    <div><dt>例句</dt><dd class="shared-meme-detail-examples"></dd></div>
                    <div><dt>关键词</dt><dd class="shared-meme-detail-keywords"></dd></div>
                    <div><dt>来源</dt><dd class="shared-meme-detail-origin"></dd></div>
                    <div><dt>备注</dt><dd class="shared-meme-detail-notes"></dd></div>
                </dl>
            </section>
        </main>
    </div>`;

const SETTINGS_NAV_ITEM = `
        <div class="nav-item" role="button" tabindex="0" aria-label="设置" onclick="showScreen('screen-settings')" onkeydown="if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); showScreen('screen-settings'); }">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h6m4 0h6M4 12h2m4 0h10M4 18h10m4 0h2"></path><circle cx="12" cy="6" r="2"></circle><circle cx="8" cy="12" r="2"></circle><circle cx="16" cy="18" r="2"></circle></svg>
        </div>`;

const TRANSIENT_NOTICE_MODAL = `
    <div class="candidate2-notice-modal" hidden>
        <button class="candidate2-notice-backdrop" type="button" aria-label="关闭提示" onclick="closeCandidateNotice()"></button>
        <div class="candidate2-notice-scale-shell">
            <div class="candidate2-notice-design-canvas">
                <section class="candidate2-notice-card" role="alertdialog" aria-modal="true" aria-labelledby="candidate2-notice-title" aria-describedby="candidate2-notice-message">
                    <p class="candidate2-section-label handwritten">NOTICE</p>
                    <h2 id="candidate2-notice-title">提示</h2>
                    <p id="candidate2-notice-message"></p>
                    <button class="candidate2-notice-confirm" type="button" onclick="closeCandidateNotice()">知道了</button>
                </section>
            </div>
        </div>
    </div>`;

const HOME_CLIMATE_CARD = `            <div class="home-card weather-widget" vid="68">
                <div vid="69">
                    <p style="font-size: 10px; font-weight: 600;" vid="70">CLIMATE</p>
                    <p style="font-size: 14px;" vid="71">Spring Bloom</p>
                </div>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" vid="72">
                    <circle cx="12" cy="12" r="5" vid="73"></circle>
                    <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" vid="74"></path>
                </svg>
            </div>

`;

const HOME_SIGN_STYLES = `
        :root {
            --ui-regular-font: 'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif;
        }

        body,
        html,
        button,
        input,
        select,
        textarea {
            font-family: var(--ui-regular-font);
        }

        h1,
        h2 {
            font-family: 'Playfair Display', 'Yuanti SC', 'STYuanti-SC-Regular', '圆体-简', 'YouYuan', cursive;
        }

        .handwritten,
        .stamp {
            font-family: 'Gaegu', 'ZCOOL KuaiLe', 'Yuanti SC', 'STYuanti-SC-Regular', '圆体-简', 'YouYuan', cursive;
        }

        .bottom-nav {
            right: 11.16%;
            bottom: 16px;
            left: 11.16%;
            height: 48px;
            padding: 4px;
            border: 0.5px solid #d7cec3;
            border-radius: 24px;
            background: rgba(233, 228, 220, 0.7);
            box-shadow: 0 2px 5px rgba(96, 72, 63, 0.08);
            backdrop-filter: blur(14px) saturate(112%);
            -webkit-backdrop-filter: blur(14px) saturate(112%);
            justify-content: flex-start;
        }

        .bottom-nav .nav-item {
            position: relative;
            width: auto;
            height: 100%;
            min-width: 0;
            border-radius: 999px;
            flex: 0 0 var(--candidate2-nav-share, 25%);
            transition: color 180ms ease;
        }

        .bottom-nav .nav-item svg {
            position: relative;
            z-index: 1;
        }

        .bottom-nav .nav-item.active {
            color: #6d5d55;
            background: transparent;
        }

        .bottom-nav .nav-item::before {
            position: absolute;
            inset: 0;
            border: 0.5px solid #d9d1c8;
            border-radius: 999px;
            background: #fffdf9;
            box-shadow: 0 2px 4px rgba(96, 72, 63, 0.07);
            content: '';
            opacity: 0;
            pointer-events: none;
            transform: scale(0.9);
            transition: opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.75, 0.25, 1);
        }

        .bottom-nav .nav-item.active::before {
            opacity: 1;
            transform: scale(1);
        }

        #screen-home {
            position: relative;
            min-height: 100%;
            padding: 0;
            overflow: hidden auto;
            background: #f7f1ea;
        }

        #screen-home.active {
            display: flex;
            flex-direction: column;
        }

        .candidate2-home-scale-shell {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            flex: 0 0 auto;
        }

        .candidate2-home-design-canvas {
            position: relative;
            width: 430px;
            min-height: 100%;
            margin-inline: auto;
            padding: 24px 22px 116px;
            zoom: var(--candidate2-home-scale, 1);
        }

        .home-overview-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 18px;
            padding: 10px 4px 22px;
        }

        .home-heading-copy {
            min-width: 0;
        }

        .home-mailbox-icon {
            position: relative;
            display: grid;
            width: 38px;
            height: 38px;
            flex: 0 0 38px;
            place-items: center;
            margin-top: 2px;
            padding: 0;
            border: 0;
            color: #8f7165;
            background: transparent;
            cursor: pointer;
        }

        .home-mailbox-icon svg {
            width: 23px;
            height: 23px;
            fill: none;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.35;
        }

        .home-mailbox-badge {
            position: absolute;
            top: 1px;
            right: 0;
            display: grid;
            min-width: 15px;
            height: 15px;
            place-items: center;
            padding: 0 4px;
            border: 1.5px solid #fffdf9;
            border-radius: 999px;
            color: #fffdf9;
            background: #c98583;
            font-family: var(--ui-regular-font);
            font-size: 8px;
            line-height: 1;
        }

        .home-mailbox-badge[hidden] {
            display: none;
        }

        .home-page-kicker {
            margin: 0 0 7px;
            color: #a58376;
            font-size: 12px;
            letter-spacing: 0.14em;
        }

        .home-name {
            max-width: 100%;
            margin: 0;
            overflow-wrap: anywhere;
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 36.12px;
            font-weight: 500;
            line-height: 1.15;
            letter-spacing: 0.01em;
        }

        .home-title-meta {
            display: flex;
            align-items: center;
            gap: 14px;
            margin-top: 12px;
            color: #9a8177;
            font-size: 10px;
        }

        .home-weather-summary {
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .home-weather-summary i {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: #b9a298;
        }

        .home-parlor-entry {
            position: relative;
            display: block;
            width: 100%;
            min-height: 188px;
            padding: 24px 20px 20px 24px;
            overflow: hidden;
            border: 0.5px solid #eadfd5;
            border-radius: 26px 26px 8px 8px;
            color: #60483f;
            background: #fffdf9 url('/candidate-two/home-parlor-watercolor-background.webp') center / cover no-repeat;
            box-shadow: 0 5px 8px -6px rgba(96, 72, 63, 0.35);
            text-align: left;
            cursor: pointer;
        }

        .home-parlor-copy {
            display: flex;
            width: 48%;
            height: 143px;
            min-width: 0;
            flex-direction: column;
            align-items: flex-start;
        }

        .home-parlor-copy strong {
            margin-top: 7px;
            font-size: 27px;
            font-weight: 500;
            line-height: 1.2;
        }

        .home-parlor-copy small {
            margin-top: 7px;
            color: #8d746a;
            font-size: 11px;
            line-height: 1.55;
        }

        .home-parlor-copy em {
            margin-top: auto;
            color: #aa8178;
            font-size: 10px;
            font-style: normal;
            letter-spacing: 0.08em;
        }

        .home-doorstep-list {
            width: 100%;
            margin-top: 15px;
            border-top: 1px solid rgba(109, 80, 72, 0.18);
        }

        .home-doorstep-header {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 16px;
            padding: 20px 4px 11px;
            color: #60483f;
        }

        .home-doorstep-header strong {
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 15px;
            font-weight: 600;
        }

        .home-doorstep-header small {
            color: #aa9187;
            font-family: 'Gaegu', 'ZCOOL KuaiLe', 'Yuanti SC', 'STYuanti-SC-Regular', '圆体-简', 'YouYuan', cursive;
            font-size: 8px;
            letter-spacing: 0.13em;
        }

        .home-doorstep-row {
            display: grid;
            grid-template-columns: 72px minmax(0, 1fr);
            min-width: 0;
            min-height: 76px;
            align-items: center;
            gap: 16px;
            padding: 12px 4px;
            border: 0;
            border-bottom: 1px solid rgba(109, 80, 72, 0.18);
            color: #60483f;
            background: transparent;
            text-align: left;
        }

        .home-doorstep-label {
            display: flex;
            min-width: 0;
            flex-direction: column;
            gap: 3px;
        }

        .home-doorstep-label strong {
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 15px;
            font-weight: 600;
            line-height: 1.25;
        }

        .home-doorstep-label small {
            color: #aa9187;
            font-family: 'Gaegu', 'ZCOOL KuaiLe', 'Yuanti SC', 'STYuanti-SC-Regular', '圆体-简', 'YouYuan', cursive;
            font-size: 7px;
            line-height: 1.2;
            letter-spacing: 0.1em;
        }

        #screen-home .candidate2-empty-copy {
            color: #9f8c82;
            font-size: 10px;
        }

        .home-doorbell-demo {
            display: grid;
            grid-template-columns: 26px minmax(0, 1fr);
            align-items: start;
            gap: 9px;
        }

        .home-doorbell-demo .candidate2-demo-count {
            margin: 0;
            color: #d49c98;
            font-family: var(--ui-regular-font);
            font-size: 18px;
            font-weight: 500;
            line-height: 1.2;
        }

        .home-doorstep-list .candidate2-demo-request-list {
            gap: 2px;
            font-size: 9px;
        }

        .home-doorstep-list .candidate2-demo-visitors {
            gap: 15px;
            padding-top: 0;
        }

        .home-doorstep-list .candidate2-demo-visitor {
            width: 30px;
            font-size: 8px;
        }

        .home-doorstep-list .candidate2-demo-visitor::before {
            width: 25px;
            height: 25px;
            border: 0;
            box-shadow: none;
        }

        .home-mailbox-dialog[hidden] {
            display: none;
        }

        .home-mailbox-dialog {
            position: fixed;
            z-index: 240;
            inset: 0;
        }

        .home-mailbox-backdrop {
            position: absolute;
            border: 0;
            background: rgba(74, 54, 47, 0.2);
            backdrop-filter: blur(2px);
            inset: 0;
        }

        .home-mailbox-sheet {
            position: absolute;
            top: 50%;
            left: 50%;
            width: calc(100% - 44px);
            height: min(650px, calc(100% - 92px));
            padding: 23px 22px 18px;
            overflow: hidden;
            border: 0.5px solid #e1d5c9;
            border-radius: 0;
            color: #60483f;
            background: #fffdf9;
            box-shadow: 0 16px 34px rgba(83, 63, 53, 0.18);
            transform: translate(-50%, -50%);
        }

        .home-mailbox-sheet.is-detail {
            height: auto;
            max-height: calc(100% - 92px);
        }

        .home-mailbox-sheet-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            padding: 2px 2px 17px;
            border-bottom: 0.5px solid #dfd2c7;
        }

        .home-mailbox-sheet-header .candidate2-section-label {
            margin: 0 0 3px;
            color: #aa9187;
            font-family: 'Gaegu', 'ZCOOL KuaiLe', 'Yuanti SC', 'STYuanti-SC-Regular', '圆体-简', 'YouYuan', cursive;
            font-size: 7px;
            letter-spacing: 0.12em;
        }

        .home-parlor-copy > .candidate2-section-label {
            font-family: 'Gaegu', 'ZCOOL KuaiLe', 'Yuanti SC', 'STYuanti-SC-Regular', '圆体-简', 'YouYuan', cursive;
        }

        .home-mailbox-sheet-header h2 {
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 23px;
            font-style: normal;
            font-weight: 500;
            line-height: 1.2;
        }

        .home-mailbox-close {
            width: 30px;
            height: 30px;
            flex: 0 0 30px;
            padding: 0 0 3px;
            border: 0.5px solid #d9cbc0;
            border-radius: 0;
            color: #8d746a;
            background: transparent;
            font-family: Georgia, serif;
            font-size: 21px;
            line-height: 1;
            cursor: pointer;
        }

        .home-mailbox-empty {
            padding: 72px 2px 22px;
            text-align: center;
        }

        .home-mailbox-categories {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 0;
            border-bottom: 0.5px solid #dfd2c7;
        }

        .home-mailbox-categories button {
            position: relative;
            padding: 11px 2px 10px;
            border: 0;
            color: #a18a80;
            background: transparent;
            font-family: var(--ui-regular-font);
            font-size: 9px;
            cursor: pointer;
        }

        .home-mailbox-categories button.is-active {
            color: #60483f;
        }

        .home-mailbox-categories button.is-active::after {
            position: absolute;
            right: 28%;
            bottom: -1px;
            left: 28%;
            height: 1px;
            background: #b99386;
            content: '';
        }

        .home-mailbox-demo-list {
            height: 392px;
            margin: 0;
            padding: 0;
            overflow: hidden;
            list-style: none;
        }

        .home-mailbox-demo-list[hidden] {
            display: none;
        }

        .home-mailbox-message {
            position: relative;
            display: grid;
            min-height: 49px;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            gap: 12px;
            padding: 10px 2px 9px 14px;
            border-bottom: 0.5px solid #eadfd5;
        }

        .home-mailbox-message:last-child {
            border-bottom: 0;
        }

        .home-mailbox-message::before {
            position: absolute;
            top: 50%;
            left: 0;
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: var(--mail-tone, #d5b3ad);
            content: '';
            transform: translateY(-50%);
        }

        .home-mailbox-message h3 {
            margin: 0;
            color: #60483f;
            font-size: 11px;
            font-weight: 500;
            line-height: 1.4;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .home-mailbox-message > button {
            min-width: 0;
            overflow: hidden;
            border: 0;
            color: #60483f;
            background: transparent;
            font-family: var(--ui-regular-font);
            font-size: 11px;
            font-weight: 500;
            line-height: 1.4;
            text-align: left;
            text-overflow: ellipsis;
            white-space: nowrap;
            cursor: pointer;
        }

        .home-mailbox-new {
            color: #c98583;
            font-family: 'Gaegu', 'ZCOOL KuaiLe', cursive;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.04em;
        }

        .home-mailbox-footer {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            gap: 12px;
            min-height: 33px;
            padding-top: 8px;
            border-top: 0.5px solid #dfd2c7;
        }

        .home-mailbox-footer[hidden] {
            display: none;
        }

        .home-mailbox-footer button {
            padding: 5px 0;
            border: 0;
            color: #8f766c;
            background: transparent;
            font-family: var(--ui-regular-font);
            font-size: 8px;
            cursor: pointer;
        }

        .home-mailbox-footer button:first-child {
            text-align: left;
        }

        .home-mailbox-footer button:last-child {
            text-align: right;
        }

        .home-mailbox-footer button:disabled {
            color: #cfc2b8;
            cursor: default;
        }

        .home-mailbox-page-state {
            color: #9f877d;
            font-size: 8px;
        }

        .home-mailbox-list-view[hidden],
        .home-mailbox-detail[hidden] {
            display: none;
        }

        .home-mailbox-detail {
            padding: 16px 2px 0;
        }

        .home-mailbox-detail-back {
            padding: 0;
            border: 0;
            color: #9a8177;
            background: transparent;
            font-family: var(--ui-regular-font);
            font-size: 9px;
            cursor: pointer;
        }

        .home-mailbox-detail-heading {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin: 25px 0 0;
            color: #aa9187;
        }

        .home-mailbox-detail-heading p {
            display: flex;
            min-width: 0;
            align-items: baseline;
            gap: 8px;
            margin: 0;
        }

        .home-mailbox-detail-heading time {
            flex: 0 0 auto;
            font-size: 8px;
        }

        .home-mailbox-detail-title {
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 13px;
            font-weight: 500;
            line-height: 1.4;
        }

        .home-mailbox-detail-kind {
            color: #927c72;
            font-family: var(--ui-regular-font);
            font-size: 13px;
            font-weight: 500;
            line-height: 1.4;
        }

        .home-mailbox-detail-body {
            margin: 18px 0 0;
            padding: 0 2px;
            border: 0;
            color: #806b62;
            font-size: 11px;
            line-height: 2;
        }

        .home-mailbox-detail-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            margin-top: 16px;
        }

        .home-mailbox-detail-status {
            color: #a58a80;
            font-size: 9px;
        }

        .home-mailbox-detail-actions {
            display: flex;
            gap: 8px;
        }

        .home-mailbox-detail-actions[hidden] {
            display: none;
        }

        .home-mailbox-detail-actions button {
            min-width: 58px;
            padding: 7px 12px;
            border: 0.5px solid #d8c7bb;
            border-radius: 0;
            color: #7f6258;
            background: transparent;
            font-family: var(--ui-regular-font);
            font-size: 9px;
            cursor: pointer;
        }

        .home-mailbox-detail-actions button:first-child {
            border-color: #d6b6ae;
            background: #f5e5df;
        }

`;

const RUNTIME_STYLES = `
        .candidate2-auth-step[hidden],
        .candidate2-farm-confirmation[hidden] {
            display: none;
        }

        .candidate2-auth-step {
            display: contents;
        }

        .candidate2-auth-step .input-group {
            padding: 0;
            border: 0;
            border-radius: 0;
            background: transparent;
            box-shadow: none;
        }

        .candidate2-auth-step .input-group label {
            margin: 0 4px 7px;
        }

        .candidate2-auth-step .input-group input {
            width: 100%;
            min-height: 50px;
            padding: 11px 14px;
            border: 1.5px solid var(--border-color);
            border-radius: var(--radius-sm);
            background: white;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
        }

        .candidate2-auth-note {
            margin-top: 24px;
            text-align: center;
        }

        .candidate2-auth-note span {
            font-size: 0.9rem;
            opacity: 0.7;
        }

        .candidate2-runtime-status {
            min-height: 18px;
            margin: 8px 2px 0;
            color: var(--text-main);
            font-size: 12px;
            line-height: 1.5;
            text-align: center;
        }

        .profile-status:not(:empty) {
            margin-top: 12px;
            padding: 10px 12px;
            border-left: 3px solid var(--soft-pink);
            color: #6f4c45;
            background: #fff6f3;
            font-size: 13px;
            text-align: left;
        }

        .candidate2-notice-modal {
            position: fixed;
            z-index: 500;
            inset: 0;
            display: grid;
            place-items: center;
            overflow: hidden;
        }

        .candidate2-notice-modal[hidden] {
            display: none;
        }

        .candidate2-notice-backdrop {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            padding: 0;
            border: 0;
            border-radius: 0;
            background: rgba(75, 56, 49, 0.28);
            cursor: pointer;
        }

        .candidate2-notice-scale-shell {
            position: relative;
            z-index: 1;
            width: 100%;
            pointer-events: none;
        }

        .candidate2-notice-design-canvas {
            display: grid;
            width: 430px;
            margin-inline: auto;
            place-items: center;
            zoom: var(--candidate2-notice-scale, 1);
        }

        .candidate2-notice-card {
            width: 334px;
            padding: 24px 24px 20px;
            border: 0.5px solid #d8c7bb;
            border-radius: 0;
            color: #60483f;
            background: #fffdf9;
            box-shadow: 3px 4px 0 rgba(114, 88, 77, 0.12);
            pointer-events: auto;
            text-align: center;
        }

        .candidate2-notice-card .candidate2-section-label {
            margin: 0 0 8px;
            color: #aa8e83;
            font-size: 11px;
            letter-spacing: 0.08em;
        }

        .candidate2-notice-card h2 {
            margin: 0;
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 22px;
            font-weight: 500;
        }

        #candidate2-notice-message {
            margin: 18px 0 22px;
            color: #7c675f;
            font-family: var(--ui-regular-font);
            font-size: 14px;
            line-height: 1.65;
        }

        .candidate2-notice-confirm {
            min-width: 92px;
            padding: 8px 18px;
            border: 0.5px solid #bca79c;
            border-radius: 0;
            color: #60483f;
            background: #f7eee7;
            font-family: var(--ui-regular-font);
            font-size: 13px;
            cursor: pointer;
        }

        .candidate2-profile-farm {
            position: relative;
            margin-top: 18px;
        }

        .candidate2-profile-tape {
            top: -10px;
            left: -10px;
        }

        .candidate2-lookup-button {
            width: 100%;
            min-height: 50px;
            margin-top: 0;
            padding: 12px 18px;
        }

        .candidate2-farm-confirmation {
            display: grid;
            gap: 5px;
            margin: 14px 0 16px;
            padding: 12px 16px;
            border: 1.5px solid var(--border-color);
            border-radius: var(--radius-sm);
            background: white;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
        }

        .candidate2-farm-confirmation p,
        .candidate2-farm-confirmation strong,
        .candidate2-farm-confirmation small {
            margin: 0;
        }

        .candidate2-farm-confirmation p,
        .candidate2-farm-confirmation small {
            color: var(--text-sub);
            font-size: 10px;
        }

        .candidate2-confirmation-check {
            display: flex;
            min-height: 44px;
            align-items: center;
            gap: 9px;
            margin-top: 4px;
            color: var(--text-main);
            font-size: 13px;
        }

        .candidate2-confirmation-check input {
            width: 18px;
            height: 18px;
            margin: 0;
        }

        .candidate2-profile-actions {
            display: grid;
            grid-template-columns: auto 1fr;
            align-items: center;
            gap: 12px;
        }

        .candidate2-profile-actions .btn-primary {
            margin-top: 0;
        }

        .candidate2-text-button {
            min-width: 44px;
            min-height: 44px;
            padding: 8px 12px;
            border: 0;
            color: var(--text-main);
            background: transparent;
            font: inherit;
            font-size: 13px;
            cursor: pointer;
        }

        @media (hover: none) and (pointer: coarse) {
            .candidate2-auth-step input {
                font-size: 16px;
            }
        }

        button:focus-visible,
        input:focus-visible,
        .nav-item:focus-visible {
            outline: 3px solid rgba(109, 93, 85, 0.38);
            outline-offset: 2px;
        }

        button:disabled,
        input:disabled {
            cursor: wait;
            opacity: 0.62;
        }

        .candidate2-section-label {
            margin: 0 0 8px;
            color: var(--text-sub);
            font-size: 10px;
            font-weight: 600;
        }

        .candidate2-empty-copy {
            margin: 0;
            color: var(--text-sub);
            font-size: 12px;
            line-height: 1.5;
        }

        .candidate2-demo-count {
            margin: 0 0 6px;
            color: var(--soft-pink);
            font-family: 'Gaegu', cursive;
            font-size: 30px;
            line-height: 1;
        }

        .candidate2-demo-request-list {
            display: grid;
            gap: 5px;
            margin: 0;
            padding: 0;
            list-style: none;
            color: var(--text-main);
            font-size: 9px;
            line-height: 1.35;
        }

        .candidate2-demo-request-list li::before {
            content: '•';
            margin-right: 4px;
            color: var(--soft-pink);
        }

        .candidate2-demo-visitors {
            display: flex;
            flex-wrap: wrap;
            gap: 7px;
            padding-top: 6px;
        }

        .candidate2-demo-visitors[hidden],
        .candidate2-demo-block[hidden],
        .candidate2-demo-relationship[hidden],
        .candidate2-demo-activity-list[hidden] {
            display: none;
        }

        .candidate2-demo-visitor {
            display: grid;
            width: 34px;
            gap: 3px;
            justify-items: center;
            color: var(--text-sub);
            font-size: 8px;
        }

        .candidate2-demo-visitor::before {
            width: 25px;
            height: 25px;
            border: 2px solid white;
            border-radius: 50%;
            background: var(--visitor-tone, var(--sky-blue));
            box-shadow: 0 2px 8px rgba(109, 93, 85, 0.1);
            content: '';
        }

        .candidate2-demo-story {
            margin: 0;
            color: var(--text-main);
            font-size: 13px;
            line-height: 1.65;
        }

        .profile-qq-number {
            margin: 4px 0 0;
            font-size: 0.9rem;
            opacity: 0.7;
        }

        #screen-profile {
            padding: 22px 18px 116px;
            background: #f8f1e9;
        }

        .candidate2-profile-scale-shell {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            flex: 0 0 auto;
        }

        .candidate2-profile-design-canvas {
            width: 402px;
            margin-inline: auto;
            zoom: var(--candidate2-profile-scale, 1);
        }

        .candidate2-profile-page {
            position: relative;
            flex: 0 0 auto;
            min-height: 100%;
            padding: 24px 16px 34px;
            border: 0.5px solid #e1d5c9;
            border-bottom: 0;
            border-radius: 0;
            color: #60483f;
            background: #fffdf9;
            box-shadow: 2px 3px 4px rgba(83, 63, 53, 0.08);
        }

        .candidate2-profile-page::after {
            position: absolute;
            right: 0;
            bottom: -116px;
            left: 0;
            height: 116px;
            background: #fffdf9;
            content: '';
            pointer-events: none;
        }

        .candidate2-profile-page::before {
            position: absolute;
            top: -1px;
            right: 0;
            left: 0;
            z-index: 2;
            height: 13px;
            background: radial-gradient(circle at 14px 0, #f8f1e9 0 7px, transparent 7.35px) 0 0 / 28px 13px repeat-x;
            content: '';
            pointer-events: none;
        }

        .candidate2-profile-header-stack {
            position: relative;
            z-index: 3;
            flex: 0 0 auto;
            min-height: 176px;
            margin: -30px 0 8px;
        }

        .candidate2-profile-action-sheet {
            position: absolute;
            inset: 0;
            z-index: 3;
            display: block;
            width: auto;
            height: auto;
            padding: 0;
            border: 0;
            background: transparent;
            clip-path: none;
            filter: none;
            transform: none;
            pointer-events: none;
        }

        .candidate2-profile-action {
            position: absolute;
            top: 144px;
            right: 4px;
            width: 82px;
            height: 26px;
            min-height: 0;
            padding: 1px 6px;
            border: 0;
            color: #60483f;
            background: #efe3da;
            clip-path: polygon(0.8% 1%, 99% 0, 97% 99%, 0 98%);
            filter:
                drop-shadow(0 0 0.4px #d6c8bc)
                drop-shadow(1px 2px 1px rgba(83, 63, 53, 0.08));
            font-size: 12px;
            line-height: 1;
            text-align: center;
            white-space: nowrap;
            transform: rotate(0.8deg);
            transform-origin: center;
            text-decoration: none;
            cursor: pointer;
            pointer-events: auto;
        }

        .candidate2-profile-action:first-child {
            top: 20px;
            right: auto;
            left: 14px;
            z-index: 1;
            width: 50px;
            height: 26px;
            margin: 0;
            padding: 1px 6px;
            background: #e8e1d8;
            transform: rotate(-1.6deg);
        }

        .candidate2-profile-action::before {
            position: absolute;
            inset: -12px 0;
            content: '';
        }

        .candidate2-profile-note {
            position: absolute;
            top: 0;
            right: -8px;
            z-index: 1;
            width: 86%;
            flex: 0 0 auto;
            margin: 0;
            padding: 20px 16px 8px;
            border: 0.5px solid #e1d5c9;
            border-radius: 3px;
            background: #fffaf0;
            box-shadow: 2px 3px 4px rgba(83, 63, 53, 0.08);
            transform: rotate(1.2deg) scale(1.08);
            transform-origin: top right;
        }

        .candidate2-profile-paperclip {
            position: absolute;
            z-index: 2;
            top: -17px;
            right: 19px;
            width: auto;
            height: 64px;
            object-fit: contain;
            filter: drop-shadow(1px 2px 1px rgba(67, 70, 72, 0.18));
            pointer-events: none;
            transform: rotate(30deg) scale(0.86);
        }

        .candidate2-profile-note-title {
            margin: 0 0 14px;
            color: #60483f;
            font-family: 'Gaegu', cursive;
            font-size: 18px;
            font-weight: 700;
            letter-spacing: 0.06em;
            line-height: 1;
            text-align: center;
        }

        .candidate2-profile-note-body {
            display: grid;
            grid-template-columns: 58px minmax(0, 1fr);
            gap: 12px;
            align-items: start;
        }

        .candidate2-profile-note .chibi-avatar {
            width: 58px;
            height: 76px;
            border: 1px solid #eadfc9;
            border-radius: 2px;
            background: #fffdf7;
            box-shadow: 0 4px 10px rgba(109, 93, 85, 0.08);
        }

        .candidate2-identity-summary {
            display: grid;
            flex: 0 0 auto;
            height: auto;
            min-height: 0;
            gap: 6px;
            padding: 0;
            overflow: visible;
            margin: 0;
        }

        .profile-resident-name {
            font-family: var(--ui-regular-font);
            font-style: normal;
        }

        .candidate2-identity-summary p {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            margin: 0;
            font-size: 8px;
        }

        .candidate2-identity-summary span {
            color: #a8958b;
        }

        .candidate2-identity-summary strong {
            overflow-wrap: anywhere;
            color: #60483f;
            font-size: 8px;
            font-weight: 500;
            text-align: right;
        }

        .candidate2-empty-panel {
            display: grid;
            height: 112px;
            place-items: center;
        }

        .candidate2-empty-panel p {
            margin: 0;
            color: var(--text-sub);
            font-size: 12px;
        }

        .candidate2-profile-section {
            flex: 0 0 auto;
        }

        .candidate2-relationship-section {
            position: relative;
            z-index: 2;
        }

        .candidate2-activity-section {
            position: relative;
            z-index: 5;
            min-height: 196px;
            margin: -140px 34px 0 4px;
            padding: 27px 18px 16px 25px;
            background: transparent;
            box-shadow: none;
            isolation: isolate;
        }

        .candidate2-activity-section::before {
            position: absolute;
            inset: 0;
            z-index: -1;
            background-color: #f8ece6;
            background-image:
                radial-gradient(circle at 22% 18%, rgba(255, 252, 244, 0.32) 0 1px, transparent 1.5px),
                radial-gradient(circle at 74% 63%, rgba(171, 130, 116, 0.08) 0 0.8px, transparent 1.3px);
            background-size: 19px 19px, 23px 23px;
            clip-path: polygon(1.5% 1.5%, 13% 2.5%, 24% 0.5%, 36% 2.2%, 48% 1%, 60% 3%, 73% 1.2%, 85% 2.8%, 98% 1.5%, 99% 14%, 98% 27%, 100% 40%, 98.5% 53%, 100% 67%, 98% 80%, 99% 98%, 87% 97%, 75% 99%, 63% 97%, 50% 99%, 38% 97%, 25% 98.5%, 13% 97%, 1.5% 99%, 2% 86%, 0.5% 74%, 2% 61%, 0.7% 48%, 2% 35%, 0.5% 22%, 1.5% 10%);
            content: '';
            filter: drop-shadow(2px 4px 5px rgba(83, 63, 53, 0.1));
            pointer-events: none;
        }

        .candidate2-profile-section-title {
            position: relative;
            z-index: 3;
            width: fit-content;
            margin: 0;
            color: #60483f;
            font-size: 19px;
            line-height: 1;
        }

        .candidate2-relationship-section > .candidate2-profile-section-title {
            position: absolute;
            top: 0;
            left: 0;
            z-index: 6;
            display: flex;
            width: 132px;
            min-height: 58px;
            align-items: center;
            margin: 0;
            padding: 9px 12px 7px;
            background: #eadfd4;
            box-shadow: 1px 2px 2px rgba(83, 63, 53, 0.08);
            line-height: 0.92;
            transform: rotate(-1.2deg);
        }

        .candidate2-activity-section .candidate2-profile-section-title {
            margin: 0 auto 13px;
            color: #6f5a50;
            font-size: 18px;
            text-align: center;
        }

        .candidate2-activity-paperclip {
            position: absolute;
            top: -18px;
            left: 18px;
            z-index: 4;
            width: auto;
            height: 54px;
            object-fit: contain;
            filter: drop-shadow(1px 2px 1px rgba(67, 70, 72, 0.16));
            pointer-events: none;
            transform: rotate(17deg);
        }

        .candidate2-notebook-stack {
            position: relative;
            height: 460px;
            margin: 0 2px 0 8px;
        }

        .candidate2-notebook-stack::before,
        .candidate2-notebook-stack::after {
            position: absolute;
            z-index: 4;
            width: 36px;
            height: 36px;
            clip-path: polygon(50% 0, 61% 38%, 100% 50%, 61% 62%, 50% 100%, 39% 62%, 0 50%, 39% 38%);
            content: '';
            pointer-events: none;
        }

        .candidate2-notebook-stack::before {
            top: 188px;
            left: -10px;
            background: #d5e6df;
            transform: rotate(8deg) scale(0.78);
        }

        .candidate2-notebook-stack::after {
            top: 20px;
            right: -4px;
            background: #ead8c7;
            transform: rotate(-7deg);
        }

        .candidate2-notebook-underlay {
            display: none;
        }

        .candidate2-demo-relationship-panel {
            position: absolute;
            inset: 30px 10px 0 14px;
            display: block;
            height: auto;
            min-height: 0;
            margin: 0;
            overflow: hidden;
            border: 0.5px solid #e1d5c9;
            border-radius: 1px;
            background-color: #fffaf0;
            background-image: radial-gradient(circle, rgba(168, 149, 139, 0.28) 0 0.7px, transparent 0.85px);
            background-size: 8px 8px;
            box-shadow: 2px 3px 4px rgba(83, 63, 53, 0.08);
            transform: rotate(0.5deg);
        }

        .candidate2-relationship-edit {
            position: absolute;
            right: -16px;
            bottom: 164px;
            z-index: 5;
            min-width: 49px;
            min-height: 27px;
            padding: 4px 9px 5px;
            border: 0.5px solid rgba(166, 142, 129, 0.24);
            color: #60483f;
            background: #ead8c7;
            box-shadow: 1px 2px 2px rgba(83, 63, 53, 0.08);
            font-size: 13px;
            line-height: 1;
            clip-path: polygon(1% 5%, 24% 1%, 51% 4%, 76% 0, 99% 5%, 97% 96%, 72% 99%, 48% 96%, 23% 100%, 2% 95%);
            cursor: pointer;
            transform: rotate(2deg) scale(1.08);
            transform-origin: center;
        }

        .candidate2-relationship-edit[hidden] {
            display: none;
        }

        .candidate2-relationship-editor {
            position: absolute;
            inset: 54px 14px 224px 20px;
            z-index: 4;
            display: grid;
            align-content: start;
            gap: 7px;
            padding: 5px 7px 4px;
            border: 0;
            color: #60483f;
            background: rgba(255, 250, 240, 0.94);
            box-shadow: none;
            transform: none;
        }

        .candidate2-relationship-editor[hidden] {
            display: none;
        }

        .candidate2-relationship-editor-title {
            margin: 0 0 2px;
            color: #a8958b;
            font-size: 8px;
        }

        .candidate2-relationship-editor label {
            display: grid;
            grid-template-columns: 62px 76px minmax(0, 1fr);
            min-height: 31px;
            gap: 7px;
            align-items: center;
            border-bottom: 0.5px solid #eadfd4;
        }

        .candidate2-relationship-editor label strong {
            overflow: hidden;
            font-size: 10px;
            font-weight: 500;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .candidate2-relationship-editor select,
        .candidate2-relationship-editor input {
            min-width: 0;
            padding: 4px 5px;
            border: 0;
            border-bottom: 0.5px solid #d8cbbf;
            border-radius: 0;
            color: #60483f;
            background: transparent;
            font-family: var(--ui-regular-font);
            font-size: 9px;
        }

        .candidate2-relationship-editor input[hidden] {
            display: block;
            visibility: hidden;
        }

        .candidate2-relationship-editor-actions {
            display: flex;
            justify-content: flex-end;
            gap: 14px;
            padding-top: 3px;
        }

        .candidate2-relationship-editor-actions button {
            min-height: 25px;
            padding: 3px 2px;
            border: 0;
            color: #795f56;
            background: transparent;
            font-size: 12px;
            text-decoration: underline;
            text-decoration-color: #b89589;
            text-underline-offset: 3px;
            cursor: pointer;
        }

        .candidate2-notebook-holes {
            display: none;
        }

        .candidate2-demo-relationship {
            position: absolute;
            z-index: 1;
            inset: 54px 12px 224px 22px;
        }

        .profile-relationships-empty {
            position: absolute;
            inset: 54px 12px 224px 22px;
            display: grid;
            place-items: center;
        }

        .candidate2-demo-relation-lines {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            overflow: visible;
            pointer-events: none;
        }

        .candidate2-demo-relation-lines line {
            stroke: rgba(168, 149, 139, 0.58);
            stroke-width: 0.45;
            vector-effect: non-scaling-stroke;
        }

        .candidate2-demo-relation-core,
        .candidate2-demo-relation-node {
            position: absolute;
            z-index: 1;
        }

        .candidate2-demo-relation-core {
            top: 50%;
            left: 50%;
            display: grid;
            gap: 3px;
            justify-items: center;
            color: #60483f;
            font-size: 9px;
            transform: translate(-50%, -50%);
        }

        .candidate2-demo-relation-core::before {
            width: 28px;
            height: 28px;
            border: 0;
            clip-path: polygon(50% 0%, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0% 50%, 39% 39%);
            background: #E6A3AE;
            box-shadow: none;
            content: '';
        }

        .candidate2-demo-relation-node {
            display: grid;
            grid-template-columns: 17px auto;
            grid-template-rows: auto auto;
            width: 82px;
            min-height: 0;
            gap: 1px 6px;
            align-items: center;
            color: #60483f;
            text-align: left;
            transform: translate(-11.5px, -50%);
        }

        .candidate2-demo-relation-node::before {
            grid-row: 1 / span 2;
            width: 17px;
            height: 17px;
            border: 0;
            clip-path: polygon(50% 0%, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0% 50%, 39% 39%);
            box-shadow: none;
            content: '';
        }

        .candidate2-demo-relation-node strong { font-size: 10px; line-height: 1.1; }
        .candidate2-demo-relation-node small { color: #a8958b; font-size: 8px; line-height: 1.1; }
        .candidate2-demo-relation-a { top: 25%; left: 12%; }
        .candidate2-demo-relation-b { top: 27%; left: 67%; }
        .candidate2-demo-relation-c { top: 75%; left: 21%; }
        .candidate2-demo-relation-a::before { background: #82BCD5; }
        .candidate2-demo-relation-b::before { background: #E3B477; }
        .candidate2-demo-relation-c::before { background: #8CC1B1; }

        .candidate2-demo-activity-list {
            position: relative;
            display: grid;
            gap: 0;
            margin-left: 7px;
            padding-left: 0;
        }

        .candidate2-demo-activity {
            position: relative;
            display: grid;
            grid-template-columns: 13px minmax(0, 1fr) auto;
            gap: 7px;
            align-items: center;
            min-height: 36px;
            padding: 5px 0 7px;
            font-size: 11px;
        }

        .candidate2-demo-activity::before {
            content: '♡';
            color: #705b51;
            font-size: 10px;
            line-height: 1;
            text-align: center;
        }

        .candidate2-demo-activity::after {
            position: absolute;
            right: 0;
            bottom: 3px;
            left: 19px;
            content: '';
            border-bottom: 1px dotted rgba(112, 91, 81, 0.34);
            pointer-events: none;
        }

        .candidate2-demo-activity > span:first-child {
            display: none;
        }

        .candidate2-demo-activity > span:nth-child(2) {
            color: #60483f;
            line-height: 1.45;
        }

        .candidate2-demo-activity time {
            color: #a8958b;
            font-size: 9px;
        }

        .candidate2-profile-empty {
            padding: 12px 0 12px 28px;
        }

        .candidate2-profile-more {
            display: block;
            min-width: 56px;
            height: 30px;
            min-height: 0;
            margin: -3px -18px 5px auto;
            padding: 3px 8px 4px;
            border: 0;
            color: #fffaf0;
            background: #7b6760;
            box-shadow: 1px 2px 3px rgba(83, 63, 53, 0.18);
            clip-path: polygon(1% 5%, 24% 1%, 51% 4%, 76% 0, 99% 5%, 97% 96%, 72% 99%, 48% 96%, 23% 100%, 2% 95%);
            font-size: 14px;
            text-decoration: none;
            cursor: pointer;
            transform: rotate(-2deg);
        }

        .candidate2-profile-more[hidden] {
            display: none;
        }

        .candidate2-demo-activity.is-collapsed:nth-child(n + 5) {
            display: none;
        }

        #screen-settings {
            padding: 22px 18px 116px;
            background: #f8f1e9;
        }

        .candidate2-settings-page {
            position: relative;
            padding: 24px 22px 40px;
            border: 0.5px solid #e1d5c9;
            color: #60483f;
            background: #fffdf9;
            box-shadow: 2px 3px 4px rgba(83, 63, 53, 0.08);
        }

        .candidate2-settings-page::before {
            position: absolute;
            top: -1px;
            right: 0;
            left: 0;
            height: 13px;
            background: radial-gradient(circle at 14px 0, #f8f1e9 0 7px, transparent 7.35px) 0 0 / 28px 13px repeat-x;
            content: '';
            pointer-events: none;
        }

        .candidate2-settings-paperclip {
            position: absolute;
            z-index: 2;
            top: -17px;
            right: 19px;
            width: auto;
            height: 64px;
            object-fit: contain;
            filter: drop-shadow(1px 2px 1px rgba(67, 70, 72, 0.18));
            pointer-events: none;
            transform: rotate(30deg) scale(0.86);
        }

        .candidate2-settings-heading {
            padding: 4px 0 22px;
            border-bottom: 1px solid #eadfd4;
        }

        .candidate2-settings-heading h1,
        .candidate2-settings-heading p {
            margin: 0;
        }

        .candidate2-settings-heading h1 {
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 25px;
            font-style: normal;
            font-weight: 600;
        }

        .candidate2-settings-heading > p:last-child {
            margin-top: 5px;
            color: #a8958b;
            font-size: 10px;
        }

        .candidate2-settings-kicker {
            color: #9e776c;
            font-size: 14px;
            line-height: 1;
        }

        .candidate2-settings-section {
            padding: 20px 0;
            border-bottom: 1px solid #eadfd4;
        }

        .candidate2-settings-section-heading {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
        }

        .candidate2-settings-section-heading > div {
            display: flex;
            align-items: baseline;
            gap: 8px;
        }

        .candidate2-settings-section-heading span {
            color: #c5a99a;
            font-family: 'Gaegu', cursive;
            font-size: 12px;
        }

        .candidate2-settings-section-heading h2 {
            margin: 0;
            color: #60483f;
            font-family: var(--ui-regular-font);
            font-size: 15px;
            font-style: normal;
            font-weight: 600;
        }

        .candidate2-settings-section-heading > small,
        .candidate2-settings-section-heading > p {
            margin: 0;
            color: #a8958b;
            font-size: 8px;
        }

        .candidate2-settings-status-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }

        .candidate2-settings-status-grid > div {
            display: grid;
            grid-template-columns: 8px 1fr;
            gap: 2px 6px;
            align-items: center;
            padding: 10px;
            background: #f8f0e7;
        }

        .candidate2-settings-status-grid i {
            grid-row: 1 / span 3;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #c9b9ae;
        }

        .candidate2-settings-status-grid span { font-size: 9px; }
        .candidate2-settings-status-grid strong { font-size: 10px; font-weight: 500; }
        .candidate2-settings-status-grid small { color: #a8958b; font-size: 7px; }

        .candidate2-settings-row,
        .candidate2-settings-toggle {
            display: flex;
            min-height: 42px;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            border-top: 0.5px solid #eee5dc;
        }

        .candidate2-settings-section-heading + .candidate2-settings-row,
        .candidate2-settings-section-heading + .candidate2-settings-toggle {
            border-top: 0;
        }

        .candidate2-settings-row > span,
        .candidate2-settings-toggle > span {
            font-size: 10px;
        }

        .candidate2-settings-row small,
        .candidate2-settings-toggle small {
            display: block;
            margin-top: 2px;
            color: #a8958b;
            font-size: 7px;
        }

        .candidate2-settings-row input,
        .candidate2-settings-row select,
        .candidate2-settings-row textarea {
            width: 45%;
            padding: 5px 3px;
            border: 0;
            border-bottom: 1px solid #d8cbbf;
            border-radius: 0;
            color: #60483f;
            background: transparent;
            font-size: 9px;
            text-align: right;
        }

        .candidate2-settings-row textarea {
            resize: none;
            line-height: 1.45;
            text-align: left;
        }

        .candidate2-settings-row select {
            width: 42%;
            padding: 6px 28px 6px 11px;
            border: 0.5px solid #ddcec0;
            border-radius: 999px;
            appearance: none;
            color: #6f584f;
            background-color: #faf3e9;
            background-image:
                linear-gradient(45deg, transparent 50%, #967d72 50%),
                linear-gradient(135deg, #967d72 50%, transparent 50%);
            background-position:
                calc(100% - 13px) 50%,
                calc(100% - 9px) 50%;
            background-repeat: no-repeat;
            background-size: 4px 4px, 4px 4px;
            box-shadow:
                inset 0 1px 0 rgba(255, 255, 255, 0.7),
                0 1px 1px rgba(112, 84, 70, 0.06);
            text-align: left;
        }

        .candidate2-settings-number {
            display: flex;
            width: 45%;
            align-items: center;
            justify-content: flex-end;
            gap: 5px;
        }

        .candidate2-settings-number input {
            width: min(58px, 72%);
            font-size: 14px;
            font-weight: 500;
            line-height: 1.2;
        }

        .candidate2-settings-number em {
            color: #a8958b;
            font-size: 8px;
            font-style: normal;
        }

        .candidate2-settings-row input:disabled,
        .candidate2-settings-row select:disabled,
        .candidate2-settings-row textarea:disabled,
        .candidate2-settings-add-meme:disabled {
            opacity: 0.62;
        }

        .candidate2-settings-toggle input {
            position: absolute;
            opacity: 0;
            pointer-events: none;
        }

        .candidate2-settings-toggle i {
            position: relative;
            width: 29px;
            height: 16px;
            flex: 0 0 auto;
            border: 1px solid #d8cbbf;
            border-radius: 999px;
            background: #eee5dc;
        }

        .candidate2-settings-toggle i::after {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #fffaf0;
            box-shadow: 0 1px 2px rgba(83, 63, 53, 0.16);
            content: '';
            transition: transform 0.18s ease-out;
        }

        .candidate2-settings-toggle input:checked + i {
            border-color: #cba89d;
            background: #e5c9c3;
        }

        .candidate2-settings-toggle input:checked + i::after {
            transform: translateX(13px);
        }

        .candidate2-settings-meme-summary {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 0 7px;
            align-items: baseline;
        }

        .candidate2-settings-meme-summary strong { font-size: 18px; font-weight: 500; }
        .candidate2-settings-meme-summary span { font-size: 9px; }
        .candidate2-settings-meme-summary small { grid-column: 1 / -1; color: #a8958b; font-size: 8px; }

        .candidate2-settings-text-action,
        .candidate2-settings-add-meme,
        .candidate2-settings-logout {
            border: 0;
            color: #7d6259;
            background: transparent;
            cursor: pointer;
        }

        .candidate2-settings-text-action {
            font-size: 13px;
            text-decoration: underline;
            text-underline-offset: 3px;
        }

        .candidate2-settings-add-meme {
            margin-top: 10px;
            padding: 0;
            font-size: 9px;
        }

        .candidate2-settings-account {
            padding-top: 18px;
            border-bottom: 0;
        }

        .candidate2-settings-logout {
            display: block;
            min-height: 36px;
            margin: 4px auto 0;
            font-size: 15px;
            text-decoration: underline;
            text-decoration-color: rgba(109, 93, 85, 0.28);
            text-underline-offset: 4px;
        }

        .candidate2-settings-delete-account {
            display: block;
            min-height: 30px;
            margin: 2px auto 0;
            padding: 4px 8px;
            border: 0;
            color: #a36f67;
            background: transparent;
            font-size: 9px;
            text-decoration: underline;
            text-decoration-color: rgba(163, 111, 103, 0.35);
            text-underline-offset: 3px;
            cursor: pointer;
        }

        .candidate2-settings-delete-account:disabled {
            opacity: 0.52;
            cursor: default;
        }

        .candidate2-settings-feedback {
            min-height: 14px;
            margin: 2px 0 0;
            color: #a8958b;
            font-size: 8px;
            text-align: center;
        }

`;

const SHARED_MEME_STYLES = `
        .candidate2-shared-memes-page {
            min-height: 100%;
            padding: 22px 20px 92px;
            color: #60483f;
            background: #fffdf9;
        }

        .candidate2-shared-memes-back,
        .candidate2-shared-meme-form-heading button,
        .candidate2-shared-meme-detail > button {
            min-height: 32px;
            padding: 3px 0;
            border: 0;
            color: #806b62;
            background: transparent;
            cursor: pointer;
        }

        .candidate2-shared-memes-heading {
            margin: 12px 0 22px;
        }

        .candidate2-shared-memes-heading h1 {
            margin: 3px 0 5px;
            font-size: 30px;
        }

        .candidate2-shared-memes-heading > p:last-child,
        .shared-memes-status,
        .shared-meme-form-status {
            margin: 0;
            color: #a8958b;
            font-size: 9px;
            line-height: 1.5;
        }

        .candidate2-shared-memes-tools {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: end;
            gap: 14px;
            padding-bottom: 13px;
            border-bottom: 1px solid #e5d9ce;
        }

        .candidate2-shared-memes-tools label,
        .candidate2-shared-meme-form label {
            display: grid;
            gap: 4px;
            color: #9a8074;
            font-size: 8px;
        }

        .candidate2-shared-memes-tools input,
        .candidate2-shared-meme-form input,
        .candidate2-shared-meme-form textarea {
            width: 100%;
            min-height: 36px;
            padding: 7px 2px;
            border: 0;
            border-bottom: 1px solid #d8cbbf;
            border-radius: 0;
            color: #60483f;
            background: transparent;
            font-size: 12px;
        }

        .candidate2-shared-meme-form textarea {
            resize: vertical;
            line-height: 1.5;
        }

        #shared-meme-add-open,
        .candidate2-shared-meme-submit {
            min-height: 38px;
            padding: 8px 14px;
            border: 0;
            color: #fffdf9;
            background: #73584b;
            font: inherit;
            font-size: 10px;
            cursor: pointer;
        }

        .candidate2-shared-meme-form {
            display: grid;
            gap: 12px;
            padding: 18px 0;
            border-bottom: 1px solid #e5d9ce;
        }

        .candidate2-shared-meme-form[hidden],
        .candidate2-shared-meme-detail[hidden] {
            display: none;
        }

        .candidate2-shared-meme-form-heading {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .candidate2-shared-meme-form-heading h2 {
            margin: 0;
            font-size: 18px;
        }

        .candidate2-shared-meme-submit {
            justify-self: start;
        }

        .candidate2-shared-meme-submit:disabled {
            opacity: 0.58;
            cursor: wait;
        }

        .shared-memes-status {
            min-height: 14px;
            margin-top: 12px;
        }

        .candidate2-shared-meme-list {
            margin-top: 5px;
        }

        .candidate2-shared-meme-row {
            display: grid;
            width: 100%;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: baseline;
            gap: 10px;
            min-height: 48px;
            padding: 11px 1px;
            border: 0;
            border-bottom: 0.5px solid #eadfd4;
            color: #60483f;
            background: transparent;
            text-align: left;
            cursor: pointer;
        }

        .candidate2-shared-meme-row strong {
            overflow-wrap: anywhere;
            font-size: 13px;
            font-weight: 500;
        }

        .candidate2-shared-meme-row small {
            color: #a8958b;
            font-size: 8px;
        }

        .candidate2-shared-meme-detail {
            margin-top: 18px;
            padding: 16px 0 4px;
            border-top: 2px solid #d8cbbf;
        }

        .candidate2-shared-meme-detail > button {
            float: right;
        }

        .candidate2-shared-meme-detail h2 {
            margin: 0 0 4px;
            font-size: 22px;
        }

        .candidate2-shared-meme-detail > p {
            margin: 0 0 14px;
            color: #a8958b;
            font-size: 9px;
        }

        .candidate2-shared-meme-detail dl {
            margin: 0;
        }

        .candidate2-shared-meme-detail dl > div {
            display: grid;
            grid-template-columns: 50px minmax(0, 1fr);
            gap: 12px;
            padding: 9px 0;
            border-bottom: 0.5px solid #eadfd4;
        }

        .candidate2-shared-meme-detail dt {
            color: #a8958b;
            font-size: 9px;
        }

        .candidate2-shared-meme-detail dd {
            margin: 0;
            overflow-wrap: anywhere;
            font-size: 11px;
            line-height: 1.55;
            white-space: pre-wrap;
        }

`;

const RESIDENCY_PERMIT_STYLES = `
        .permit-card {
            container-type: inline-size;
            aspect-ratio: 1.075;
            min-height: 0;
            padding: 8.75% 8.17% 7.58%;
            background-size: 3.5cqi 3.5cqi;
        }

        .permit-tape {
            top: -3.8%;
            right: 5.8%;
            width: 17.5%;
            height: auto;
            aspect-ratio: 2.5;
            background: var(--sky-blue);
            transform: rotate(5deg);
        }

        .permit-heading {
            margin: 0 0 8.4cqi;
            color: var(--text-main);
            width: 100%;
            max-width: 100%;
            font-size: 7cqi;
            font-weight: 600;
            letter-spacing: 0;
            line-height: 1.15;
            text-align: center;
        }

        .permit-subheading {
            font-family: var(--ui-regular-font);
            font-size: 3.6cqi;
            font-style: normal;
            font-weight: 500;
            letter-spacing: 0.2em;
        }

        .permit-identity {
            display: grid;
            gap: 5.6cqi;
            text-align: center;
        }

        .permit-field {
            display: grid;
            gap: 1.75cqi;
        }

        .permit-field-label,
        .permit-field-value {
            margin: 0;
        }

        .permit-field-label {
            color: var(--text-sub);
            font-size: 3.8cqi;
            letter-spacing: 0.08em;
            line-height: 1.2;
        }

        .permit-field-value {
            color: var(--text-main);
            font-size: 5.87cqi;
            font-weight: 700;
            line-height: 1.1;
        }

        .permit-motto {
            position: absolute;
            left: 0;
            bottom: 8.8%;
            width: 100%;
            margin: 0;
            color: var(--text-sub);
            font-size: 4.36cqi;
            line-height: 1.15;
            pointer-events: none;
            text-align: center;
            white-space: nowrap;
        }

        #permit-stamp-box {
            right: 1.75%;
            bottom: 5%;
            width: 36.36cqi;
            height: 36.36cqi;
        }

        #permit-stamp-box .stamp {
            width: 30.07cqi;
            height: 30.07cqi;
            border-width: 0.7cqi;
            font-size: 4.9cqi;
            line-height: 1.05;
            transform: rotate(-18deg);
        }

        #permit-stamp-box.animate-stamp {
            animation: permit-stamp-drop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }

        @keyframes permit-stamp-drop {
            0% {
                opacity: 0;
                transform: scale(3) rotate(-35deg);
            }

            100% {
                opacity: 1;
                transform: scale(1) rotate(0deg);
            }
        }

        @media (prefers-reduced-motion: reduce) {
            #permit-stamp-box.animate-stamp {
                animation: none;
                opacity: 1;
                transform: none;
            }
        }
`;

const LINGYE_SCREEN = `
    <div id="screen-lingye" class="screen screen--lingye">
        <section class="candidate2-lingye-viewport" aria-label="铃野地图，可左右滑动查看全部地点" tabindex="0">
            <div class="candidate2-lingye-canvas">
                <img class="candidate2-lingye-map" src="/lingye/map.png" width="1024" height="1536" alt="铃野公共世界地图" draggable="false">
                ${lingyePlaces
                  .filter(([id]) => !hiddenFishingPlaceIds.has(id))
                  .map(
                    ([id, label, left, top, size]) => `
                <button class="candidate2-lingye-place" type="button" aria-label="进入${label}" data-place-id="${id}" data-place-label="${label}" data-left="${left}" data-top="${top}" data-size="${size}" style="left: ${left}%; top: ${top}%; width: ${size}%;" onclick="openLingyePlace('${id}', '${label}')">
                    <img src="/lingye/labels/${id}.png" alt="" draggable="false">
                </button>`,
                  )
                  .join("")}
            </div>
        </section>
        <button class="candidate2-lingye-together" type="button" aria-label="进入铃野共行" onclick="openLingyeTogether()">
            <img src="/lingye/lingye-together-game-icon-v5.png" alt="" width="512" height="512" draggable="false">
        </button>
        <button class="candidate2-lingye-memories" type="button" aria-label="打开纪念册" onclick="openLingyeMemorial()">
            <img src="/lingye/ui/memorial-album.png" alt="" width="256" height="256" draggable="false">
        </button>
    </div>
`;

const LINGYE_INSTITUTION_SCREENS = lingyeInstitutionScenes
  .map(
    ([id, label, backgroundUrl]) => `
    <div id="screen-lingye-institution-${id}" class="screen screen--lingye-place candidate2-institution-scene" data-institution-place="${id}">
        <section class="candidate2-institution-scene-viewport" aria-label="${label}场景，可左右滑动查看" tabindex="0">
            <div class="candidate2-institution-scene-canvas">
                <img class="candidate2-institution-scene-background" src="${backgroundUrl}" width="1024" height="1536" alt="${label}场景背景" draggable="false">
            </div>
        </section>
        <button class="candidate2-place-back-link candidate2-institution-scene-back" type="button" aria-label="返回铃野地图" onclick="showScreen('screen-lingye')">
            <span aria-hidden="true">‹</span>
        </button>
    </div>`,
  )
  .join("");

const LINGYE_PLACE_SCREENS = `
    <div id="screen-lingye-together" class="screen screen--lingye-place candidate2-together-page">
        <div class="candidate2-together-paper">
            <figure class="candidate2-together-cover">
                <img class="candidate2-together-cover-image" alt="" width="1448" height="1086" hidden>
                <button class="candidate2-place-back-link" type="button" aria-label="返回铃野地图" onclick="showScreen('screen-lingye')">
                    <span aria-hidden="true">‹</span>
                </button>
                <button class="candidate2-together-history-button" type="button" aria-label="往期故事" onclick="openTogetherHistory()" disabled>
                    <svg viewBox="0 0 32 32" aria-hidden="true">
                        <path d="M7 7.5A3.5 3.5 0 0 1 10.5 4H25v21H10.5A3.5 3.5 0 0 0 7 28.5z"></path>
                        <path d="M7 7.5A3.5 3.5 0 0 1 10.5 11H25M12 16h8M12 20h6"></path>
                    </svg>
                    <span class="candidate2-place-visually-hidden">往期故事</span>
                </button>
            </figure>

            <section class="candidate2-together-section candidate2-together-current" aria-labelledby="candidate2-together-current-title">
                <p class="candidate2-together-live-empty">进入后读取当前铃野共行状态。</p>
                <div class="candidate2-together-current-content" hidden>
                    <div class="candidate2-place-section-heading">
                        <div>
                            <span class="candidate2-together-current-kicker"></span>
                            <h2 id="candidate2-together-current-title"></h2>
                        </div>
                        <span class="candidate2-place-status-chip candidate2-together-current-status"></span>
                    </div>
                    <div class="candidate2-together-stage-rail" aria-label="故事阶段"></div>
                    <p class="candidate2-together-stage-name"></p>
                    <p class="candidate2-place-body-copy candidate2-together-current-copy"></p>
                </div>
            </section>

            <section class="candidate2-together-section" aria-labelledby="candidate2-together-task-title">
                <div class="candidate2-place-section-heading">
                    <div>
                        <span class="candidate2-together-task-kicker"></span>
                        <h2 id="candidate2-together-task-title"></h2>
                    </div>
                </div>
                <div class="candidate2-together-task-list"></div>
            </section>

            <section class="candidate2-together-section candidate2-together-choice" aria-labelledby="candidate2-together-choice-title">
                <div class="candidate2-place-section-heading">
                    <div>
                        <span class="candidate2-together-choice-kicker"></span>
                        <h2 id="candidate2-together-choice-title"></h2>
                    </div>
                </div>
                <p class="candidate2-place-body-copy candidate2-together-choice-copy"></p>
                <div class="candidate2-together-choice-list" aria-label="公共选择"></div>
            </section>

            <section id="candidate2-together-rules" class="candidate2-together-rules" aria-label="铃野共行说明">
                <strong class="candidate2-together-rules-title"></strong>
                <p class="candidate2-together-rules-copy"></p>
            </section>
        </div>
    </div>

    <div id="screen-lingye-together-history" class="screen screen--lingye-place candidate2-together-history-page">
        <header class="candidate2-together-history-header">
            <button class="candidate2-together-history-back" type="button" aria-label="返回当前铃野共行" onclick="showScreen('screen-lingye-together')">
                <span aria-hidden="true">‹</span>
            </button>
            <span>往期故事</span>
        </header>
        <main class="candidate2-together-archive-directory" aria-label="铃野共行往期目录"></main>
        <p class="candidate2-together-archive-empty" hidden>还没有已完成的往期故事。</p>
        <section class="candidate2-together-archive-reader" aria-label="往期故事回顾" hidden>
            <header class="candidate2-together-archive-reader-header">
                <button type="button" aria-label="返回往期目录" onclick="closeTogetherArchive()"><span aria-hidden="true">‹</span></button>
                <div>
                    <p class="candidate2-together-archive-reader-round"></p>
                    <h1 class="candidate2-together-archive-reader-title"></h1>
                </div>
            </header>
            <article class="candidate2-together-archive-page">
                <figure class="candidate2-together-archive-photo"><img alt="" /></figure>
                <h2 class="candidate2-together-archive-entry-title"></h2>
                <p class="candidate2-together-archive-entry-text"></p>
            </article>
            <nav class="candidate2-together-archive-pagination" aria-label="故事翻页">
                <button type="button" aria-label="上一页" onclick="turnTogetherArchivePage(-1)"><span aria-hidden="true">‹</span></button>
                <span class="candidate2-together-archive-page-number"></span>
                <button type="button" aria-label="下一页" onclick="turnTogetherArchivePage(1)"><span aria-hidden="true">›</span></button>
            </nav>
        </section>
    </div>

    <div id="screen-lingye-memorial" class="screen screen--lingye-place candidate2-memorial-page">
        <div class="candidate2-memorial-paper" data-memorial-editor-canvas>
            <section class="candidate2-memorial-index">
                <header class="candidate2-memorial-header">
                    <button class="candidate2-memorial-back" type="button" aria-label="返回铃野地图" onclick="showScreen('screen-lingye')">
                        <span aria-hidden="true">←</span>
                    </button>
                    <div class="candidate2-memorial-title-lockup" role="img" aria-label="Album，纪念册，往期活动回顾" data-memorial-editor-id="title-lockup" data-memorial-editor-name="顶部标题组">
                        <img src="/lingye/memorial/memorial-title-lockup-v1.png" alt="" />
                    </div>
                </header>
                <div class="candidate2-memorial-ledger" data-memorial-editor-id="paper" data-memorial-editor-name="主体纸页" data-memorial-editor-fill>
                    <div class="candidate2-memorial-demo-chrome" hidden>
                        <div class="candidate2-memorial-tabs" role="group" aria-label="活动分类">
                            <button class="is-active" type="button" aria-pressed="true" data-memorial-filter="all" onclick="setLingyeMemorialFilter('all')" data-memorial-editor-id="tab-all" data-memorial-editor-name="全部方签" data-memorial-editor-text data-memorial-editor-fill>全部</button>
                            <button type="button" aria-pressed="false" data-memorial-filter="festival" onclick="setLingyeMemorialFilter('festival')" data-memorial-editor-id="tab-festival" data-memorial-editor-name="节日方签" data-memorial-editor-text data-memorial-editor-fill>节日</button>
                        </div>
                    </div>
                    <main class="candidate2-memorial-list" aria-label="限时活动纪念">
                        <p class="candidate2-memorial-empty">还没有可查看的活动档案。</p>
                        <button class="candidate2-memorial-demo" type="button" aria-label="查看 2026 年七夕活动灯河有信" onclick="openLingyeMemorialEntry()" data-memorial-category="festival" data-memorial-editor-id="event-card" data-memorial-editor-name="活动票券" data-memorial-editor-fill hidden>
                            <span class="candidate2-memorial-index-number" data-memorial-editor-id="event-number" data-memorial-editor-name="期号"><strong>01</strong><small>2026</small></span>
                            <span class="candidate2-memorial-index-copy">
                                <small>节日活动</small>
                                <strong data-memorial-editor-id="event-title" data-memorial-editor-name="活动标题" data-memorial-editor-text>七夕活动</strong>
                                <span data-memorial-editor-id="event-theme" data-memorial-editor-name="活动主题" data-memorial-editor-text>灯河有信</span>
                                <time datetime="2026-08-19" data-memorial-editor-id="event-date" data-memorial-editor-name="活动日期" data-memorial-editor-text>2026.08.19—08.21</time>
                            </span>
                            <span class="candidate2-memorial-index-banner" data-memorial-editor-id="event-image" data-memorial-editor-name="活动图片">
                                <img src="/lingye/memorial/qixi-2026-lantern-night.jpg" alt="" width="506" height="899" draggable="false">
                                <span class="candidate2-memorial-index-action">查看回忆 <span aria-hidden="true">›</span></span>
                            </span>
                        </button>
                    </main>
                </div>
            </section>
            <article class="candidate2-memorial-entry-view candidate2-memorial-entry-view--qixi" aria-label="2026 年七夕活动灯河有信" hidden>
                <span class="candidate2-memorial-binding" aria-hidden="true"></span>
                <button class="candidate2-memorial-entry-back" type="button" aria-label="返回纪念册目录" onclick="closeLingyeMemorialEntry()">
                    <span aria-hidden="true">←</span>
                </button>
                <img class="candidate2-memorial-entry-qixi-stickers" src="/lingye/memorial/qixi-stickers-v1.png" alt="" aria-hidden="true" draggable="false" data-memorial-entry-editor-id="entry-stickers" data-memorial-editor-name="七夕装饰贴纸" data-memorial-editor-asset="stickers" data-memorial-editor-removable>
                <header class="candidate2-memorial-entry-heading">
                    <div>
                        <span data-memorial-entry-editor-id="entry-event-label" data-memorial-editor-name="年份与节日" data-memorial-editor-asset="event-label" data-memorial-editor-removable data-memorial-editor-text>2026 · 七夕</span>
                        <div class="candidate2-memorial-entry-title-art" role="img" aria-label="灯河有信。灯河相逢 · 愿思念抵达归处" data-memorial-entry-editor-id="entry-title" data-memorial-editor-name="七夕标题字组" data-memorial-editor-asset="title" data-memorial-editor-removable>
                            <img src="/lingye/memorial/qixi-title-lockup-v1.png" alt="" draggable="false">
                        </div>
                    </div>
                    <time datetime="2026-08-19/2026-08-21" data-memorial-entry-editor-id="entry-date" data-memorial-editor-name="活动日期" data-memorial-editor-asset="date" data-memorial-editor-removable><span>2026.08.19</span><i aria-hidden="true"></i><span>2026.08.21</span></time>
                </header>
                <div class="candidate2-memorial-entry-collage">
                    <figure class="candidate2-memorial-entry-hero-photo" data-memorial-entry-editor-id="entry-hero" data-memorial-editor-name="七夕主照片" data-memorial-editor-asset="hero" data-memorial-editor-removable>
                        <span class="candidate2-memorial-entry-tape" aria-hidden="true"></span>
                        <img src="/lingye/memorial/qixi-2026-lantern-night.jpg" alt="灯河有信活动夜河灯景" width="506" height="899" draggable="false">
                    </figure>
                    <aside class="candidate2-memorial-entry-note" data-memorial-entry-editor-id="entry-note" data-memorial-editor-name="七夕主题便笺" data-memorial-editor-asset="note" data-memorial-editor-removable>
                        <p>愿今夜所有思念，<br>都能顺水抵达归处。</p>
                    </aside>
                    <figure class="candidate2-memorial-entry-secondary-photo" data-memorial-entry-editor-id="entry-secondary" data-memorial-editor-name="七夕副照片" data-memorial-editor-asset="secondary" data-memorial-editor-removable>
                        <img src="/lingye/memorial/qixi-2026-objects-return-bg-v3.jpg" alt="七夕灯河归还旧物场景" width="506" height="900" draggable="false">
                    </figure>
                </div>
                <div class="candidate2-memorial-entry-archive-templates" hidden>
                    <div class="candidate2-qixi-archive-lantern" role="img" aria-label="我的七夕成品灯" data-qixi-memorial-side="human" data-memorial-editor-name="我的灯" data-memorial-editor-asset="my-lantern" data-memorial-editor-asset-template>
                        <span class="candidate2-qixi-archive-lantern-art" aria-hidden="true">
                            <span class="candidate2-qixi-archive-lantern-base" data-qixi-lantern-base style="left:-28px;top:-6px;width:180px;height:135px;--lamp-x:0%;--lamp-y:0%"></span>
                            <span class="candidate2-qixi-archive-lantern-layer" data-qixi-lantern-pattern style="left:67px;top:47px;width:64px;height:64px;background-position:100% 33.333%"></span>
                            <span class="candidate2-qixi-archive-lantern-layer candidate2-qixi-archive-lantern-ornament" data-qixi-lantern-ornament style="left:61px;top:119px;width:68px;height:68px;background-position:50% 100%"></span>
                            <span class="candidate2-qixi-archive-lantern-layer" data-qixi-lantern-seal style="left:71px;top:15px;width:51px;height:51px;background-position:0% 66.667%"></span>
                        </span>
                    </div>
                    <div class="candidate2-qixi-archive-lantern" role="img" aria-label="渡的七夕成品灯" data-qixi-memorial-side="ai" data-memorial-editor-name="渡的灯" data-memorial-editor-asset="du-lantern" data-memorial-editor-asset-template>
                        <span class="candidate2-qixi-archive-lantern-art" aria-hidden="true">
                            <span class="candidate2-qixi-archive-lantern-base" data-qixi-lantern-base style="left:42px;top:-5px;width:180px;height:135px;--lamp-x:100%;--lamp-y:0%"></span>
                            <span class="candidate2-qixi-archive-lantern-layer" data-qixi-lantern-pattern style="left:66px;top:53px;width:64px;height:64px;background-position:0% 100%"></span>
                            <span class="candidate2-qixi-archive-lantern-layer candidate2-qixi-archive-lantern-ornament" data-qixi-lantern-ornament style="left:59px;top:118px;width:68px;height:68px;background-position:50% 0%"></span>
                            <span class="candidate2-qixi-archive-lantern-layer" data-qixi-lantern-seal style="left:71px;top:16px;width:51px;height:51px;background-position:50% 66.667%"></span>
                        </span>
                    </div>
                    <article class="candidate2-qixi-archive-letter" aria-label="我的七夕信件" data-qixi-memorial-side="human" data-memorial-editor-name="我的信" data-memorial-editor-asset="my-letter" data-memorial-editor-asset-template>
                        <p contenteditable="plaintext-only" spellcheck="false" data-qixi-archive-letter-text></p>
                        <span class="candidate2-qixi-archive-letter-signature">辛玥</span>
                    </article>
                    <article class="candidate2-qixi-archive-letter" aria-label="渡的七夕信件" data-qixi-memorial-side="ai" data-memorial-editor-name="渡的信" data-memorial-editor-asset="du-letter" data-memorial-editor-asset-template>
                        <p contenteditable="plaintext-only" spellcheck="false" data-qixi-archive-letter-text></p>
                        <span class="candidate2-qixi-archive-letter-signature">渡</span>
                    </article>
                    <span class="candidate2-qixi-archive-qiaoqiao" role="img" aria-label="七夕角色翘翘" data-memorial-editor-name="翘翘" data-memorial-editor-asset="qiaoqiao" data-memorial-editor-asset-template></span>
                </div>
            </article>
            <div class="candidate2-memorial-editor-selection" aria-hidden="true" hidden>
                <button type="button" data-memorial-editor-handle="rotate" aria-label="旋转选中元素"></button>
                <button type="button" data-memorial-editor-handle="scale" aria-label="缩放选中元素"></button>
            </div>
        </div>
        <aside class="candidate2-memorial-editor" aria-label="纪念册一次性排版编辑器" hidden>
            <header>
                <strong>纪念册自由编辑</strong>
                <span><button type="button" data-memorial-editor-command="toggle">收起</button><span class="candidate2-memorial-editor-current">未选中</span></span>
            </header>
            <div class="candidate2-memorial-editor-assets" aria-label="七夕素材库" hidden>
                <button type="button" data-memorial-add-asset="my-lantern">＋我的灯</button>
                <button type="button" data-memorial-add-asset="du-lantern">＋渡的灯</button>
                <button type="button" data-memorial-add-asset="my-letter">＋我的信</button>
                <button type="button" data-memorial-add-asset="du-letter">＋渡的信</button>
                <button type="button" data-memorial-add-asset="qiaoqiao">＋翘翘</button>
                <button type="button" data-memorial-add-asset="title">＋标题字组</button>
                <button type="button" data-memorial-add-asset="stickers">＋装饰贴纸</button>
                <button type="button" data-memorial-add-asset="hero">＋主照片</button>
                <button type="button" data-memorial-add-asset="secondary">＋副照片</button>
                <button type="button" data-memorial-add-asset="note">＋主题便笺</button>
                <button type="button" data-memorial-add-asset="event-label">＋年份节日</button>
                <button type="button" data-memorial-add-asset="date">＋活动日期</button>
            </div>
            <label class="candidate2-memorial-editor-text-control">文字<input type="text" class="candidate2-memorial-editor-text-input" disabled></label>
            <div class="candidate2-memorial-editor-row">
                <label>填充<input type="color" class="candidate2-memorial-editor-color" value="#f7f2fa" disabled></label>
                <button type="button" data-memorial-editor-command="eyedropper">吸色</button>
                <button type="button" data-memorial-editor-command="backward">下移一层</button>
                <button type="button" data-memorial-editor-command="forward">上移一层</button>
            </div>
            <div class="candidate2-memorial-editor-row candidate2-memorial-editor-shapes">
                <button type="button" data-memorial-add-shape="square">＋方形</button>
                <button type="button" data-memorial-add-shape="circle">＋圆形</button>
                <button type="button" data-memorial-add-shape="rounded">＋圆角</button>
                <button type="button" data-memorial-add-shape="frame">＋图片框</button>
            </div>
            <div class="candidate2-memorial-editor-row">
                <button type="button" data-memorial-editor-command="duplicate">复制元素</button>
                <button type="button" data-memorial-editor-command="delete">删除</button>
                <button type="button" data-memorial-editor-command="copy">复制布局</button>
            </div>
            <p class="candidate2-memorial-editor-status">点选元素后直接拖动；上方圆点旋转，右下角缩放。</p>
        </aside>
    </div>

    <div id="screen-lingye-glimmer" class="screen screen--lingye-place candidate2-glimmer-page">
        <div class="candidate2-glimmer-backdrop" aria-hidden="true"></div>
        <div class="candidate2-glimmer-hero">
            <h1 class="candidate2-place-visually-hidden">流光原野</h1>
            <button class="candidate2-glimmer-back-button" type="button" aria-label="返回铃野地图" onclick="showScreen('screen-lingye')">
                <span aria-hidden="true">‹</span>
            </button>
            <details class="candidate2-glimmer-library">
                <summary aria-label="打开原野资料">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h10.5A2.5 2.5 0 0 1 18 7v12.5H7.5A2.5 2.5 0 0 1 5 17z"></path><path d="M8.5 8h6M8.5 11h6M8.5 14h4"></path></svg>
                    <span class="candidate2-place-visually-hidden">原野资料</span>
                </summary>
                <div class="candidate2-glimmer-library-panel">
                    <details open>
                        <summary>异色动物图鉴</summary>
                        <p class="candidate2-glimmer-variants-empty"><strong>还没有收录异色动物</strong>实际收录的异色外观会展示在这里。</p>
                        <div class="candidate2-glimmer-variants-demo" hidden></div>
                    </details>
                    <details>
                        <summary>奇遇图鉴</summary>
                        <p class="candidate2-glimmer-encounters-empty"><strong>还没有遇见原野奇遇</strong>实际遇见的奇遇会记录在这里。</p>
                        <ul class="candidate2-glimmer-encounters-demo" hidden></ul>
                    </details>
                    <details>
                        <summary>流光原野成就</summary>
                        <p class="candidate2-glimmer-achievements-empty"><strong>还没有成就进度</strong>实际成就与进度会展示在这里。</p>
                        <div class="candidate2-glimmer-achievements-demo" hidden></div>
                    </details>
                </div>
            </details>
            <section class="candidate2-glimmer-status-overlay" aria-labelledby="candidate2-glimmer-status-title">
                <h2 id="candidate2-glimmer-status-title">原野状态</h2>
                <div class="candidate2-glimmer-status-grid">
                    <div><span>开放</span><strong class="candidate2-glimmer-opening-value">—</strong></div>
                    <div><span>状态</span><strong class="candidate2-glimmer-status-value">—</strong></div>
                    <div><span>踪迹</span><strong class="candidate2-glimmer-trace-value">—</strong></div>
                </div>
            </section>
        </div>

        <main class="candidate2-glimmer-journal">
            <section class="candidate2-glimmer-journal-feature" aria-labelledby="candidate2-glimmer-coop-title">
                <h2 id="candidate2-glimmer-coop-title">今日协作任务</h2>
                <div class="candidate2-glimmer-feature-empty candidate2-glimmer-live-empty">
                    <span aria-hidden="true">✦</span>
                    <div><strong class="candidate2-glimmer-feature-empty-title">进入后读取当前协作</strong><p class="candidate2-glimmer-feature-empty-copy">进入后读取真实的全服协作任务。</p></div>
                </div>
                <div class="candidate2-glimmer-feature-demo" hidden>
                    <div>
                        <strong class="candidate2-glimmer-task-title"></strong>
                        <p class="candidate2-glimmer-task-detail"></p>
                    </div>
                    <div class="candidate2-glimmer-progress">
                        <div><span>协作进度</span><strong class="candidate2-glimmer-task-progress"></strong></div>
                        <div class="candidate2-glimmer-progress-track" aria-hidden="true"><i></i></div>
                    </div>
                </div>
            </section>

            <div class="candidate2-glimmer-journal-stream">
                <section aria-labelledby="candidate2-glimmer-tracks-title">
                    <h2 id="candidate2-glimmer-tracks-title">今日动物踪迹</h2>
                    <p class="candidate2-glimmer-tracks-empty"><strong>还没有发现动物踪迹</strong>实际出现的异色动物会展示在这里。</p>
                    <div class="candidate2-glimmer-tracks-demo" hidden></div>
                </section>
                <section aria-labelledby="candidate2-glimmer-events-title">
                    <h2 id="candidate2-glimmer-events-title">公共事件</h2>
                    <p class="candidate2-glimmer-events-empty"><strong>还没有公共事件</strong>原野实际发生的公开事件会按时间出现。</p>
                    <ol class="candidate2-glimmer-events-demo" hidden></ol>
                </section>
                <section aria-labelledby="candidate2-glimmer-summary-title">
                    <h2 id="candidate2-glimmer-summary-title">我家的原野概况</h2>
                    <p class="candidate2-glimmer-summary-empty"><strong>还没有原野记录</strong>自家实际探索记录会汇总在这里。</p>
                    <dl class="candidate2-glimmer-summary-demo" hidden>
                        <div><dt>奇遇</dt><dd class="candidate2-glimmer-summary-encounters"></dd></div>
                        <div><dt>异色</dt><dd class="candidate2-glimmer-summary-variants"></dd></div>
                        <div><dt>协作</dt><dd class="candidate2-glimmer-summary-coops"></dd></div>
                    </dl>
                </section>
            </div>
        </main>
    </div>
`;

const LINGYE_NAV_ITEM = `
        <div class="nav-item" role="button" tabindex="0" aria-label="铃野" onclick="showScreen('screen-lingye')" onkeydown="if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); showScreen('screen-lingye'); }">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path></svg>
        </div>`;

const LINGYE_STYLES = `
        .screen.screen--lingye {
            padding: 0;
            overflow: hidden;
            background: #d7e9d0;
        }

        .candidate2-lingye-viewport {
            width: 100%;
            height: 100%;
            overflow-x: auto;
            overflow-y: hidden;
            overscroll-behavior-x: contain;
            scrollbar-width: thin;
            touch-action: pan-x;
            cursor: grab;
        }

        .candidate2-lingye-viewport.is-dragging {
            cursor: grabbing;
            user-select: none;
        }

        .candidate2-lingye-viewport:focus-visible {
            outline: 3px solid rgba(109, 93, 85, 0.55);
            outline-offset: -3px;
        }

        .candidate2-lingye-canvas {
            position: relative;
            width: auto;
            height: 100%;
            aspect-ratio: 2 / 3;
        }

        .candidate2-lingye-map {
            display: block;
            width: auto;
            max-width: none;
            height: 100%;
            user-select: none;
            -webkit-user-drag: none;
        }

        .candidate2-lingye-place {
            position: absolute;
            z-index: 5;
            width: clamp(82px, 25vw, 122px);
            min-height: 44px;
            padding: 0;
            border: 0;
            background: transparent;
            cursor: pointer;
            transform: translate(-50%, -50%);
        }

        .candidate2-lingye-place img {
            display: block;
            width: 100%;
            height: auto;
            pointer-events: none;
            user-select: none;
            -webkit-user-drag: none;
        }

        .candidate2-lingye-together {
            position: absolute;
            z-index: 30;
            top: 14px;
            right: 14px;
            width: clamp(46px, 12vw, 54px);
            aspect-ratio: 1;
            min-height: 44px;
            padding: 0;
            border: 0;
            background: transparent;
            cursor: pointer;
        }

        .candidate2-lingye-together img {
            display: block;
            width: 100%;
            height: 100%;
            filter: drop-shadow(1px 0 0 rgba(255, 255, 255, 0.96))
                drop-shadow(-1px 0 0 rgba(255, 255, 255, 0.96))
                drop-shadow(0 1px 0 rgba(255, 255, 255, 0.96))
                drop-shadow(0 -1px 0 rgba(255, 255, 255, 0.96));
            object-fit: contain;
            pointer-events: none;
            user-select: none;
            -webkit-user-drag: none;
        }

        .candidate2-lingye-memories {
            position: absolute;
            z-index: 30;
            top: 86px;
            right: 12px;
            width: clamp(52px, 14vw, 60px);
            aspect-ratio: 1;
            padding: 0;
            border: 0;
            background: transparent;
            cursor: pointer;
            touch-action: manipulation;
        }

        .candidate2-lingye-memories img {
            display: block;
            width: 100%;
            height: 100%;
            filter: drop-shadow(0 3px 5px rgba(64, 53, 38, 0.42));
            object-fit: contain;
            pointer-events: none;
            user-select: none;
            -webkit-user-drag: none;
        }

        .candidate2-lingye-memories:focus-visible {
            outline: 3px solid rgba(255, 248, 222, 0.92);
            outline-offset: 2px;
            border-radius: 18px;
        }

        .screen.screen--lingye-place {
            padding: 0 0 112px;
            color: #51483f;
            overscroll-behavior-y: contain;
            scrollbar-width: thin;
        }

        .screen.candidate2-institution-scene {
            padding: 0;
            overflow: hidden;
            background: #f6f0df;
        }

        .candidate2-institution-scene-viewport {
            width: 100%;
            height: 100%;
            overflow-x: auto;
            overflow-y: hidden;
            overscroll-behavior-x: contain;
            scrollbar-width: thin;
            touch-action: pan-x;
            cursor: grab;
            background: #f6f0df;
        }

        .candidate2-institution-scene-viewport.is-dragging {
            cursor: grabbing;
            user-select: none;
        }

        .candidate2-institution-scene-viewport:focus-visible {
            outline: 3px solid rgba(109, 93, 85, 0.55);
            outline-offset: -3px;
        }

        .candidate2-institution-scene-canvas {
            position: relative;
            width: auto;
            height: 100%;
            aspect-ratio: 2 / 3;
        }

        .candidate2-institution-scene-background {
            display: block;
            width: auto;
            max-width: none;
            height: 100%;
            pointer-events: none;
            user-select: none;
            -webkit-user-drag: none;
        }

        .candidate2-institution-scene .candidate2-institution-scene-back {
            z-index: 3;
            top: 14px;
            left: 16px;
            min-width: 44px;
            min-height: 44px;
            justify-content: center;
        }

        .screen--lingye-place h1,
        .screen--lingye-place h2 {
            color: inherit;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-style: normal;
        }

        .candidate2-place-header {
            position: relative;
            z-index: 4;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
        }

        .candidate2-place-brand,
        .candidate2-place-world {
            margin: 0;
        }

        .candidate2-place-brand {
            font-family: Georgia, serif;
            font-size: 13px;
            letter-spacing: 0.04em;
        }

        .candidate2-place-world {
            margin-top: 2px;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: 22px;
            font-weight: 800;
            letter-spacing: 0.08em;
        }

        .candidate2-place-header-actions {
            display: flex;
            gap: 8px;
        }

        .candidate2-place-round-action {
            display: inline-flex;
            width: 52px;
            min-height: 52px;
            padding: 6px 4px 5px;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1px;
            border: 1px solid rgba(119, 101, 74, 0.22);
            border-radius: 50%;
            color: #55483d;
            background: rgba(255, 249, 233, 0.92);
            box-shadow: 0 7px 18px rgba(81, 67, 45, 0.12);
            cursor: pointer;
        }

        .candidate2-place-round-action svg {
            width: 20px;
            height: 20px;
            fill: none;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.6;
        }

        .candidate2-place-round-action span {
            font-size: 9px;
            font-weight: 700;
        }

        .candidate2-place-round-action:active {
            transform: translateY(1px);
        }

        .candidate2-place-round-action:focus-visible,
        .candidate2-place-back-link:focus-visible {
            outline: 3px solid rgba(120, 137, 69, 0.5);
            outline-offset: 2px;
        }

        .candidate2-place-card {
            position: relative;
            border: 1px solid rgba(136, 118, 83, 0.18);
            border-radius: 18px;
            background:
                radial-gradient(circle at 8% 12%, rgba(126, 105, 67, 0.035) 0 0.7px, transparent 0.9px),
                radial-gradient(circle at 76% 42%, rgba(126, 105, 67, 0.028) 0 0.65px, transparent 0.85px),
                rgba(255, 251, 239, 0.94);
            background-size: 15px 17px, 19px 21px, auto;
            box-shadow: 0 9px 24px rgba(68, 55, 37, 0.09);
        }

        .candidate2-place-visually-hidden {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            overflow: hidden;
            clip: rect(0 0 0 0);
            clip-path: inset(50%);
            border: 0;
            white-space: nowrap;
        }

        .candidate2-place-section-heading {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
        }

        .candidate2-place-section-heading span {
            color: #8b7a69;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.06em;
        }

        .candidate2-place-section-heading h2 {
            margin: 3px 0 0;
            font-size: 18px;
            line-height: 1.35;
        }

        .candidate2-place-body-copy {
            margin: 12px 0 0;
            color: #76685c;
            font-size: 12px;
            line-height: 1.75;
        }

        .candidate2-place-status-chip {
            flex: 0 0 auto;
            padding: 5px 10px;
            border-radius: 999px;
            color: #716345 !important;
            background: #ece5c6;
            letter-spacing: 0 !important;
        }

        .candidate2-together-page {
            --candidate2-together-page-bg: #f6f1df;
            background: var(--candidate2-together-page-bg);
        }

        .candidate2-memorial-page {
            position: relative;
            padding: 0 !important;
            color: #51485b;
            background: #ebe9f1;
        }

        .candidate2-memorial-paper {
            position: relative;
            min-height: 100%;
            padding: 16px 20px 126px;
            background: #39284f url('/lingye/memorial/memorial-album-backdrop-v1.jpg') center top / cover no-repeat;
        }

        .candidate2-memorial-index {
            position: relative;
            isolation: isolate;
        }

        .candidate2-memorial-index[hidden],
        .candidate2-memorial-entry-view[hidden] {
            display: none;
        }

        .candidate2-memorial-header {
            position: relative;
            min-height: 148px;
            padding: 0 22px 14px;
            text-align: center;
        }

        .candidate2-memorial-back {
            position: absolute;
            top: 2px;
            left: 0;
            z-index: 20;
            display: inline-grid;
            width: 40px;
            min-height: 40px;
            padding: 0;
            place-items: center;
            border: 0;
            color: #fff;
            background: transparent;
            font: inherit;
            cursor: pointer;
        }

        .candidate2-memorial-back::before {
            position: absolute;
            width: 18px;
            height: 18px;
            border: 1px solid rgba(236, 222, 247, 0.54);
            background: linear-gradient(135deg, rgba(132, 104, 158, 0.6), rgba(49, 29, 75, 0.7));
            box-shadow:
                0 0 0 2px rgba(130, 101, 157, 0.12),
                0 3px 7px rgba(20, 10, 35, 0.28),
                0 0 0 2px rgba(255, 255, 255, 0.08) inset;
            content: '';
            transform: rotate(45deg);
        }

        .candidate2-memorial-back span {
            position: relative;
            z-index: 1;
            display: block;
            width: 11px;
            height: 1.25px;
            border-radius: 999px;
            background: currentColor;
            font-size: 0;
            transform: translateX(1px);
        }

        .candidate2-memorial-back span::before {
            position: absolute;
            top: 50%;
            left: 0;
            width: 5px;
            height: 5px;
            border-bottom: 1.25px solid currentColor;
            border-left: 1.25px solid currentColor;
            content: '';
            transform: translateY(-50%) rotate(45deg);
        }

        .candidate2-memorial-back:focus-visible {
            outline: 3px solid rgba(120, 137, 69, 0.5);
            outline-offset: 2px;
        }

        .candidate2-memorial-title-lockup {
            position: absolute;
            top: 2px;
            left: calc(50% - 28px);
            z-index: 10;
            width: 128px;
            pointer-events: none;
            transform: translateX(-50%);
        }

        .candidate2-memorial-title-lockup img {
            display: block;
            width: 100%;
            height: auto;
            filter: drop-shadow(0 3px 8px rgba(25, 12, 40, 0.42));
        }

        .candidate2-memorial-ledger {
            position: relative;
            z-index: 2;
            isolation: isolate;
            min-height: 390px;
            margin: -9px 4px 0 9px;
            padding: 45px 13px 48px 14px;
            transform: rotate(-0.18deg);
        }

        .candidate2-memorial-ledger::before {
            position: absolute;
            inset: 0;
            z-index: 1;
            border: 1px solid rgba(145, 122, 162, 0.24);
            background:
                linear-gradient(90deg, rgba(173, 148, 190, 0.08), transparent 10%, transparent 90%, rgba(173, 148, 190, 0.08)),
                var(--memorial-paper-fill, rgba(248, 245, 250, 0.96));
            box-shadow:
                0 1px 0 rgba(255, 255, 255, 0.92) inset,
                0 8px 18px rgba(26, 15, 43, 0.22);
            content: '';
            pointer-events: none;
        }

        .candidate2-memorial-demo-chrome[hidden] {
            display: none;
        }

        .candidate2-memorial-tabs {
            position: absolute;
            top: -42px;
            left: 16px;
            z-index: 0;
            display: flex;
            margin: 0;
            align-items: flex-start;
            gap: 6px;
        }

        .candidate2-memorial-tabs button {
            appearance: none;
            display: inline-flex;
            width: 49px;
            min-height: 49px;
            padding: 5px 8px 9px;
            align-items: flex-start;
            justify-content: center;
            border: 0;
            color: #6d557e;
            background: rgba(115, 86, 137, 0.88);
            box-shadow: 1px 4px 7px rgba(49, 31, 68, 0.2);
            font-family: 'Songti SC', STSong, serif;
            font-size: 10px;
            font-weight: 700;
            line-height: 1.1;
            letter-spacing: 0.08em;
            white-space: nowrap;
            cursor: pointer;
        }

        .candidate2-memorial-tabs button:last-child {
            background: rgba(231, 224, 237, 0.94);
        }

        .candidate2-memorial-tabs button.is-active {
            color: #553c68;
            box-shadow:
                0 0 0 1px rgba(91, 62, 110, 0.26) inset,
                1px 4px 7px rgba(49, 31, 68, 0.2);
        }

        .candidate2-memorial-list {
            position: relative;
            z-index: 2;
            display: grid;
            gap: 13px;
            padding: 3px 0 38px;
        }

        .candidate2-memorial-empty,
        .candidate2-memorial-demo {
            margin: 0;
            padding: 19px 2px;
            border: 0;
            color: inherit;
            background: transparent;
            font: inherit;
        }

        .candidate2-memorial-empty {
            color: #808881;
            font-size: 11px;
        }

        .candidate2-memorial-demo[hidden] {
            display: none;
        }

        .candidate2-memorial-demo {
            position: relative;
            display: grid;
            width: 116%;
            min-height: 134px;
            padding: 12px 12px;
            grid-template-columns: 45px minmax(0, 1fr) 118px;
            align-items: center;
            gap: 11px;
            overflow: visible;
            border: 1px solid rgba(141, 119, 158, 0.17);
            background: rgba(253, 252, 254, 0.9);
            box-shadow:
                0 1px 0 rgba(255, 255, 255, 0.95) inset,
                2px 5px 10px rgba(81, 65, 102, 0.12);
            clip-path: polygon(0.8% 3%, 99.2% 0, 100% 97%, 1.4% 100%, 0 72%);
            text-align: left;
            cursor: pointer;
            transform: rotate(-0.2deg);
        }

        .candidate2-memorial-demo:focus-visible {
            outline: 3px solid rgba(120, 137, 69, 0.44);
            outline-offset: 4px;
        }

        .candidate2-memorial-index-banner {
            position: relative;
            display: block;
            width: 100%;
            aspect-ratio: 4 / 3;
            padding: 4px;
            overflow: hidden;
            background: #fdfdfd;
            box-shadow: 1px 3px 7px rgba(81, 65, 104, 0.16);
            transform: rotate(0.8deg);
        }

        .candidate2-memorial-index-banner img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center 25%;
        }

        .candidate2-memorial-index-number {
            position: relative;
            display: grid;
            align-self: stretch;
            align-content: center;
            justify-items: center;
            color: #a18bb6;
        }

        .candidate2-memorial-index-number::after {
            position: absolute;
            top: 5px;
            right: -6px;
            bottom: 5px;
            border-right: 1px dashed rgba(145, 119, 159, 0.24);
            content: '';
        }

        .candidate2-memorial-index-number strong {
            font-family: Baskerville, Georgia, serif;
            font-size: 31px;
            font-weight: 400;
            line-height: 1;
        }

        .candidate2-memorial-index-number small {
            margin-top: 4px;
            font-family: Baskerville, Georgia, serif;
            font-size: 9px;
            letter-spacing: 0.06em;
        }

        .candidate2-memorial-index-copy {
            display: grid;
            min-width: 0;
            gap: 3px;
            color: #685774;
        }

        .candidate2-memorial-index-copy > small {
            color: #a58eae;
            font-family: 'Songti SC', STSong, serif;
            font-size: 8px;
            letter-spacing: 0.12em;
        }

        .candidate2-memorial-index-copy strong {
            font-family: 'Songti SC', STSong, 'Noto Serif SC', serif;
            font-size: 18px;
            font-weight: 600;
            line-height: 1.2;
            letter-spacing: 0.04em;
            white-space: nowrap;
        }

        .candidate2-memorial-index-copy > span {
            color: #8f8098;
            font-family: 'Songti SC', STSong, serif;
            font-size: 10px;
            letter-spacing: 0.05em;
        }

        .candidate2-memorial-index-copy time {
            margin-top: 6px;
            color: #816f8d;
            font-family: Baskerville, Georgia, serif;
            font-size: 8px;
            letter-spacing: 0.05em;
        }

        .candidate2-memorial-index-action {
            position: absolute;
            right: 4px;
            bottom: 4px;
            z-index: 3;
            padding: 4px 6px 4px 8px;
            color: #fffefe;
            background: rgba(141, 112, 164, 0.88);
            box-shadow: 1px 2px 4px rgba(67, 49, 86, 0.18);
            font-size: 7px;
            letter-spacing: 0.04em;
        }

        .candidate2-memorial-index-action > span {
            margin-left: 2px;
            font-size: 10px;
        }

        .candidate2-memorial-page.is-layout-editor [data-memorial-editor-id] {
            position: relative;
            cursor: move;
            touch-action: none;
            user-select: none;
        }

        .candidate2-memorial-page.is-entry-layout-editor [data-memorial-editor-id] {
            pointer-events: auto !important;
        }

        .candidate2-memorial-page.is-entry-layout-editor [data-memorial-editor-id][hidden] {
            display: none !important;
        }

        .candidate2-memorial-page.is-entry-layout-editor .candidate2-memorial-entry-heading,
        .candidate2-memorial-page.is-entry-layout-editor .candidate2-memorial-entry-collage {
            z-index: auto;
        }

        .candidate2-memorial-page.is-layout-editor .candidate2-memorial-title-lockup {
            position: absolute;
            pointer-events: auto;
        }

        .candidate2-memorial-page.is-layout-editor .candidate2-memorial-paper {
            height: 100%;
            min-height: 100%;
            overflow: hidden;
        }

        .candidate2-memorial-page.is-layout-editor .candidate2-memorial-index {
            min-height: 100%;
        }

        .candidate2-memorial-page.is-layout-editor.is-sampling-color .candidate2-memorial-paper {
            cursor: crosshair;
        }

        .candidate2-memorial-page.is-layout-editor [data-memorial-editor-id].is-memorial-editor-selected {
            outline: 1px dashed rgba(243, 220, 255, 0.95);
            outline-offset: 3px;
        }

        .candidate2-memorial-editor-shape {
            position: absolute !important;
            top: 270px;
            left: 144px;
            z-index: 20;
            width: 72px;
            height: 72px;
            background: #c9acd9;
            box-shadow: 0 5px 12px rgba(39, 21, 54, 0.2);
        }

        .candidate2-memorial-editor-shape[data-memorial-editor-id='shape-1'] {
            height: 68.14px;
        }

        .candidate2-memorial-editor-shape.is-circle {
            border-radius: 50%;
        }

        .candidate2-memorial-editor-shape.is-rounded {
            border-radius: 16px;
        }

        .candidate2-memorial-editor-shape.is-frame {
            border: 8px solid #f8f4fa;
            background: rgba(139, 106, 157, 0.25);
        }

        .candidate2-memorial-entry-added-asset {
            position: absolute !important;
            top: 220px;
            left: 72px;
            width: 188px !important;
            margin: 0 !important;
            grid-column: auto !important;
            grid-row: auto !important;
        }

        .candidate2-memorial-entry-added-asset[data-memorial-editor-asset='stickers'] {
            top: 76px;
            left: 232px;
            width: 88px !important;
        }

        .candidate2-memorial-entry-added-asset[data-memorial-editor-asset='hero'] {
            width: 260px !important;
        }

        .candidate2-memorial-entry-added-asset[data-memorial-editor-asset='secondary'] {
            top: 382px;
            width: 165px !important;
        }

        .candidate2-memorial-entry-added-asset[data-memorial-editor-asset='note'] {
            top: 398px;
            left: 174px;
            width: 140px !important;
        }

        .candidate2-memorial-entry-archive-templates {
            display: none;
        }

        .candidate2-qixi-archive-lantern {
            position: relative;
            width: 150px;
            height: 140px;
            overflow: visible;
        }

        .candidate2-qixi-archive-lantern-art {
            position: absolute;
            top: 0;
            left: 0;
            display: block;
            width: 196px;
            height: 184px;
            transform: scale(0.76);
            transform-origin: left top;
        }

        .candidate2-qixi-archive-lantern-art::before {
            position: absolute;
            top: 0;
            left: 50%;
            z-index: 0;
            width: 1px;
            height: 30px;
            background: linear-gradient(180deg, #a97947, #e7c998);
            box-shadow: 0 0 2px rgba(110, 79, 67, 0.22);
            content: '';
        }

        .candidate2-qixi-archive-lantern-base,
        .candidate2-qixi-archive-lantern-layer {
            position: absolute;
            display: block;
            background-repeat: no-repeat;
            pointer-events: none;
        }

        .candidate2-qixi-archive-lantern-base {
            z-index: 1;
            background-image: url('/lingye/memorial/qixi-archive/qixi-lantern-bases-v2-web.webp');
            background-position: var(--lamp-x, 0%) var(--lamp-y, 0%);
            background-size: 300% 400%;
        }

        .candidate2-qixi-archive-lantern-layer {
            z-index: 2;
            background-image: url('/lingye/memorial/qixi-archive/qixi-lantern-decorations-v3-web.webp');
            background-size: 300% 400%;
        }

        .candidate2-qixi-archive-lantern-ornament {
            z-index: 0;
        }

        .candidate2-qixi-archive-letter {
            position: relative;
            display: grid;
            width: 220px;
            height: 136px;
            padding: 30px 38px 26px 46px;
            align-content: center;
            background: url('/lingye/memorial/qixi-archive/qixi-letter-card-v1.png') center / 100% 100% no-repeat;
            color: #624d69;
        }

        .candidate2-qixi-archive-letter p {
            position: relative;
            z-index: 1;
            margin: 0;
            outline: none;
            overflow-wrap: anywhere;
            white-space: pre-wrap;
            font: 400 9px/1.72 'MoQuGuFengTi', serif;
            letter-spacing: 0.08em;
            text-align: center;
        }

        .candidate2-qixi-archive-letter-signature {
            position: absolute;
            z-index: 1;
            right: 60px;
            bottom: 19px;
            color: rgba(111, 80, 119, 0.84);
            font: 400 8px/1 'MoQuGuFengTi', serif;
            letter-spacing: 0.12em;
        }

        .candidate2-qixi-archive-qiaoqiao {
            display: block;
            width: 94px;
            height: 94px;
            background: url('/lingye/memorial/qixi-archive/qixi-stickers-v2-web.webp') 0 0 / 300% 300% no-repeat;
            filter: drop-shadow(0 5px 6px rgba(74, 56, 87, 0.16));
        }

        .candidate2-memorial-entry-added-asset[data-memorial-editor-asset='saved-lantern'],
        .candidate2-memorial-entry-added-asset[data-memorial-editor-asset='my-lantern'],
        .candidate2-memorial-entry-added-asset[data-memorial-editor-asset='du-lantern'] {
            top: 300px;
            left: 40px;
            width: 150px !important;
        }

        .candidate2-memorial-entry-added-asset[data-memorial-editor-asset='saved-letter'],
        .candidate2-memorial-entry-added-asset[data-memorial-editor-asset='my-letter'],
        .candidate2-memorial-entry-added-asset[data-memorial-editor-asset='du-letter'] {
            top: 380px;
            left: 94px;
            width: 220px !important;
        }

        .candidate2-memorial-entry-added-asset[data-memorial-editor-asset='qiaoqiao'] {
            top: 318px;
            left: 230px;
            width: 94px !important;
        }

        .candidate2-memorial-entry-added-asset[data-memorial-editor-asset='event-label'],
        .candidate2-memorial-entry-added-asset[data-memorial-editor-asset='date'] {
            top: 112px;
            left: 48px;
            width: max-content !important;
            color: #8f799b;
            font-family: Baskerville, Georgia, serif;
            font-size: 9px;
            letter-spacing: 0.06em;
        }

        .candidate2-memorial-entry-added-asset[data-memorial-editor-asset='date'] {
            top: 177px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .candidate2-memorial-entry-added-asset[data-memorial-editor-asset='date'] i {
            width: 18px;
            height: 1px;
            background: rgba(122, 93, 137, 0.28);
        }

        .candidate2-memorial-editor-selection {
            position: absolute;
            z-index: 9997;
            border: 1px solid #f4d9ff;
            box-shadow: 0 0 0 1px rgba(69, 43, 87, 0.7);
            pointer-events: none;
        }

        .candidate2-memorial-editor-selection[hidden] {
            display: none;
        }

        .candidate2-memorial-editor-selection button {
            position: absolute;
            display: block;
            width: 18px;
            min-height: 18px;
            padding: 0;
            border: 2px solid #fff8ff;
            border-radius: 50%;
            background: #7d578e;
            box-shadow: 0 2px 6px rgba(31, 17, 43, 0.3);
            pointer-events: auto;
            touch-action: none;
        }

        .candidate2-memorial-editor-selection [data-memorial-editor-handle='rotate'] {
            top: -29px;
            left: calc(50% - 9px);
            cursor: grab;
        }

        .candidate2-memorial-editor-selection [data-memorial-editor-handle='rotate']::after {
            position: absolute;
            top: 16px;
            left: 7px;
            width: 1px;
            height: 11px;
            background: #f4d9ff;
            content: '';
        }

        .candidate2-memorial-editor-selection [data-memorial-editor-handle='scale'] {
            right: -10px;
            bottom: -10px;
            cursor: nwse-resize;
        }

        .candidate2-memorial-editor {
            position: fixed;
            right: 7px;
            bottom: 7px;
            left: 7px;
            z-index: 10000;
            display: grid;
            max-height: 184px;
            padding: 8px 9px;
            gap: 6px;
            overflow: auto;
            color: #fbf7fd;
            background: rgba(42, 27, 58, 0.95);
            box-shadow: 0 8px 24px rgba(21, 11, 30, 0.42);
            font-size: 10px;
        }

        .candidate2-memorial-editor[hidden] {
            display: none;
        }

        .candidate2-memorial-editor.is-entry-editor {
            max-height: 242px;
        }

        .candidate2-memorial-editor-assets:not([hidden]) {
            display: grid;
            gap: 5px;
            grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .candidate2-memorial-editor-assets button {
            min-width: 0;
            padding-inline: 3px;
            white-space: nowrap;
        }

        .candidate2-memorial-editor.is-entry-editor .candidate2-memorial-editor-shapes {
            display: none;
        }

        .candidate2-memorial-editor header,
        .candidate2-memorial-editor-row {
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .candidate2-memorial-editor header {
            justify-content: space-between;
        }

        .candidate2-memorial-editor header > span {
            display: inline-flex;
            align-items: center;
            gap: 7px;
        }

        .candidate2-memorial-editor header button {
            min-height: 22px;
            padding: 2px 6px;
        }

        .candidate2-memorial-editor.is-collapsed {
            max-height: none;
        }

        .candidate2-memorial-editor.is-collapsed > :not(header) {
            display: none !important;
        }

        .candidate2-memorial-editor-current {
            color: #d8bedf;
        }

        .candidate2-memorial-editor label {
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .candidate2-memorial-editor-text-input {
            min-width: 0;
            flex: 1;
            padding: 4px 6px;
            border: 1px solid rgba(232, 211, 239, 0.28);
            color: #3f2d49;
            background: #f8f2fa;
            font: inherit;
        }

        .candidate2-memorial-editor input[type='color'] {
            width: 28px;
            height: 23px;
            padding: 1px;
            border: 0;
            background: transparent;
        }

        .candidate2-memorial-editor button {
            min-height: 27px;
            padding: 4px 7px;
            border: 1px solid rgba(232, 211, 239, 0.24);
            color: #f8f2fa;
            background: rgba(126, 89, 143, 0.58);
            font: inherit;
            cursor: pointer;
        }

        .candidate2-memorial-editor button:disabled,
        .candidate2-memorial-editor input:disabled {
            cursor: not-allowed;
            opacity: 0.42;
        }

        .candidate2-memorial-editor-status {
            margin: 0;
            color: #d8c6df;
            line-height: 1.4;
        }

        .candidate2-memorial-entry-view {
            position: relative;
            min-height: 820px;
            margin: -16px -20px -126px;
            padding: 48px 24px 94px 34px;
            overflow: hidden;
            background: #f7f5fa url('/lingye/memorial/memorial-entry-paper-v1.png') center top / 100% 100% no-repeat;
        }

        .candidate2-memorial-entry-view--qixi {
            min-height: 650px;
        }

        .candidate2-memorial-entry-view::after {
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            width: 9px;
            background: linear-gradient(90deg, transparent, rgba(91, 69, 106, 0.09));
            content: '';
            pointer-events: none;
        }

        .candidate2-memorial-binding {
            display: none;
        }

        .candidate2-memorial-entry-back {
            position: absolute;
            top: 18px;
            left: 20px;
            z-index: 5;
            display: inline-grid;
            width: 40px;
            min-height: 40px;
            padding: 0;
            place-items: center;
            border: 0;
            color: #674d78;
            background: transparent;
            cursor: pointer;
        }

        .candidate2-memorial-entry-back::before {
            position: absolute;
            width: 18px;
            height: 18px;
            border: 1px solid rgba(102, 77, 121, 0.38);
            background: transparent;
            box-shadow:
                0 0 0 2px rgba(255, 255, 255, 0.16),
                0 2px 5px rgba(41, 24, 58, 0.12);
            content: '';
            transform: rotate(45deg);
        }

        .candidate2-memorial-entry-back span {
            position: relative;
            z-index: 1;
            display: block;
            width: 11px;
            height: 1.25px;
            border-radius: 999px;
            background: currentColor;
            font-size: 0;
            transform: translateX(1px);
        }

        .candidate2-memorial-entry-back span::before {
            position: absolute;
            top: 50%;
            left: 0;
            width: 5px;
            height: 5px;
            border-bottom: 1.25px solid currentColor;
            border-left: 1.25px solid currentColor;
            content: '';
            transform: translateY(-50%) rotate(45deg);
        }

        .candidate2-memorial-entry-back:focus-visible {
            outline: 3px solid rgba(120, 137, 69, 0.5);
            outline-offset: 2px;
        }

        .candidate2-memorial-entry-heading {
            position: relative;
            z-index: 2;
            display: grid;
            margin: 12px 4px 0 8px;
            grid-template-columns: minmax(0, 1fr);
            align-items: start;
            gap: 7px;
            color: #72567f;
        }

        .candidate2-memorial-entry-view--qixi .candidate2-memorial-entry-heading {
            padding-right: 66px;
        }

        .candidate2-memorial-entry-view--qixi .candidate2-memorial-entry-heading > div > span {
            color: #9b83a7;
            font-family: Baskerville, Georgia, serif;
            font-size: 9px;
            letter-spacing: 0.08em;
        }

        .candidate2-memorial-entry-title-art {
            width: min(100%, 188px);
            margin-top: 4px;
        }

        .candidate2-memorial-entry-title-art img {
            display: block;
            width: 100%;
            height: auto;
            filter: drop-shadow(0 1px 0 rgba(255, 255, 255, 0.42));
        }

        .candidate2-memorial-entry-qixi-stickers {
            position: absolute;
            top: 26px;
            right: -3px;
            z-index: 3;
            width: 88px;
            height: auto;
            pointer-events: none;
            filter: drop-shadow(2px 5px 7px rgba(74, 51, 88, 0.12));
        }

        .candidate2-memorial-entry-view--qixi .candidate2-memorial-entry-heading time {
            display: flex;
            padding: 0;
            align-items: center;
            justify-content: flex-start;
            gap: 6px;
            color: #8f799b;
            font-family: Baskerville, Georgia, serif;
            font-size: 9px;
            letter-spacing: 0.03em;
        }

        .candidate2-memorial-entry-view--qixi .candidate2-memorial-entry-heading time i {
            width: 18px;
            height: 1px;
            background: rgba(122, 93, 137, 0.28);
        }

        .candidate2-memorial-entry-collage {
            position: relative;
            display: grid;
        }

        .candidate2-memorial-entry-view--qixi .candidate2-memorial-entry-collage {
            margin-top: 15px;
            grid-template-columns: repeat(12, minmax(0, 1fr));
            grid-template-rows: auto auto;
            gap: 14px 0;
        }

        .candidate2-memorial-entry-hero-photo,
        .candidate2-memorial-entry-secondary-photo {
            position: relative;
            width: 100%;
            margin: 0;
            background: #fdfcfe;
            box-shadow: 3px 6px 13px rgba(67, 49, 82, 0.18);
        }

        .candidate2-memorial-entry-view--qixi .candidate2-memorial-entry-hero-photo {
            grid-column: 1 / -1;
            grid-row: 1;
            width: calc(100% - 8px);
            padding: 7px 7px 14px;
            transform: rotate(-0.8deg);
        }

        .candidate2-memorial-entry-hero-photo img,
        .candidate2-memorial-entry-secondary-photo img {
            display: block;
            width: 100%;
            object-fit: cover;
        }

        .candidate2-memorial-entry-view--qixi .candidate2-memorial-entry-hero-photo img {
            aspect-ratio: 1.42;
            height: 166px;
            object-position: center 23%;
        }

        .candidate2-memorial-entry-view--qixi .candidate2-memorial-entry-tape {
            position: absolute;
            top: -8px;
            right: 28px;
            z-index: 2;
            width: 58px;
            height: 17px;
            background: rgba(192, 170, 208, 0.66);
            clip-path: polygon(3% 8%, 100% 0, 96% 100%, 0 87%);
            transform: rotate(4deg);
        }

        .candidate2-memorial-entry-view--qixi .candidate2-memorial-entry-note {
            position: relative;
            z-index: 4;
            display: grid;
            grid-column: 7 / -1;
            grid-row: 2;
            width: 100%;
            aspect-ratio: 4 / 3;
            margin: 24px 0 0 -10px;
            padding: 14px 11px 12px;
            place-items: center;
            color: #715a7c;
            background: url('/lingye/memorial/qixi-letter-note.webp') center / contain no-repeat;
            filter: drop-shadow(2px 5px 7px rgba(70, 51, 82, 0.14));
            transform: rotate(2.8deg);
        }

        .candidate2-memorial-entry-view--qixi .candidate2-memorial-entry-note p {
            margin: 0;
            font-family: 'Songti SC', STSong, serif;
            font-size: 8px;
            line-height: 1.8;
            text-align: center;
        }

        .candidate2-memorial-entry-view--qixi .candidate2-memorial-entry-secondary-photo {
            z-index: 3;
            grid-column: 1 / 8;
            grid-row: 2;
            margin: 0;
            padding: 6px 6px 18px;
            box-shadow: 3px 6px 12px rgba(67, 49, 82, 0.16);
            transform: rotate(-3.2deg);
        }

        .candidate2-memorial-entry-view--qixi .candidate2-memorial-entry-secondary-photo img {
            aspect-ratio: 1.28;
            height: 128px;
            object-position: center 21%;
        }

        .candidate2-together-paper {
            min-height: 100%;
            padding: 0 18px 20px;
            background:
                radial-gradient(circle at 12% 8%, rgba(123, 151, 102, 0.12), transparent 29%),
                var(--candidate2-together-page-bg);
        }

        .candidate2-place-back-link {
            position: absolute;
            z-index: 2;
            top: 15px;
            left: 17px;
            display: inline-flex;
            min-height: 34px;
            padding: 0;
            align-items: center;
            gap: 5px;
            border: 0;
            color: #fff9e9;
            background: transparent;
            font: inherit;
            font-size: 11px;
            font-weight: 800;
            text-shadow: 0 2px 7px rgba(30, 37, 30, 0.78);
            cursor: pointer;
        }

        .candidate2-place-back-link span {
            font-size: 24px;
            line-height: 0;
        }

        .candidate2-together-cover {
            position: relative;
            z-index: 1;
            margin: 0 -18px;
            overflow: hidden;
            background: var(--candidate2-together-page-bg);
        }

        .candidate2-together-cover::after {
            position: absolute;
            inset: 0;
            background: linear-gradient(
                180deg,
                rgba(25, 34, 28, 0.48) 0,
                rgba(25, 34, 28, 0.03) 35%,
                transparent 58%,
                rgba(246, 241, 223, 0.24) 76%,
                var(--candidate2-together-page-bg) 100%
            );
            content: '';
            pointer-events: none;
        }

        .candidate2-together-history-button {
            position: absolute;
            z-index: 2;
            top: 15px;
            right: 15px;
            display: grid;
            width: 34px;
            height: 34px;
            padding: 4px;
            place-items: center;
            border: 0;
            color: #fff9e9;
            background: transparent;
            filter: drop-shadow(0 2px 6px rgba(27, 33, 29, 0.72));
        }

        .candidate2-together-history-button svg {
            width: 27px;
            height: 27px;
            fill: rgba(255, 249, 233, 0.08);
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.8;
        }

        .candidate2-together-cover img {
            display: block;
            width: 100%;
            height: auto;
            aspect-ratio: 4 / 3;
            object-fit: cover;
        }

        .candidate2-together-section {
            margin: 0;
            padding: 19px 0 21px;
            border-bottom: 1px solid rgba(126, 108, 75, 0.16);
        }

        .candidate2-together-cover + .candidate2-together-section {
            padding-top: 37px;
        }

        .candidate2-together-stage-rail {
            display: flex;
            margin-top: 18px;
            align-items: center;
        }

        .candidate2-together-stage-rail span {
            display: grid;
            width: 25px;
            height: 25px;
            flex: 0 0 auto;
            place-items: center;
            border: 1px solid #c7bda9;
            border-radius: 50%;
            color: #8e806f;
            background: #faf4e7;
            font-size: 11px;
            font-weight: 800;
        }

        .candidate2-together-stage-rail span.is-current {
            border-color: #839b4a;
            color: #fffdf3;
            background: #839b4a;
        }

        .candidate2-together-stage-rail i {
            height: 1px;
            flex: 1;
            background: #d7cfbd;
        }

        .candidate2-together-stage-name {
            margin: 12px 0 0;
            color: #5b513f;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: 15px;
            font-weight: 800;
        }

        .candidate2-together-task-list {
            display: grid;
            margin-top: 14px;
            gap: 8px;
        }

        .candidate2-together-task-list article {
            display: grid;
            min-height: 55px;
            padding: 9px 0;
            grid-template-columns: 30px minmax(0, 1fr) auto;
            align-items: center;
            gap: 9px;
            border-top: 1px solid rgba(129, 112, 80, 0.12);
        }

        .candidate2-task-mark {
            display: grid;
            width: 27px;
            height: 27px;
            place-items: center;
            border-radius: 50%;
            color: #fffdf4;
            background: #98a65c;
            font-size: 11px;
            font-weight: 900;
        }

        .candidate2-together-task-list strong,
        .candidate2-together-task-list p {
            display: block;
            margin: 0;
        }

        .candidate2-together-task-list strong {
            color: #564a3d;
            font-size: 12px;
        }

        .candidate2-together-task-list p {
            margin-top: 3px;
            color: #8a7b6e;
            font-size: 10px;
            line-height: 1.45;
        }

        .candidate2-together-task-list small {
            color: #91846f;
            font-size: 9px;
            white-space: nowrap;
        }

        .candidate2-together-choice-list {
            display: grid;
            margin-top: 13px;
            gap: 7px;
        }

        .candidate2-together-choice-list div {
            display: grid;
            min-height: 45px;
            padding: 8px 0;
            grid-template-columns: 27px 1fr;
            align-items: center;
            gap: 8px;
            border-top: 1px solid rgba(129, 112, 80, 0.14);
            color: #685b4c;
            font-size: 11px;
            line-height: 1.45;
        }

        .candidate2-together-choice-list b {
            display: grid;
            width: 24px;
            height: 24px;
            place-items: center;
            border-radius: 50%;
            color: #fffdf5;
            background: #a89a69;
            font-size: 10px;
        }

        .candidate2-together-rules {
            padding: 4px 5px 18px;
            color: #786b60;
        }

        .candidate2-together-rules strong {
            color: #5f5549;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: 13px;
        }

        .candidate2-together-rules p {
            margin: 5px 0 0;
            font-size: 10px;
            line-height: 1.65;
        }

        .candidate2-together-history-page {
            box-sizing: border-box;
            min-height: 100%;
            padding: 12px 12px 112px !important;
            overflow-y: auto;
            color: #4b463d;
            background-color: #f8f6ed;
            background-image:
                radial-gradient(circle at 18% 12%, rgba(126, 143, 83, 0.07) 0 1px, transparent 1.5px),
                radial-gradient(circle at 78% 28%, rgba(183, 157, 105, 0.06) 0 1px, transparent 1.5px),
                linear-gradient(180deg, #fbfaf3 0%, #f5f2e7 100%);
            background-size: 24px 24px, 31px 31px, 100% 100%;
        }

        .candidate2-together-history-header {
            display: grid;
            min-height: 38px;
            grid-template-columns: 38px 1fr 38px;
            align-items: center;
            color: #586341;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: 13px;
            font-weight: 900;
            letter-spacing: 0.08em;
            text-align: center;
        }

        .candidate2-together-history-header[hidden] {
            display: none;
        }

        .candidate2-together-history-back {
            display: grid;
            width: 38px;
            height: 38px;
            padding: 0;
            place-items: center;
            border: 0;
            color: inherit;
            background: transparent;
            font: inherit;
            cursor: pointer;
        }

        .candidate2-together-history-back span {
            font-size: 27px;
            line-height: 1;
        }

        .candidate2-together-archive-directory {
            width: min(100%, 540px);
            margin: 10px auto 0;
        }

        .candidate2-together-archive-reader {
            box-sizing: border-box;
            width: 100%;
            margin: 0;
            padding: 0 6px 24px;
        }

        .candidate2-together-archive-directory {
            display: grid;
            gap: 10px;
        }

        .candidate2-together-archive-index-card {
            display: grid;
            width: 100%;
            min-width: 0;
            padding: 8px;
            grid-template-columns: 92px minmax(0, 1fr) 18px;
            gap: 11px;
            align-items: center;
            border: 1px solid #deddd3;
            border-radius: 10px;
            color: #48483f;
            background: #fffef9;
            box-shadow: 0 4px 12px rgba(66, 69, 54, 0.08);
            font: inherit;
            text-align: left;
            cursor: pointer;
        }

        .candidate2-together-archive-index-photo {
            display: block;
            width: 92px;
            aspect-ratio: 4 / 3;
            object-fit: cover;
            border: 4px solid #fff;
            background: #f2f2ea;
            box-shadow: 0 2px 7px rgba(66, 69, 54, 0.12);
        }

        .candidate2-together-archive-index-copy {
            min-width: 0;
        }

        .candidate2-together-archive-index-round,
        .candidate2-together-archive-reader-round {
            margin: 0;
            color: #81905e;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 0.08em;
        }

        .candidate2-together-archive-index-title {
            margin: 4px 0 0;
            overflow: hidden;
            color: #42463a;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: 15px;
            line-height: 1.35;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .candidate2-together-archive-index-ending {
            margin: 5px 0 0;
            overflow: hidden;
            color: #77766c;
            font-size: 10px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .candidate2-together-archive-index-chevron {
            color: #91a064;
            font-size: 22px;
            text-align: center;
        }

        .candidate2-together-archive-reader[hidden],
        .candidate2-together-archive-directory[hidden] {
            display: none;
        }

        .candidate2-together-archive-reader-header {
            display: grid;
            min-height: 54px;
            padding: 2px 2px 8px;
            grid-template-columns: 34px minmax(0, 1fr);
            gap: 9px;
            align-items: start;
        }

        .candidate2-together-archive-reader-header button {
            display: grid;
            width: 34px;
            height: 34px;
            padding: 0;
            place-items: center;
            border: 0;
            color: #647247;
            background: transparent;
            font: inherit;
            font-size: 25px;
            cursor: pointer;
        }

        .candidate2-together-archive-reader-title {
            margin: 4px 0 0;
            color: #42463a;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: clamp(18px, 5.8vw, 23px);
            line-height: 1.35;
            letter-spacing: 0.06em;
        }

        .candidate2-together-archive-page {
            position: relative;
            min-width: 0;
            margin-top: 2px;
            padding: 0 4px 22px;
            border: 0;
            border-radius: 0;
            background: transparent;
            box-shadow: none;
        }

        .candidate2-together-archive-photo {
            position: relative;
            display: block;
            box-sizing: border-box;
            width: calc(100% - 10px);
            aspect-ratio: 4 / 3;
            margin: 9px auto 0;
            padding: 7px;
            overflow: visible;
            border: 1px solid #ded8c9;
            background: #fffdf6;
            box-shadow: 0 5px 14px rgba(66, 69, 54, 0.14);
            transform: rotate(-0.45deg);
        }

        .candidate2-together-archive-photo::before {
            position: absolute;
            top: -8px;
            left: 12%;
            z-index: 2;
            width: 48px;
            height: 16px;
            content: '';
            background: rgba(217, 226, 174, 0.86);
            box-shadow: 0 1px 2px rgba(84, 88, 61, 0.13);
            transform: rotate(-7deg);
        }

        .candidate2-together-archive-photo::after {
            position: absolute;
            right: -7px;
            bottom: -10px;
            z-index: 2;
            display: grid;
            width: 27px;
            height: 27px;
            content: '✦';
            place-items: center;
            color: #fff8d1;
            border: 3px solid #fffdf5;
            border-radius: 50%;
            background: #8ca260;
            box-shadow: 0 2px 5px rgba(67, 77, 47, 0.16);
            font-size: 13px;
            transform: rotate(8deg);
        }

        .candidate2-together-archive-photo[hidden] {
            display: none;
        }

        .candidate2-together-archive-photo img {
            display: block;
            width: 100%;
            height: 100%;
            border-radius: 2px;
            object-fit: cover;
        }

        .candidate2-together-archive-entry-title {
            margin: 25px 8px 0;
            color: #3f4938;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: clamp(20px, 6.3vw, 26px);
            line-height: 1.45;
            letter-spacing: 0.07em;
        }

        .candidate2-together-archive-entry-title::after {
            display: block;
            width: 58px;
            height: 5px;
            margin-top: 8px;
            content: '';
            border-radius: 999px;
            background: linear-gradient(90deg, #91a564 0 62%, rgba(145, 165, 100, 0.18) 62% 100%);
        }

        .candidate2-together-archive-entry-text {
            max-width: 34em;
            margin: 14px auto 0;
            color: #5c594f;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: clamp(12px, 3.7vw, 14px);
            line-height: 2;
            letter-spacing: 0.045em;
            text-align: justify;
            text-wrap: pretty;
            white-space: pre-line;
        }

        .candidate2-together-archive-pagination {
            display: grid;
            width: min(170px, 60vw);
            margin: 14px auto 0;
            grid-template-columns: 34px 1fr 34px;
            align-items: center;
            color: #686b5e;
            font-size: 10px;
            font-weight: 800;
            text-align: center;
        }

        .candidate2-together-archive-pagination button {
            display: grid;
            width: 34px;
            height: 34px;
            padding: 0;
            place-items: center;
            border: 1px solid #6f7f4b;
            border-radius: 50%;
            color: #fffef7;
            background: #80944f;
            box-shadow: 0 2px 0 #5d6e3c;
            font: inherit;
            font-size: 22px;
            cursor: pointer;
        }

        .candidate2-together-archive-pagination button:disabled {
            opacity: 0.3;
            cursor: default;
        }

        .candidate2-together-archive-empty {
            width: min(100%, 430px);
            margin: 22px auto 0;
            color: #74786a;
            font-size: 11px;
            text-align: center;
        }

        @media (max-width: 350px) {
            .candidate2-together-history-page {
                padding-right: 8px !important;
                padding-left: 8px !important;
            }

            .candidate2-together-archive-index-card {
                grid-template-columns: 82px minmax(0, 1fr) 16px;
                gap: 9px;
            }

            .candidate2-together-archive-index-photo {
                width: 82px;
            }
        }

        .candidate2-glimmer-page {
            --glimmer-animal-caption-gap: -2px;
            --glimmer-animal-column-gap: 10px;
            --glimmer-animal-row-gap: 13px;
            --glimmer-animal-size: 64px;
            isolation: isolate;
            padding-bottom: 0 !important;
            padding-right: 16px !important;
            padding-left: 16px !important;
            color: #f5efe1;
            background: #07172b;
        }

        .candidate2-glimmer-backdrop {
            position: absolute;
            z-index: -2;
            inset: 0;
            min-height: 100%;
            background: #07172b url('/lingye/glimmer/glimmer-night-hero.jpg') top center / 100% auto no-repeat;
            pointer-events: none;
        }

        .candidate2-glimmer-backdrop::after {
            position: absolute;
            inset: 0;
            background: linear-gradient(180deg, transparent 0 24%, rgba(7, 23, 43, 0.18) 39%, rgba(7, 23, 43, 0.82) 74%, #07172b 100%);
            content: '';
        }

        .candidate2-glimmer-hero {
            position: relative;
            z-index: 2;
            width: 100%;
            aspect-ratio: 25 / 23;
        }

        .candidate2-glimmer-hero:has(.candidate2-glimmer-library[open]) {
            z-index: 4;
        }

        .candidate2-glimmer-back-button {
            position: absolute;
            z-index: 12;
            top: 15px;
            left: 0;
            display: inline-flex;
            min-height: 34px;
            padding: 0;
            align-items: center;
            gap: 4px;
            border: 0;
            color: #fff9e9;
            background: transparent;
            font: inherit;
            font-size: 11px;
            font-weight: 800;
            text-shadow: 0 2px 7px rgba(0, 0, 0, 0.72);
            cursor: pointer;
        }

        .candidate2-glimmer-back-button::before {
            position: absolute;
            inset: -5px;
            content: '';
        }

        .candidate2-glimmer-back-button:hover {
            color: #fff2b5;
        }

        .candidate2-glimmer-back-button span {
            font-size: 24px;
            line-height: 0;
        }

        .candidate2-glimmer-library {
            position: absolute;
            z-index: 12;
            top: 18px;
            right: 2px;
        }

        .candidate2-glimmer-library > summary {
            position: relative;
            display: grid;
            width: 28px;
            height: 28px;
            padding: 0;
            place-items: center;
            border: 0;
            color: #e5da9c;
            background: transparent;
            cursor: pointer;
            list-style: none;
            text-shadow: 0 2px 5px rgba(0, 0, 0, 0.52);
        }

        .candidate2-glimmer-library > summary::before {
            position: absolute;
            inset: -8px;
            content: '';
        }

        .candidate2-glimmer-library > summary svg {
            width: 19px;
            height: 19px;
            fill: none;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.6;
            filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.52));
        }

        .candidate2-glimmer-library > summary:hover,
        .candidate2-glimmer-library[open] > summary {
            color: #fff2b5;
        }

        .candidate2-glimmer-library > summary::-webkit-details-marker,
        .candidate2-glimmer-library-panel > details > summary::-webkit-details-marker {
            display: none;
        }

        .candidate2-glimmer-back-button:focus-visible,
        .candidate2-glimmer-library > summary:focus-visible {
            outline: 2px solid rgba(255, 242, 181, 0.82);
            outline-offset: 3px;
        }

        .candidate2-glimmer-library-panel {
            position: absolute;
            z-index: 1;
            isolation: isolate;
            top: 38px;
            right: 0;
            width: min(240px, calc(100vw - 54px));
            max-height: 58vh;
            padding: 4px 12px 9px;
            overflow-y: auto;
            border: 0;
            color: #f5efe1;
            background: #07172b;
        }

        .candidate2-glimmer-library-panel > details {
            padding: 9px 0;
        }

        .candidate2-glimmer-library-panel > details > summary {
            color: #f6efdd;
            cursor: pointer;
            font-size: 12px;
            font-weight: 750;
            list-style: none;
        }

        .candidate2-glimmer-library-panel > details > summary::after {
            float: right;
            color: rgba(229, 218, 156, 0.7);
            content: '+';
        }

        .candidate2-glimmer-library-panel > details[open] > summary::after {
            content: '−';
        }

        .candidate2-glimmer-library-panel > details > :not(summary) {
            margin-top: 8px;
        }

        .candidate2-glimmer-library-panel p {
            margin-bottom: 0;
            color: rgba(235, 231, 212, 0.58);
            font-size: 8px;
            line-height: 1.55;
        }

        .candidate2-glimmer-library-panel p strong {
            display: block;
            margin-bottom: 3px;
            color: #f2ead6;
            font-size: 9px;
        }

        .candidate2-glimmer-status-overlay {
            position: absolute;
            right: 0;
            bottom: 18px;
            left: 0;
            padding-top: 13px;
            border-top: 1px solid rgba(234, 224, 186, 0.46);
            color: #f7efd8;
            text-shadow: 0 2px 8px rgba(0, 0, 0, 0.76);
        }

        .candidate2-glimmer-status-overlay h2 {
            margin: 0;
            color: #f7efd8;
            font-size: 12px;
            font-weight: 650;
            letter-spacing: 0.14em;
        }

        .candidate2-glimmer-status-grid {
            display: grid;
            margin-top: 10px;
            grid-template-columns: 1.5fr 0.75fr 0.75fr;
        }

        .candidate2-glimmer-status-grid div {
            min-width: 0;
            padding: 0 11px;
        }

        .candidate2-glimmer-status-grid div:first-child {
            padding-left: 0;
        }

        .candidate2-glimmer-status-grid div + div {
            border-left: 1px solid rgba(234, 224, 186, 0.28);
        }

        .candidate2-glimmer-status-grid span,
        .candidate2-glimmer-status-grid strong {
            display: block;
        }

        .candidate2-glimmer-status-grid span {
            color: rgba(247, 239, 216, 0.66);
            font-size: 9px;
            letter-spacing: 0.08em;
        }

        .candidate2-glimmer-status-grid strong {
            margin-top: 3px;
            color: #fff8e8;
            font-size: 11px;
            font-weight: 600;
        }

        .candidate2-glimmer-journal {
            position: relative;
            z-index: 3;
            min-height: 510px;
            padding: 25px 4px 44px;
            color: #f5efdf;
        }

        .candidate2-glimmer-journal::before {
            position: absolute;
            top: 0;
            left: 4px;
            width: 86px;
            height: 1px;
            background: linear-gradient(90deg, rgba(218, 211, 150, 0.78), rgba(218, 211, 150, 0));
            box-shadow: 92px 0 rgba(218, 211, 150, 0.14);
            content: '';
        }

        .candidate2-glimmer-journal-feature {
            position: relative;
            padding: 9px 0 29px;
        }

        .candidate2-glimmer-journal-feature h2,
        .candidate2-glimmer-journal-stream h2 {
            margin: 0;
        }

        .candidate2-glimmer-journal-feature h2 {
            color: #fff8e8;
            font-size: 15px;
            letter-spacing: 0.04em;
            text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
        }

        .candidate2-glimmer-feature-empty {
            display: grid;
            margin-top: 20px;
            grid-template-columns: 30px minmax(0, 1fr);
            align-items: start;
            gap: 13px;
        }

        .candidate2-glimmer-feature-empty > span {
            color: #d8d38a;
            font-size: 24px;
            line-height: 1;
            transform: translateY(2px);
            text-shadow: 0 0 15px rgba(218, 211, 138, 0.34);
        }

        .candidate2-glimmer-feature-empty strong,
        .candidate2-glimmer-feature-empty p {
            display: block;
            margin: 0;
        }

        .candidate2-glimmer-feature-empty strong {
            color: #f8f1df;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: 13px;
        }

        .candidate2-glimmer-feature-empty p {
            margin-top: 5px;
            color: rgba(235, 231, 212, 0.62);
            font-size: 10px;
            line-height: 1.65;
        }

        .candidate2-glimmer-feature-demo {
            display: block;
            margin-top: 18px;
        }

        .candidate2-glimmer-feature-demo strong,
        .candidate2-glimmer-feature-demo p {
            display: block;
            margin: 0;
        }

        .candidate2-glimmer-task-title {
            color: #f8f1df;
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: 13px;
        }

        .candidate2-glimmer-task-detail {
            margin-top: 5px !important;
            color: rgba(235, 231, 212, 0.64);
            font-size: 10px;
            line-height: 1.6;
        }

        .candidate2-glimmer-progress > div:first-child {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 8px;
        }

        .candidate2-glimmer-progress {
            margin-top: 14px;
        }

        .candidate2-glimmer-progress span {
            color: rgba(223, 222, 180, 0.64);
            font-size: 8px;
            letter-spacing: 0.08em;
        }

        .candidate2-glimmer-progress strong {
            color: #f5e9b5;
            font-size: 10px;
        }

        .candidate2-glimmer-progress-track {
            height: 3px;
            margin-top: 7px;
            overflow: hidden;
            background: rgba(243, 235, 201, 0.14);
        }

        .candidate2-glimmer-progress-track i {
            display: block;
            width: 0;
            height: 100%;
            background: linear-gradient(90deg, #9da85a, #ead899);
            box-shadow: 0 0 9px rgba(230, 216, 151, 0.38);
        }

        .candidate2-glimmer-journal-stream section {
            display: block;
            padding: 22px 0;
            border-top: 1px solid rgba(224, 218, 180, 0.16);
        }

        .candidate2-glimmer-journal-stream section > :not(:first-child) {
            margin-top: 18px;
        }

        .candidate2-glimmer-journal-stream h2 {
            margin-top: 3px;
            color: #f6efdd;
            font-size: 15px;
            letter-spacing: 0.04em;
        }

        .candidate2-glimmer-journal-stream p {
            margin: 1px 0 0;
            color: rgba(235, 231, 212, 0.58);
            font-size: 10px;
            line-height: 1.65;
        }

        .candidate2-glimmer-journal-stream p strong {
            display: block;
            margin-bottom: 3px;
            color: #f2ead6;
            font-size: 12px;
        }

        .candidate2-glimmer-tracks-demo {
            container-type: inline-size;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            align-items: start;
            gap: var(--glimmer-animal-row-gap) 3.424658cqw;
        }

        .candidate2-glimmer-tracks-demo figure,
        .candidate2-glimmer-variants-demo figure {
            min-width: 0;
            margin: 0;
            text-align: center;
        }

        .candidate2-glimmer-tracks-demo figure {
            position: relative;
            z-index: 3;
            will-change: transform;
            transform: translate3d(var(--glimmer-group-x, 0cqw), var(--glimmer-group-y, 0cqw), 0);
        }

        .candidate2-glimmer-page.is-animal-editor .candidate2-glimmer-tracks-demo figure {
            cursor: grab;
            touch-action: none;
            user-select: none;
        }

        .candidate2-glimmer-tracks-demo .candidate2-glimmer-animal-visual {
            width: min(100%, 21.917808cqw);
        }

        .candidate2-glimmer-tracks-demo .candidate2-glimmer-animal-visual.is-mystery {
            font-size: 14.383562cqw;
        }

        .candidate2-glimmer-tracks-demo figcaption {
            margin-top: -0.684932cqw;
        }

        .candidate2-glimmer-tracks-demo figcaption strong {
            font-size: 3.424658cqw;
        }

        .candidate2-glimmer-page.is-animal-editor .candidate2-glimmer-tracks-demo figure.is-dragging {
            z-index: 8;
            cursor: grabbing;
        }

        .candidate2-glimmer-page.is-animal-editor .candidate2-glimmer-tracks-demo figure:hover img,
        .candidate2-glimmer-page.is-animal-editor .candidate2-glimmer-tracks-demo figure.is-dragging img {
            filter: drop-shadow(0 0 9px rgba(244, 224, 139, 0.72));
        }

        .candidate2-glimmer-animal-visual {
            display: grid;
            width: min(100%, var(--glimmer-animal-size));
            aspect-ratio: 1;
            margin: 0 auto;
            place-items: center;
        }

        .candidate2-glimmer-animal-visual img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: contain;
            filter: drop-shadow(0 5px 8px rgba(0, 0, 0, 0.32));
        }

        .candidate2-glimmer-animal-visual.is-mystery {
            color: rgba(245, 237, 216, 0.74);
            font-family: 'Noto Serif SC', 'Songti SC', serif;
            font-size: 42px;
            line-height: 1;
            text-shadow: 0 3px 13px rgba(0, 0, 0, 0.42);
        }

        .candidate2-glimmer-tracks-demo figcaption,
        .candidate2-glimmer-variants-demo figcaption {
            margin-top: var(--glimmer-animal-caption-gap);
        }

        .candidate2-glimmer-tracks-demo figcaption strong,
        .candidate2-glimmer-variants-demo figcaption strong {
            display: block;
        }

        .candidate2-glimmer-tracks-demo figcaption strong,
        .candidate2-glimmer-variants-demo figcaption strong {
            overflow: hidden;
            color: #f5edd8;
            font-size: 10px;
            line-height: 1.35;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .candidate2-glimmer-events-demo {
            position: relative;
            display: grid;
            gap: 0;
            margin-bottom: 0;
            padding: 0;
            list-style: none;
        }

        .candidate2-glimmer-events-demo::before {
            position: absolute;
            top: 7px;
            bottom: 9px;
            left: 39px;
            width: 1px;
            background: rgba(218, 211, 150, 0.25);
            content: '';
        }

        .candidate2-glimmer-events-demo li {
            position: relative;
            display: grid;
            grid-template-columns: 47px minmax(0, 1fr);
            gap: 11px;
            padding: 0 0 17px;
        }

        .candidate2-glimmer-events-demo li:last-child {
            padding-bottom: 0;
        }

        .candidate2-glimmer-events-demo li::before {
            position: absolute;
            top: 4px;
            left: 36px;
            width: 7px;
            height: 7px;
            border: 1px solid rgba(239, 226, 157, 0.86);
            border-radius: 50%;
            background: #091c32;
            box-shadow: 0 0 8px rgba(231, 219, 146, 0.26);
            content: '';
        }

        .candidate2-glimmer-events-demo time {
            display: grid;
            padding-right: 11px;
            text-align: right;
            color: rgba(223, 222, 180, 0.58);
            font-size: 8px;
            letter-spacing: 0.04em;
            line-height: 1.25;
        }

        .candidate2-glimmer-events-demo time small {
            color: rgba(223, 222, 180, 0.78);
            font-size: inherit;
        }

        .candidate2-glimmer-events-demo strong {
            display: block;
            color: #f4ecd8;
            font-size: 11px;
            line-height: 1.45;
        }

        .candidate2-glimmer-variants-demo {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px 5px;
        }

        .candidate2-glimmer-variants-demo .candidate2-glimmer-animal-visual {
            width: min(100%, 58px);
        }

        .candidate2-glimmer-variant-visual {
            background-image: var(--glimmer-variant-sheet);
            background-repeat: no-repeat;
            background-position: var(--glimmer-variant-x) var(--glimmer-variant-y);
            background-size: 500% 400%;
            filter: drop-shadow(0 4px 7px rgba(0, 0, 0, 0.3));
        }

        .candidate2-glimmer-encounters-demo,
        .candidate2-glimmer-achievements-demo {
            display: grid;
            gap: 0;
            margin: 0;
            padding: 0;
            list-style: none;
        }

        .candidate2-glimmer-encounters-demo li,
        .candidate2-glimmer-achievements-demo article {
            display: flex;
            min-width: 0;
            padding: 6px 0;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }

        .candidate2-glimmer-encounters-demo strong,
        .candidate2-glimmer-achievements-demo strong {
            color: #f4ecd8;
            font-size: 9px;
            font-weight: 650;
            line-height: 1.4;
        }

        .candidate2-glimmer-encounters-demo span,
        .candidate2-glimmer-achievements-demo span,
        .candidate2-glimmer-achievements-demo small {
            color: rgba(223, 222, 180, 0.58);
            font-size: 8px;
        }

        .candidate2-glimmer-achievements-demo article > div {
            display: grid;
            min-width: 0;
            gap: 3px;
        }

        .candidate2-glimmer-achievements-demo article > div:last-child {
            justify-items: end;
            text-align: right;
        }

        .candidate2-glimmer-summary-demo {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            margin-bottom: 0;
            text-align: center;
        }

        .candidate2-glimmer-summary-demo div {
            min-width: 0;
        }

        .candidate2-glimmer-summary-demo dt {
            color: rgba(223, 222, 180, 0.58);
            font-size: 8px;
        }

        .candidate2-glimmer-summary-demo dd {
            margin: 5px 0 0;
            color: #f5e9b5;
            font-size: 13px;
        }

        .candidate2-glimmer-feature-empty[hidden],
        .candidate2-glimmer-feature-demo[hidden],
        .candidate2-glimmer-tracks-demo[hidden],
        .candidate2-glimmer-events-demo[hidden],
        .candidate2-glimmer-variants-demo[hidden],
        .candidate2-glimmer-encounters-demo[hidden],
        .candidate2-glimmer-summary-demo[hidden],
        .candidate2-glimmer-achievements-demo[hidden] {
            display: none !important;
        }

        @media (max-width: 360px) {
            .candidate2-together-paper {
                padding-right: 15px;
                padding-left: 15px;
            }

            .candidate2-together-cover {
                margin-right: -15px;
                margin-left: -15px;
            }

            .candidate2-together-task-list article {
                grid-template-columns: 27px minmax(0, 1fr);
            }

            .candidate2-together-task-list small {
                grid-column: 2;
            }

            .candidate2-glimmer-page {
                padding-right: 13px !important;
                padding-left: 13px !important;
            }

        }

`;

const LINGYE_SCRIPT = `
    const lingyeInstitutionScreenIds = {
        'lingye-daily': 'screen-lingye-institution-lingye-daily',
        'lingye-public-security-office': 'screen-lingye-institution-lingye-public-security-office',
        'animal-hospital': 'screen-lingye-institution-animal-hospital',
        'vocational-school': 'screen-lingye-institution-vocational-school',
        'bank': 'screen-lingye-institution-bank',
        'detention-center': 'screen-lingye-institution-detention-center',
    };

    function showLingyeNotice(message) {
        showCandidateNotice(message);
    }

    function openLingyeRoute(path, label) {
        if (window.__doorbellCandidateDemo && path !== '${DOORBELL_FARM_PATH}') {
            showLingyeNotice('演示模式：' + label + '未连接真实服务');
            return;
        }
        sendAction({ type: 'navigate', path });
    }

    function openLingyePlace(placeId, label) {
        const institutionScreenId = lingyeInstitutionScreenIds[placeId];
        if (institutionScreenId) {
            showScreen(institutionScreenId);
            return;
        }
        if (placeId === 'doorbell-community') {
            showScreen('screen-lounge');
            return;
        }
        if (placeId === 'farm-ranch') {
            openLingyeRoute('${DOORBELL_FARM_PATH}', label);
            return;
        }
        if (placeId === 'glimmer-meadow') {
            if (window.__doorbellCandidateDemo) {
                showScreen('screen-lingye-glimmer');
                return;
            }
            sendAction({ type: 'lingye-glimmer-open' });
            return;
        }
        showLingyeNotice(label + '暂未开放');
    }

    function openLingyeTogether() {
        if (window.__doorbellCandidateDemo) {
            showScreen('screen-lingye-together');
            return;
        }
        sendAction({ type: 'lingye-together-open' });
    }

    function openLingyeMemorial() {
        if (window.__doorbellCandidateDemo) {
            const index = document.querySelector('.candidate2-memorial-index');
            const entry = document.querySelector('.candidate2-memorial-entry-view');
            if (index) index.hidden = false;
            if (entry) entry.hidden = true;
            showScreen('screen-lingye-memorial');
            return;
        }
        sendAction({ type: 'lingye-memorial-open' });
    }

    let lingyeMemorialFilter = 'all';
    let qixiMemorialReady = false;

    function setLingyeMemorialFilter(filter) {
        if (filter !== 'all' && filter !== 'festival') return;
        lingyeMemorialFilter = filter;
        document.querySelectorAll('.candidate2-memorial-tabs [data-memorial-filter]').forEach((button) => {
            const active = button.dataset.memorialFilter === filter;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        document.querySelectorAll('.candidate2-memorial-list [data-memorial-category]').forEach((card) => {
            card.hidden = (!window.__doorbellCandidateDemo && !qixiMemorialReady)
                || (filter !== 'all' && card.dataset.memorialCategory !== filter);
        });
    }

    function openLingyeMemorialEntry() {
        if (!window.__doorbellCandidateDemo && !qixiMemorialReady) return;
        const index = document.querySelector('.candidate2-memorial-index');
        const entry = document.querySelector('.candidate2-memorial-entry-view');
        const screen = document.getElementById('screen-lingye-memorial');
        if (index) index.hidden = true;
        if (entry) entry.hidden = false;
        if (screen) screen.scrollTop = 0;
    }

    function closeLingyeMemorialEntry() {
        const index = document.querySelector('.candidate2-memorial-index');
        const entry = document.querySelector('.candidate2-memorial-entry-view');
        const screen = document.getElementById('screen-lingye-memorial');
        if (index) index.hidden = false;
        if (entry) entry.hidden = true;
        if (screen) screen.scrollTop = 0;
    }

    const memorialPage = document.querySelector('.candidate2-memorial-page');
    const memorialPaper = document.querySelector('.candidate2-memorial-paper');
    const memorialIndex = document.querySelector('.candidate2-memorial-index');
    const memorialEntry = document.querySelector('.candidate2-memorial-entry-view');
    const memorialEditor = document.querySelector('.candidate2-memorial-editor');
    const memorialEditorTitle = memorialEditor.querySelector('header strong');
    const memorialEditorAssets = memorialEditor.querySelector('.candidate2-memorial-editor-assets');
    const memorialEditorSelection = document.querySelector('.candidate2-memorial-editor-selection');
    const memorialEditorCurrent = document.querySelector('.candidate2-memorial-editor-current');
    const memorialEditorTextInput = document.querySelector('.candidate2-memorial-editor-text-input');
    const memorialEditorColorInput = document.querySelector('.candidate2-memorial-editor-color');
    const memorialEditorStatus = document.querySelector('.candidate2-memorial-editor-status');
    const memorialEditorEyeDropper = memorialEditor.querySelector('[data-memorial-editor-command="eyedropper"]');
    const memorialEditorBackward = memorialEditor.querySelector('[data-memorial-editor-command="backward"]');
    const memorialEditorForward = memorialEditor.querySelector('[data-memorial-editor-command="forward"]');
    const memorialEditorDuplicate = memorialEditor.querySelector('[data-memorial-editor-command="duplicate"]');
    const memorialEditorToggle = memorialEditor.querySelector('[data-memorial-editor-command="toggle"]');
    const memorialEditorDelete = memorialEditor.querySelector('[data-memorial-editor-command="delete"]');
    const memorialEditorCopy = memorialEditor.querySelector('[data-memorial-editor-command="copy"]');
    const memorialEditorDefaultLayout = {
        'title-lockup': { color: null, rotate: 0, scale: 0.97, x: -22.9, y: -16.4, z: 10, kind: null, text: null },
        paper: { color: '#f8f1f5', rotate: 1.5, scale: 1.44, x: 49.5, y: 27.4, z: 3, kind: null, text: null },
        'tab-all': { color: '#dfc6e2', rotate: 0, scale: 0.83, x: 100.4, y: 22, z: -1, kind: null, text: '全部' },
        'tab-festival': { color: '#dfc6e2', rotate: 0, scale: 0.81, x: 96.4, y: 16.9, z: -2, kind: null, text: '节日' },
        'event-card': { color: '#ffffff', rotate: 0.6, scale: 0.66, x: -46.4, y: -58.9, z: 10, kind: null, text: null },
        'event-number': { color: null, rotate: 0, scale: 1, x: 0, y: 0, z: 10, kind: null, text: null },
        'event-title': { color: null, rotate: 0, scale: 1, x: 0.1, y: 0, z: 10, kind: null, text: '七夕活动' },
        'event-theme': { color: null, rotate: 0, scale: 1, x: 0, y: 0, z: 10, kind: null, text: '灯河有信' },
        'event-date': { color: null, rotate: 0, scale: 1, x: 0, y: 0, z: 10, kind: null, text: '2026.08.19—08.21' },
        'event-image': { color: null, rotate: 0, scale: 1, x: 0, y: 0, z: 10, kind: null, text: null },
        'shape-1': { color: '#e4d2dc', rotate: 0, scale: 8.05, x: 97.1, y: 63.6, z: -4, kind: 'square', text: null },
    };
    const memorialEntryEditorDefaultLayout = {
        'entry-event-label': { asset: 'event-label', color: null, deleted: false, rotate: 0, scale: 1, x: 0, y: 0, z: 12, kind: null, text: '2026 · 七夕' },
        'entry-title': { asset: 'title', color: null, deleted: false, rotate: 0, scale: 1, x: 0, y: 0, z: 13, kind: null, text: null },
        'entry-date': { asset: 'date', color: null, deleted: false, rotate: 0, scale: 1, x: 0, y: 0, z: 12, kind: null, text: null },
        'entry-stickers': { asset: 'stickers', color: null, deleted: false, rotate: 0, scale: 1, x: 0, y: 0, z: 14, kind: null, text: null },
        'entry-hero': { asset: 'hero', color: null, deleted: false, rotate: 0, scale: 1, x: 0, y: 0, z: 6, kind: null, text: null },
        'entry-note': { asset: 'note', color: null, deleted: false, rotate: 0, scale: 1, x: 0, y: 0, z: 9, kind: null, text: null },
        'entry-secondary': { asset: 'secondary', color: null, deleted: false, rotate: 0, scale: 1, x: 0, y: 0, z: 8, kind: null, text: null },
    };
    const memorialBackdropSource = '/lingye/memorial/memorial-album-backdrop-v1.jpg';
    const memorialEditorStates = new Map();
    let memorialLayoutEditorEnabled = false;
    let memorialLayoutEditorTarget = 'index';
    let memorialLayoutEditorRestored = false;
    let memorialEditorSelected = null;
    let memorialEditorGesture = null;
    let memorialEditorShapeCount = 0;
    let memorialEditorAssetCount = 0;
    let memorialEditorSamplingColor = false;
    let memorialEditorSamplingTarget = null;
    let memorialBackdropImagePromise = null;

    function memorialEditorCanvas() {
        return memorialLayoutEditorTarget === 'entry' ? memorialEntry : memorialIndex;
    }

    function activeMemorialEditorDefaultLayout() {
        return memorialLayoutEditorTarget === 'entry' ? memorialEntryEditorDefaultLayout : memorialEditorDefaultLayout;
    }

    function createMemorialEditorShape(kind, id) {
        const shape = document.createElement('div');
        shape.className = 'candidate2-memorial-editor-shape is-' + kind;
        shape.dataset.memorialEditorId = id;
        shape.dataset.memorialEditorName = kind + ' ' + id.replace('shape-', '');
        shape.dataset.memorialEditorFill = '';
        shape.dataset.memorialEditorShape = kind;
        memorialIndex.append(shape);
        return shape;
    }

    function createMemorialEntryAsset(kind, id) {
        const legacyKind =
            kind === 'saved-lantern'
                ? 'my-lantern'
                : kind === 'saved-letter'
                  ? id === 'entry-asset-8'
                      ? 'du-letter'
                      : 'my-letter'
                  : kind;
        const source =
            memorialEntry.querySelector(
                '[data-memorial-editor-asset="' + legacyKind + '"][data-memorial-editor-asset-template]',
            ) ??
            memorialEntry.querySelector(
                '[data-memorial-editor-asset="' + legacyKind + '"]:not([data-memorial-editor-added])',
            );
        if (!source) return null;
        const asset = source.cloneNode(true);
        asset.dataset.memorialEditorAsset = legacyKind;
        asset.hidden = false;
        asset.classList.remove('is-memorial-editor-selected');
        asset.classList.add('candidate2-memorial-entry-added-asset');
        asset.dataset.memorialEditorId = id;
        delete asset.dataset.memorialEntryEditorId;
        delete asset.dataset.memorialEditorAssetTemplate;
        asset.dataset.memorialEditorAdded = '';
        asset.dataset.memorialEditorRemovable = '';
        asset.dataset.memorialEditorName = (source.dataset.memorialEditorName || legacyKind) + '副本';
        if (kind === 'event-label') asset.dataset.memorialEditorText = '';
        memorialEntry.append(asset);
        return asset;
    }

    function serializeMemorialEditorLayout() {
        const layout = {};
        memorialEditorCanvas().querySelectorAll('[data-memorial-editor-id]').forEach((element) => {
            const id = element.dataset.memorialEditorId;
            const state = memorialEditorState(element);
            layout[id] = {
                ...state,
                asset: element.dataset.memorialEditorAsset || null,
                deleted: Boolean(state.deleted),
                kind: element.dataset.memorialEditorShape || null,
                text: element.dataset.memorialEditorText === undefined ? null : element.textContent.trim(),
            };
        });
        return layout;
    }

    function saveMemorialEditorLayout() {
        if (!memorialLayoutEditorEnabled) return;
        try {
            const bytes = new TextEncoder().encode(JSON.stringify(serializeMemorialEditorLayout()));
            const encodedLayout = btoa(String.fromCharCode(...bytes));
            sendAction({ type: 'memorial-layout-save', encodedLayout });
            memorialEditorStatus.textContent = '已自动保存到当前预览地址。';
        } catch {
            memorialEditorStatus.textContent = '当前预览无法自动保存，请先复制布局。';
        }
    }

    function restoreMemorialEditorLayout(encodedLayout) {
        let savedLayout = null;
        try {
            if (encodedLayout) {
                const bytes = Uint8Array.from(atob(encodedLayout), (character) => character.charCodeAt(0));
                savedLayout = JSON.parse(new TextDecoder().decode(bytes));
            }
        } catch {}
        const layout = { ...activeMemorialEditorDefaultLayout(), ...(savedLayout || {}) };
        memorialEditorCanvas().querySelectorAll('[data-memorial-editor-added]').forEach((element) => element.remove());
        if (memorialLayoutEditorTarget === 'index') {
            memorialIndex.querySelectorAll('[data-memorial-editor-shape]').forEach((shape) => shape.remove());
        }
        memorialEditorStates.clear();
        memorialEditorShapeCount = 0;
        memorialEditorAssetCount = 0;
        Object.entries(layout).forEach(([id, value]) => {
            if (!value || typeof value !== 'object') return;
            let element = memorialEditorCanvas().querySelector('[data-memorial-editor-id="' + id + '"]');
            if (!element && value.kind && /^shape-\\d+$/.test(id)) {
                element = createMemorialEditorShape(value.kind, id);
                memorialEditorShapeCount = Math.max(memorialEditorShapeCount, Number.parseInt(id.slice(6), 10) || 0);
            }
            if (!element && value.asset && /^entry-asset-\\d+$/.test(id)) {
                element = createMemorialEntryAsset(value.asset, id);
                memorialEditorAssetCount = Math.max(memorialEditorAssetCount, Number.parseInt(id.slice(12), 10) || 0);
            }
            if (!element) return;
            const state = {
                color: typeof value.color === 'string' ? value.color : null,
                deleted: Boolean(value.deleted),
                rotate: Number.isFinite(value.rotate) ? value.rotate : 0,
                scale: Number.isFinite(value.scale) ? value.scale : 1,
                x: Number.isFinite(value.x) ? value.x : 0,
                y: Number.isFinite(value.y) ? value.y : 0,
                z: Number.isFinite(value.z) ? value.z : 10,
            };
            memorialEditorStates.set(id, state);
            if (element.dataset.memorialEditorText !== undefined && typeof value.text === 'string') {
                element.textContent = value.text;
            }
            applyMemorialEditorState(element);
        });
        memorialEditorStatus.textContent = savedLayout ? '已从当前预览地址恢复布局。' : '已载入当前定稿参数。';
    }

    function memorialEditorState(element) {
        const id = element.dataset.memorialEditorId;
        if (!memorialEditorStates.has(id)) {
            const computed = getComputedStyle(element);
            const parsedZ = Number.parseInt(computed.zIndex, 10);
            memorialEditorStates.set(id, {
                color: element.dataset.memorialEditorFill === undefined ? null : computed.backgroundColor,
                deleted: false,
                rotate: 0,
                scale: 1,
                x: 0,
                y: 0,
                z: Number.isFinite(parsedZ) ? parsedZ : 10,
            });
        }
        return memorialEditorStates.get(id);
    }

    function applyMemorialEditorState(element) {
        const state = memorialEditorState(element);
        element.hidden = Boolean(state.deleted);
        element.style.translate = state.x + 'px ' + state.y + 'px';
        element.style.scale = String(state.scale);
        element.style.rotate = state.rotate + 'deg';
        element.style.zIndex = String(state.z);
        if (state.color) {
            if (element.dataset.memorialEditorId === 'paper') {
                element.style.setProperty('--memorial-paper-fill', state.color);
            } else {
                element.style.backgroundColor = state.color;
            }
        }
    }

    function updateMemorialEditorSelection() {
        if (!memorialEditorSelected || !memorialLayoutEditorEnabled) {
            memorialEditorSelection.hidden = true;
            return;
        }
        const rect = memorialEditorSelected.getBoundingClientRect();
        const canvasRect = memorialPaper.getBoundingClientRect();
        const left = Math.max(0, rect.left - canvasRect.left);
        const top = Math.max(0, rect.top - canvasRect.top);
        const right = Math.min(canvasRect.width, rect.right - canvasRect.left);
        const bottom = Math.min(canvasRect.height, rect.bottom - canvasRect.top);
        memorialEditorSelection.hidden = false;
        memorialEditorSelection.style.left = left + 'px';
        memorialEditorSelection.style.top = top + 'px';
        memorialEditorSelection.style.width = Math.max(0, right - left) + 'px';
        memorialEditorSelection.style.height = Math.max(0, bottom - top) + 'px';
    }

    function selectMemorialEditorElement(element) {
        if (memorialEditorSelected) {
            memorialEditorSelected.classList.remove('is-memorial-editor-selected');
        }
        memorialEditorSelected = element;
        if (!element) {
            memorialEditorCurrent.textContent = '未选中';
            memorialEditorTextInput.value = '';
            memorialEditorTextInput.disabled = true;
            memorialEditorColorInput.disabled = true;
            memorialEditorEyeDropper.disabled = true;
            memorialEditorBackward.disabled = true;
            memorialEditorForward.disabled = true;
            memorialEditorDuplicate.disabled = true;
            memorialEditorDelete.disabled = true;
            updateMemorialEditorSelection();
            return;
        }
        element.classList.add('is-memorial-editor-selected');
        const state = memorialEditorState(element);
        const canEditText = element.dataset.memorialEditorText !== undefined;
        const canEditFill = element.dataset.memorialEditorFill !== undefined;
        memorialEditorCurrent.textContent = element.dataset.memorialEditorName || element.dataset.memorialEditorId;
        memorialEditorTextInput.disabled = !canEditText;
        memorialEditorTextInput.value = canEditText ? element.textContent.trim() : '';
        memorialEditorColorInput.disabled = !canEditFill;
        memorialEditorEyeDropper.disabled = !canEditFill;
        memorialEditorBackward.disabled = false;
        memorialEditorForward.disabled = false;
        memorialEditorDuplicate.disabled = memorialLayoutEditorTarget !== 'entry' || !element.dataset.memorialEditorAsset;
        memorialEditorDelete.disabled =
            element.dataset.memorialEditorShape === undefined &&
            element.dataset.memorialEditorRemovable === undefined;
        if (state.color && /^#[0-9a-f]{6}$/i.test(state.color)) {
            memorialEditorColorInput.value = state.color;
        }
        updateMemorialEditorSelection();
    }

    function setMemorialLayoutEditorEnabled(enabled, encodedLayout, applyLayout, target) {
        memorialLayoutEditorEnabled = enabled;
        memorialLayoutEditorTarget = target === 'entry' ? 'entry' : 'index';
        memorialEntry.querySelectorAll('[data-memorial-entry-editor-id]').forEach((element) => {
            if (memorialLayoutEditorTarget === 'entry') {
                element.dataset.memorialEditorId = element.dataset.memorialEntryEditorId;
            } else {
                delete element.dataset.memorialEditorId;
            }
        });
        memorialPage.classList.toggle('is-layout-editor', enabled);
        memorialPage.classList.toggle('is-entry-layout-editor', enabled && memorialLayoutEditorTarget === 'entry');
        memorialEditor.classList.toggle('is-entry-editor', memorialLayoutEditorTarget === 'entry');
        memorialEditorTitle.textContent = memorialLayoutEditorTarget === 'entry' ? '七夕内页自由编辑' : '纪念册自由编辑';
        memorialEditorAssets.hidden = memorialLayoutEditorTarget !== 'entry';
        memorialEditor.hidden = !enabled;
        if (enabled && memorialLayoutEditorTarget === 'entry') {
            openLingyeMemorialEntry();
        } else if (enabled) {
            closeLingyeMemorialEntry();
        }
        if (applyLayout && !memorialLayoutEditorRestored) {
            restoreMemorialEditorLayout(encodedLayout);
            memorialLayoutEditorRestored = true;
        }
        selectMemorialEditorElement(null);
    }

    function beginMemorialEditorGesture(event, mode, target) {
        if (!memorialLayoutEditorEnabled || !target) return;
        const state = memorialEditorState(target);
        const rect = target.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        memorialEditorGesture = {
            centerX,
            centerY,
            distance: Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
            mode,
            originRotate: state.rotate,
            originScale: state.scale,
            originX: state.x,
            originY: state.y,
            pointerId: event.pointerId,
            startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
            startX: event.clientX,
            startY: event.clientY,
            target,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    }

    function handleMemorialEditorPointerDown(event) {
        if (!memorialLayoutEditorEnabled) return;
        const target = event.target.closest('[data-memorial-editor-id]');
        if (target && !memorialEditorCanvas().contains(target)) return;
        if (!target) {
            selectMemorialEditorElement(null);
            return;
        }
        selectMemorialEditorElement(target);
        beginMemorialEditorGesture(event, 'move', target);
    }

    function blockMemorialEditorClick(event) {
        if (!memorialLayoutEditorEnabled) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    memorialIndex.addEventListener('pointerdown', handleMemorialEditorPointerDown);
    memorialEntry.addEventListener('pointerdown', handleMemorialEditorPointerDown);
    memorialIndex.addEventListener('click', blockMemorialEditorClick, true);
    memorialEntry.addEventListener('click', blockMemorialEditorClick, true);

    memorialEditorSelection.querySelector('[data-memorial-editor-handle="scale"]').addEventListener('pointerdown', (event) => {
        beginMemorialEditorGesture(event, 'scale', memorialEditorSelected);
    });

    memorialEditorSelection.querySelector('[data-memorial-editor-handle="rotate"]').addEventListener('pointerdown', (event) => {
        beginMemorialEditorGesture(event, 'rotate', memorialEditorSelected);
    });

    window.addEventListener('pointermove', (event) => {
        if (!memorialEditorGesture || memorialEditorGesture.pointerId !== event.pointerId) return;
        const state = memorialEditorState(memorialEditorGesture.target);
        if (memorialEditorGesture.mode === 'move') {
            state.x = Math.round((memorialEditorGesture.originX + event.clientX - memorialEditorGesture.startX) * 10) / 10;
            state.y = Math.round((memorialEditorGesture.originY + event.clientY - memorialEditorGesture.startY) * 10) / 10;
        } else if (memorialEditorGesture.mode === 'scale') {
            const nextDistance = Math.max(1, Math.hypot(event.clientX - memorialEditorGesture.centerX, event.clientY - memorialEditorGesture.centerY));
            state.scale = Math.max(0.1, Math.round(memorialEditorGesture.originScale * nextDistance / memorialEditorGesture.distance * 100) / 100);
        } else {
            const nextAngle = Math.atan2(event.clientY - memorialEditorGesture.centerY, event.clientX - memorialEditorGesture.centerX);
            state.rotate = Math.round((memorialEditorGesture.originRotate + (nextAngle - memorialEditorGesture.startAngle) * 180 / Math.PI) * 10) / 10;
        }
        applyMemorialEditorState(memorialEditorGesture.target);
        updateMemorialEditorSelection();
    });

    window.addEventListener('pointerup', (event) => {
        if (!memorialEditorGesture || memorialEditorGesture.pointerId !== event.pointerId) return;
        memorialEditorGesture = null;
        saveMemorialEditorLayout();
    });

    window.addEventListener('pointercancel', () => {
        memorialEditorGesture = null;
        saveMemorialEditorLayout();
    });

    memorialEditorTextInput.addEventListener('input', () => {
        if (!memorialEditorSelected || memorialEditorSelected.dataset.memorialEditorText === undefined) return;
        memorialEditorSelected.textContent = memorialEditorTextInput.value;
        updateMemorialEditorSelection();
        saveMemorialEditorLayout();
    });

    memorialEditorColorInput.addEventListener('input', () => {
        if (!memorialEditorSelected || memorialEditorSelected.dataset.memorialEditorFill === undefined) return;
        const state = memorialEditorState(memorialEditorSelected);
        state.color = memorialEditorColorInput.value;
        applyMemorialEditorState(memorialEditorSelected);
        saveMemorialEditorLayout();
    });

    function loadMemorialBackdropImage() {
        if (!memorialBackdropImagePromise) {
            memorialBackdropImagePromise = new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = reject;
                image.src = memorialBackdropSource;
            });
        }
        return memorialBackdropImagePromise;
    }

    async function resolveMemorialBackdropSamplePoint(clientX, clientY) {
        const image = await loadMemorialBackdropImage();
        const rect = memorialPaper.getBoundingClientRect();
        const scale = Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
        const renderedWidth = image.naturalWidth * scale;
        const offsetX = (rect.width - renderedWidth) / 2;
        const sourceX = Math.max(0, Math.min(image.naturalWidth - 1, (clientX - rect.left - offsetX) / scale));
        const sourceY = Math.max(0, Math.min(image.naturalHeight - 1, (clientY - rect.top) / scale));
        return {
            xRatio: sourceX / Math.max(1, image.naturalWidth - 1),
            yRatio: sourceY / Math.max(1, image.naturalHeight - 1),
        };
    }

    function beginMemorialBackdropSampling() {
        memorialEditorSamplingColor = true;
        memorialEditorSamplingTarget = memorialEditorSelected;
        memorialPage.classList.add('is-sampling-color');
        memorialEditorStatus.textContent = '请点击底图取色。';
    }

    memorialPaper.addEventListener('pointerdown', async (event) => {
        if (!memorialEditorSamplingColor || !memorialEditorSamplingTarget) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
            const point = await resolveMemorialBackdropSamplePoint(event.clientX, event.clientY);
            sendAction({ type: 'memorial-backdrop-color-sample', ...point });
            memorialEditorStatus.textContent = '正在读取底图颜色…';
        } catch {
            memorialEditorStatus.textContent = '这次没有取到颜色，请再点一次底图。';
            memorialEditorSamplingColor = false;
            memorialEditorSamplingTarget = null;
            memorialPage.classList.remove('is-sampling-color');
        }
    }, true);

    memorialEditorEyeDropper.addEventListener('click', async () => {
        if (!memorialEditorSelected) return;
        if ('EyeDropper' in window) {
            try {
                const result = await new window.EyeDropper().open();
                memorialEditorColorInput.value = result.sRGBHex;
                memorialEditorColorInput.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            } catch {}
        }
        beginMemorialBackdropSampling();
    });

    function shiftMemorialEditorLayer(element, direction) {
        const state = memorialEditorState(element);
        const otherLayers = Array.from(memorialEditorCanvas().querySelectorAll('[data-memorial-editor-id]'))
            .filter((candidate) => candidate !== element && !memorialEditorState(candidate).deleted)
            .map((candidate) => memorialEditorState(candidate).z);
        if (direction < 0) {
            const lowerLayers = otherLayers.filter((layer) => layer < state.z);
            state.z = lowerLayers.length ? Math.max(...lowerLayers) - 1 : state.z - 1;
        } else {
            const higherLayers = otherLayers.filter((layer) => layer > state.z);
            state.z = higherLayers.length ? Math.min(...higherLayers) + 1 : state.z + 1;
        }
        applyMemorialEditorState(element);
        saveMemorialEditorLayout();
        memorialEditorStatus.textContent = '当前视觉层级 ' + state.z + '。';
    }

    memorialEditorBackward.addEventListener('click', () => {
        if (!memorialEditorSelected) return;
        shiftMemorialEditorLayer(memorialEditorSelected, -1);
    });

    memorialEditorForward.addEventListener('click', () => {
        if (!memorialEditorSelected) return;
        shiftMemorialEditorLayer(memorialEditorSelected, 1);
    });

    memorialEditorDelete.addEventListener('click', () => {
        if (!memorialEditorSelected) return;
        const canDelete =
            memorialEditorSelected.dataset.memorialEditorShape !== undefined ||
            memorialEditorSelected.dataset.memorialEditorRemovable !== undefined;
        if (!canDelete) return;
        if (memorialLayoutEditorTarget === 'entry') {
            memorialEditorState(memorialEditorSelected).deleted = true;
            applyMemorialEditorState(memorialEditorSelected);
        } else {
            memorialEditorStates.delete(memorialEditorSelected.dataset.memorialEditorId);
            memorialEditorSelected.remove();
        }
        selectMemorialEditorElement(null);
        saveMemorialEditorLayout();
    });

    memorialEditor.querySelectorAll('[data-memorial-add-shape]').forEach((button) => {
        button.addEventListener('click', () => {
            memorialEditorShapeCount += 1;
            const kind = button.dataset.memorialAddShape;
            const shape = createMemorialEditorShape(kind, 'shape-' + memorialEditorShapeCount);
            applyMemorialEditorState(shape);
            selectMemorialEditorElement(shape);
            saveMemorialEditorLayout();
        });
    });

    memorialEditor.querySelectorAll('[data-memorial-add-asset]').forEach((button) => {
        button.addEventListener('click', () => {
            if (memorialLayoutEditorTarget !== 'entry') return;
            memorialEditorAssetCount += 1;
            const id = 'entry-asset-' + memorialEditorAssetCount;
            const asset = createMemorialEntryAsset(button.dataset.memorialAddAsset, id);
            if (!asset) return;
            memorialEditorStates.set(id, {
                color: null,
                deleted: false,
                rotate: 0,
                scale: 1,
                x: memorialEditorAssetCount * 4,
                y: memorialEditorAssetCount * 4,
                z: 20 + memorialEditorAssetCount,
            });
            applyMemorialEditorState(asset);
            selectMemorialEditorElement(asset);
            saveMemorialEditorLayout();
        });
    });

    memorialEditorDuplicate.addEventListener('click', () => {
        if (memorialLayoutEditorTarget !== 'entry' || !memorialEditorSelected) return;
        const kind = memorialEditorSelected.dataset.memorialEditorAsset;
        if (!kind) return;
        memorialEditorAssetCount += 1;
        const id = 'entry-asset-' + memorialEditorAssetCount;
        const asset = createMemorialEntryAsset(kind, id);
        if (!asset) return;
        const sourceState = memorialEditorState(memorialEditorSelected);
        memorialEditorStates.set(id, {
            color: sourceState.color,
            deleted: false,
            rotate: sourceState.rotate,
            scale: sourceState.scale,
            x: sourceState.x + 12,
            y: sourceState.y + 12,
            z: sourceState.z + 1,
        });
        if (asset.dataset.memorialEditorText !== undefined) {
            asset.textContent = memorialEditorSelected.textContent;
        }
        applyMemorialEditorState(asset);
        selectMemorialEditorElement(asset);
        saveMemorialEditorLayout();
    });

    memorialEditorToggle.addEventListener('click', () => {
        const collapsed = memorialEditor.classList.toggle('is-collapsed');
        memorialEditorToggle.textContent = collapsed ? '展开' : '收起';
    });

    memorialEditorCopy.addEventListener('click', async () => {
        const value = JSON.stringify(serializeMemorialEditorLayout());
        try {
            await navigator.clipboard.writeText(value);
            memorialEditorStatus.textContent = '布局参数已复制。';
        } catch {
            memorialEditorStatus.textContent = value;
        }
    });

    const glimmerTrackAssets = {
        'duck_peach': '/lingye/glimmer/tracks/duck-peach.png',
        'turkey_maple': '/lingye/glimmer/tracks/turkey-maple.png',
        'silk_moth_mist': '/lingye/glimmer/tracks/silk-moth-mist.png',
    };

    const lingyeViewport = document.querySelector('.candidate2-lingye-viewport');
    let lingyeDragging = false;
    let lingyeDragStartX = 0;
    let lingyeDragStartScrollLeft = 0;

    lingyeViewport.addEventListener('pointerdown', (event) => {
        if (event.target.closest('.candidate2-lingye-place, .candidate2-lingye-together')) return;
        lingyeDragging = true;
        lingyeDragStartX = event.clientX;
        lingyeDragStartScrollLeft = lingyeViewport.scrollLeft;
        lingyeViewport.classList.add('is-dragging');
        lingyeViewport.setPointerCapture(event.pointerId);
    });

    lingyeViewport.addEventListener('pointermove', (event) => {
        if (!lingyeDragging) return;
        lingyeViewport.scrollLeft = lingyeDragStartScrollLeft - (event.clientX - lingyeDragStartX);
    });

    function finishLingyeDrag(event) {
        if (!lingyeDragging) return;
        lingyeDragging = false;
        lingyeViewport.classList.remove('is-dragging');
        if (lingyeViewport.hasPointerCapture(event.pointerId)) {
            lingyeViewport.releasePointerCapture(event.pointerId);
        }
    }

    lingyeViewport.addEventListener('pointerup', finishLingyeDrag);
    lingyeViewport.addEventListener('pointercancel', finishLingyeDrag);

    lingyeViewport.addEventListener('wheel', (event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        lingyeViewport.scrollLeft += event.deltaY;
        event.preventDefault();
    }, { passive: false });

    const institutionViewports = document.querySelectorAll('.candidate2-institution-scene-viewport');
    institutionViewports.forEach((viewport) => {
        let dragging = false;
        let dragStartX = 0;
        let dragStartScrollLeft = 0;

        viewport.addEventListener('pointerdown', (event) => {
            dragging = true;
            dragStartX = event.clientX;
            dragStartScrollLeft = viewport.scrollLeft;
            viewport.classList.add('is-dragging');
            viewport.setPointerCapture(event.pointerId);
        });

        viewport.addEventListener('pointermove', (event) => {
            if (!dragging) return;
            viewport.scrollLeft = dragStartScrollLeft - (event.clientX - dragStartX);
        });

        function finishInstitutionDrag(event) {
            if (!dragging) return;
            dragging = false;
            viewport.classList.remove('is-dragging');
            if (viewport.hasPointerCapture(event.pointerId)) {
                viewport.releasePointerCapture(event.pointerId);
            }
        }

        viewport.addEventListener('pointerup', finishInstitutionDrag);
        viewport.addEventListener('pointercancel', finishInstitutionDrag);
        viewport.addEventListener('wheel', (event) => {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            viewport.scrollLeft += event.deltaY;
            event.preventDefault();
        }, { passive: false });
    });

`;

const CANDIDATE_RUNTIME_SCRIPT = `
    const credentialsForm = document.getElementById('credentials-form');
    const profileForm = document.getElementById('profile-form');
    const credentialsStatus = document.querySelector('.credentials-status');
    const profileStatus = document.querySelector('.profile-status');
    const farmConfirmation = document.getElementById('farm-confirmation');
    const farmName = document.getElementById('farm-name');
    const farmDoorplateResult = document.getElementById('farm-doorplate-result');
    const farmDoorplateInput = document.getElementById('farm-doorplate');
    const farmHumanUrlInput = document.getElementById('farm-human-url');
    const confirmFarmInput = document.getElementById('confirm-farm');
    const farmLookupButton = document.getElementById('farm-lookup-button');
    const profileSubmitButton = profileForm.querySelector('button[type="submit"]');
    const mainNav = document.getElementById('main-nav');
    const settingsFeedback = document.querySelector('.candidate2-settings-feedback');
    const settingsProfilesSection = document.querySelector('.candidate2-settings-profiles');
    const settingsProfileSelect = document.querySelector('.settings-profile-select');
    const settingsAddProfileButton = document.getElementById('settings-add-profile');
    const sharedMemesOpenButton = document.getElementById('settings-shared-memes-open');
    const sharedMemeAddFromSettingsButton = document.getElementById('settings-shared-meme-add');
    const sharedMemesBackButton = document.getElementById('shared-memes-back');
    const sharedMemesSearch = document.getElementById('shared-memes-search');
    const sharedMemeAddOpenButton = document.getElementById('shared-meme-add-open');
    const sharedMemeAddForm = document.getElementById('shared-meme-add-form');
    const sharedMemeAddCloseButton = document.getElementById('shared-meme-add-close');
    const sharedMemeSubmitButton = sharedMemeAddForm.querySelector('button[type="submit"]');
    const sharedMemeFormStatus = document.querySelector('.shared-meme-form-status');
    const sharedMemesStatus = document.querySelector('.shared-memes-status');
    const sharedMemesList = document.querySelector('.candidate2-shared-meme-list');
    const sharedMemeDetail = document.querySelector('.candidate2-shared-meme-detail');
    const sharedMemeDetailCloseButton = document.getElementById('shared-meme-detail-close');
    const settingsHomeName = document.querySelector('.settings-home-name');
    const settingsEnvironment = document.querySelector('.settings-environment');
    const settingsClimate = document.querySelector('.settings-climate');
    const settingsPauseAllWakeups = document.querySelector('.settings-pause-all-wakeups');
    const settingsVisitNotifications = document.querySelector('.settings-visit-notifications');
    const settingsActivityNotifications = document.querySelector('.settings-activity-notifications');
    const settingsSystemNotifications = document.querySelector('.settings-system-notifications');
    const settingsBrowserNotifications = document.querySelector('.settings-browser-notifications');
    const settingsActivityReminders = document.querySelector('.settings-activity-reminders');
    const settingsSharedMemeUpdates = document.querySelector('.settings-shared-meme-updates');
    const settingsLoungeDuration = document.querySelector('.settings-lounge-duration');
    const settingsInitialMessageCount = document.querySelector('.settings-initial-message-count');
    const settingsChatMode = document.querySelector('.settings-chat-mode');
    const settingsActivityRoomWarmup = document.querySelector('.settings-activity-room-warmup');
    const relationshipEditButton = document.getElementById('profile-relationship-edit');
    const relationshipEditor = document.getElementById('profile-relationship-editor');
    const relationshipCancelButton = document.getElementById('profile-relationship-cancel');
    let currentFarmName = '';
    let currentFarmDoorplate = '';
    let currentStage = 'checking-session';
    let visibleSharedMemes = [];
    let settingsSaveScope = '';
    let settingsWasSaving = '';
    let permitTimer = 0;
    const homeScaleShell = document.querySelector('.candidate2-home-scale-shell');
    const homeDesignCanvas = document.querySelector('.candidate2-home-design-canvas');
    const homeDesignWidth = 430;
    const profileScaleShell = document.querySelector('.candidate2-profile-scale-shell');
    const profileDesignCanvas = document.querySelector('.candidate2-profile-design-canvas');
    const profileDesignWidth = 402;
    const candidateNoticeModal = document.querySelector('.candidate2-notice-modal');
    const candidateNoticeDesignCanvas = document.querySelector('.candidate2-notice-design-canvas');
    const candidateNoticeMessage = document.getElementById('candidate2-notice-message');
    const candidateNoticeConfirm = document.querySelector('.candidate2-notice-confirm');
    const candidateNoticeDesignWidth = 430;
    let candidateNoticeReturnFocus = null;

    function syncCandidateNoticeScale() {
        const availableWidth = candidateNoticeModal.clientWidth;
        if (availableWidth <= 0) return;
        const scale = Math.min(1, availableWidth / candidateNoticeDesignWidth);
        candidateNoticeDesignCanvas.style.setProperty('--candidate2-notice-scale', String(scale));
    }

    const candidateNoticeScaleObserver = new ResizeObserver(syncCandidateNoticeScale);
    candidateNoticeScaleObserver.observe(candidateNoticeModal);

    function showCandidateNotice(message) {
        if (!message) return;
        candidateNoticeReturnFocus = document.activeElement;
        candidateNoticeMessage.textContent = message;
        candidateNoticeModal.hidden = false;
        syncCandidateNoticeScale();
        candidateNoticeConfirm.focus();
    }

    function closeCandidateNotice() {
        if (candidateNoticeModal.hidden) return;
        candidateNoticeModal.hidden = true;
        candidateNoticeMessage.textContent = '';
        if (candidateNoticeReturnFocus instanceof HTMLElement) candidateNoticeReturnFocus.focus();
        candidateNoticeReturnFocus = null;
    }

    function syncHomeScale() {
        const availableWidth = homeScaleShell.clientWidth;
        if (availableWidth <= 0) return;
        const scale = Math.min(1, availableWidth / homeDesignWidth);
        homeDesignCanvas.style.setProperty('--candidate2-home-scale', String(scale));
    }

    const homeScaleObserver = new ResizeObserver(syncHomeScale);
    homeScaleObserver.observe(homeScaleShell);
    window.addEventListener('resize', syncHomeScale);

    function syncProfileScale() {
        const availableWidth = profileScaleShell.clientWidth;
        if (availableWidth <= 0) return;
        const scale = Math.min(1, availableWidth / profileDesignWidth);
        profileDesignCanvas.style.setProperty('--candidate2-profile-scale', String(scale));
    }

    const profileScaleObserver = new ResizeObserver(syncProfileScale);
    profileScaleObserver.observe(profileScaleShell);
    window.addEventListener('resize', syncProfileScale);

    function sendAction(action) {
        window.parent.postMessage(action, '*');
    }

    function setStatus(element, message) {
        element.textContent = typeof message === 'string' ? message : '';
    }

    function setFormDisabled(form, disabled) {
        form.querySelectorAll('button, input').forEach((control) => {
            control.disabled = disabled;
        });
    }

    function setHomeSettingsDisabled(disabled) {
        [
            settingsHomeName,
            settingsProfileSelect,
            settingsEnvironment,
            settingsClimate,
            settingsPauseAllWakeups,
            settingsVisitNotifications,
            settingsActivityNotifications,
            settingsSystemNotifications,
            settingsBrowserNotifications,
            settingsActivityReminders,
            settingsSharedMemeUpdates,
            settingsLoungeDuration,
            settingsInitialMessageCount,
            settingsChatMode,
            settingsActivityRoomWarmup,
        ].forEach((control) => {
            control.disabled = disabled;
        });
        settingsAddProfileButton.disabled = disabled;
    }

    function applyHomeSettings(homeSettings, pending, issueMessage) {
        if (homeSettings.stage === 'loading') {
            document.querySelector('.settings-connection-summary').textContent = '正在读取';
            document.querySelector('.settings-wake-state').textContent = '正在读取';
            setHomeSettingsDisabled(true);
            return;
        }
        if (homeSettings.stage === 'error') {
            document.querySelector('.settings-connection-summary').textContent = '读取失败';
            document.querySelector('.settings-wake-state').textContent = '读取失败';
            setHomeSettingsDisabled(true);
            setStatus(settingsFeedback, homeSettings.message);
            return;
        }

        settingsHomeName.value = homeSettings.homeName;
        settingsProfilesSection.hidden = homeSettings.profileSwitcher === null;
        settingsProfileSelect.replaceChildren();
        if (homeSettings.profileSwitcher) {
            for (const profile of homeSettings.profileSwitcher.profiles) {
                const option = document.createElement('option');
                option.value = profile.profileId;
                option.textContent = profile.residentName + ' · ' + profile.farmDoorplate;
                settingsProfileSelect.append(option);
            }
            settingsProfileSelect.value = homeSettings.profileSwitcher.activeProfileId;
        }
        settingsEnvironment.value = homeSettings.environmentDescription || '';
        settingsClimate.value = homeSettings.climateType || '';
        settingsPauseAllWakeups.checked = homeSettings.pauseAllWakeups;
        settingsVisitNotifications.checked = homeSettings.visitRequestsAndInvitationsEnabled;
        settingsActivityNotifications.checked = homeSettings.activityInvitationsEnabled;
        settingsSystemNotifications.checked = homeSettings.importantSystemNotificationsEnabled;
        settingsBrowserNotifications.checked = homeSettings.browserNotificationsEnabled;
        settingsActivityReminders.checked = homeSettings.activityRemindersEnabled;
        settingsSharedMemeUpdates.checked = homeSettings.sharedMemeUpdateSignalsEnabled;
        settingsLoungeDuration.value = String(homeSettings.defaultConnectionDurationMinutes);
        settingsInitialMessageCount.value = homeSettings.initialRecentActivityCount === null
            ? ''
            : String(homeSettings.initialRecentActivityCount);
        settingsChatMode.value = homeSettings.chatMode;
        settingsActivityRoomWarmup.checked = homeSettings.allowActivityRoomWarmup;
        const wakeLabels = {
            not_configured: '尚未配置',
            offline: '已离线',
            online: '连接正常',
        };
        const wakeLabel = wakeLabels[homeSettings.wakeBridgeStatus];
        document.querySelector('.settings-connection-summary').textContent = wakeLabel;
        document.querySelector('.settings-wake-state').textContent = wakeLabel;
        document.querySelector('.settings-wake-dot').style.background =
            homeSettings.wakeBridgeStatus === 'online' ? '#9dbcae' : '#c9b9ae';
        settingsHomeName.dataset.savedValue = settingsHomeName.value;
        settingsEnvironment.dataset.savedValue = settingsEnvironment.value;
        settingsClimate.dataset.savedValue = settingsClimate.value;
        settingsPauseAllWakeups.dataset.savedValue = String(settingsPauseAllWakeups.checked);
        settingsVisitNotifications.dataset.savedValue = String(settingsVisitNotifications.checked);
        settingsActivityNotifications.dataset.savedValue = String(settingsActivityNotifications.checked);
        settingsSystemNotifications.dataset.savedValue = String(settingsSystemNotifications.checked);
        settingsBrowserNotifications.dataset.savedValue = String(settingsBrowserNotifications.checked);
        settingsActivityReminders.dataset.savedValue = String(settingsActivityReminders.checked);
        settingsSharedMemeUpdates.dataset.savedValue = String(settingsSharedMemeUpdates.checked);
        settingsLoungeDuration.dataset.savedValue = settingsLoungeDuration.value;
        settingsInitialMessageCount.dataset.savedValue = settingsInitialMessageCount.value;
        settingsChatMode.dataset.savedValue = settingsChatMode.value;
        settingsActivityRoomWarmup.dataset.savedValue = String(settingsActivityRoomWarmup.checked);
        document.querySelector('.home-name').textContent = homeSettings.homeName;
        document.querySelector('.home-weather-summary').lastChild.textContent = homeSettings.weatherSummary;
        setHomeSettingsDisabled(pending);
        settingsBrowserNotifications.disabled = pending || !homeSettings.browserNotificationsAvailable;
        settingsActivityReminders.disabled = pending || !homeSettings.browserNotificationsAvailable;

        if (pending) {
            settingsWasSaving = settingsSaveScope || 'home';
            setStatus(
                settingsFeedback,
                settingsWasSaving === 'home' ? '正在保存家园设置……' : '正在保存偏好设置……',
            );
        } else if (settingsWasSaving) {
            setStatus(
                settingsFeedback,
                issueMessage || (settingsWasSaving === 'home' ? '家园设置已保存' : '偏好设置已保存'),
            );
            settingsSaveScope = '';
            settingsWasSaving = '';
        } else if (issueMessage) {
            setStatus(settingsFeedback, issueMessage);
        }
    }

    function renderSharedMemeList() {
        const query = sharedMemesSearch.value.trim().toLowerCase();
        const matching = query
            ? visibleSharedMemes.filter((meme) =>
                [meme.term, meme.meaning, meme.usage, ...meme.aliases, ...meme.keywords]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(query)))
            : visibleSharedMemes;
        sharedMemesList.replaceChildren(...matching.map((meme) => {
            const button = document.createElement('button');
            button.className = 'candidate2-shared-meme-row';
            button.type = 'button';
            button.dataset.memeId = String(meme.meme_id);
            const term = document.createElement('strong');
            term.textContent = meme.term;
            const meta = document.createElement('small');
            meta.textContent = [meme.category, meme.type].filter(Boolean).join(' · ') || '未分类';
            button.append(term, meta);
            button.addEventListener('click', () => {
                sendAction({ type: 'shared-meme-open', memeId: meme.meme_id });
            });
            return button;
        }));
        setStatus(sharedMemesStatus, matching.length === 0 ? '没有找到匹配的共享梗。' : '');
    }

    function applySharedMemeDetail(detail) {
        if (detail.stage === 'idle') {
            sharedMemeDetail.hidden = true;
            return;
        }
        sharedMemeDetail.hidden = false;
        if (detail.stage === 'loading') {
            document.querySelector('.shared-meme-detail-term').textContent = '正在读取……';
            document.querySelector('.shared-meme-detail-meta').textContent = '';
            return;
        }
        if (detail.stage === 'error') {
            document.querySelector('.shared-meme-detail-term').textContent = '读取失败';
            document.querySelector('.shared-meme-detail-meta').textContent = detail.message;
            return;
        }
        const meme = detail.data.meme;
        document.querySelector('.shared-meme-detail-term').textContent = meme.term;
        document.querySelector('.shared-meme-detail-meta').textContent =
            [meme.category, meme.type].filter(Boolean).join(' · ') || '未分类';
        document.querySelector('.shared-meme-detail-meaning').textContent = meme.meaning || '—';
        document.querySelector('.shared-meme-detail-usage').textContent = meme.usage || '—';
        document.querySelector('.shared-meme-detail-aliases').textContent = meme.aliases.join('、') || '—';
        document.querySelector('.shared-meme-detail-examples').textContent = meme.examples.join('\\n') || '—';
        document.querySelector('.shared-meme-detail-keywords').textContent = meme.keywords.join('、') || '—';
        document.querySelector('.shared-meme-detail-origin').textContent = meme.origin || '—';
        document.querySelector('.shared-meme-detail-notes').textContent = meme.notes || '—';
        sharedMemeDetail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function applySharedMemeState(list, detail, createPending, createMessage) {
        const settingsCount = document.querySelector('.settings-meme-count');
        const settingsSync = document.querySelector('.settings-meme-sync');
        sharedMemeSubmitButton.disabled = createPending;
        setStatus(sharedMemeFormStatus, createPending ? '正在提交……' : createMessage);
        applySharedMemeDetail(detail);

        if (list.stage === 'idle') {
            settingsCount.textContent = '尚未读取';
            settingsSync.textContent = '点击 View 读取';
            visibleSharedMemes = [];
            sharedMemesList.replaceChildren();
            setStatus(sharedMemesStatus, '');
            return;
        }
        if (list.stage === 'loading') {
            settingsCount.textContent = '读取中';
            settingsSync.textContent = '正在核验资格';
            setStatus(sharedMemesStatus, '正在读取共享梗库……');
            return;
        }
        if (list.stage === 'error') {
            settingsCount.textContent = '读取失败';
            settingsSync.textContent = list.message;
            visibleSharedMemes = [];
            sharedMemesList.replaceChildren();
            setStatus(sharedMemesStatus, list.message);
            return;
        }
        visibleSharedMemes = list.data.memes;
        settingsCount.textContent = String(list.data.library.entry_count);
        settingsSync.textContent = '版本 ' + list.data.library.library_version;
        document.querySelector('.shared-memes-summary').textContent =
            list.data.library.entry_count + ' 条共享内容 · 版本 ' + list.data.library.library_version;
        renderSharedMemeList();
    }

    function openSharedMemePage(showForm) {
        showScreen('screen-shared-memes');
        sharedMemeAddForm.hidden = !showForm;
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示模式不会读取或新增真实共享梗');
            return;
        }
        sendAction({ type: 'shared-memes-open' });
        if (showForm) sharedMemeAddForm.elements.term.focus();
    }

    function optionalSharedMemeText(formData, name) {
        const value = String(formData.get(name) || '').trim();
        return value || null;
    }

    function sharedMemeLines(formData, name) {
        return String(formData.get(name) || '')
            .split(/\\r?\\n/)
            .map((value) => value.trim())
            .filter(Boolean);
    }

    function saveHomeSetting(field, control) {
        if (control.value === control.dataset.savedValue) return;
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示模式不会保存真实家园设置');
            return;
        }
        settingsSaveScope = 'home';
        sendAction({ type: 'home-settings-save', field, value: control.value });
    }

    function saveNotificationPreference(field, control) {
        const value = control.checked;
        if (String(value) === control.dataset.savedValue) return;
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示设置已更新（不会保存）');
            return;
        }
        settingsSaveScope = 'preferences';
        sendAction({ type: 'notification-preference-save', field, value });
    }

    function saveSharedDataPreference(field, control) {
        const value = control.checked;
        if (String(value) === control.dataset.savedValue) return;
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示设置已更新（不会保存）');
            return;
        }
        settingsSaveScope = 'preferences';
        sendAction({ type: 'shared-data-preference-save', field, value });
    }

    function saveBrowserNotificationPreference(field, control) {
        const value = control.checked;
        if (String(value) === control.dataset.savedValue) return;
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示设置已更新（不会保存）');
            return;
        }
        settingsSaveScope = 'preferences';
        sendAction({ type: 'browser-notification-preference-save', field, value });
    }

    function saveCommunityBooleanPreference(field, control) {
        const value = control.checked;
        if (String(value) === control.dataset.savedValue) return;
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示设置已更新（不会保存）');
            return;
        }
        settingsSaveScope = 'preferences';
        sendAction({ type: 'community-connection-preference-save', field, value });
    }

    function saveCommunityNumberPreference(field, control) {
        if (!control.checkValidity()) {
            control.reportValidity();
            return;
        }
        if (control.value === control.dataset.savedValue) return;
        const value = control.value === '' ? null : Number(control.value);
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示设置已更新（不会保存）');
            return;
        }
        settingsSaveScope = 'preferences';
        sendAction({ type: 'community-connection-preference-save', field, value });
    }

    function saveCommunityChatMode(control) {
        if (control.value === control.dataset.savedValue) return;
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示设置已更新（不会保存）');
            return;
        }
        settingsSaveScope = 'preferences';
        sendAction({
            type: 'community-connection-preference-save',
            field: 'chatMode',
            value: control.value,
        });
    }

    function resetFarmConfirmation() {
        currentFarmName = '';
        currentFarmDoorplate = '';
        confirmFarmInput.checked = false;
        farmConfirmation.hidden = true;
        updateProfileSubmitState();
    }

    function updateProfileSubmitState() {
        profileSubmitButton.disabled = profileForm.dataset.pending === 'true';
    }

    function applyIdentity(identity) {
        const doorplate = 'DB-' + identity.farmDoorplate;
        document.querySelector('.permit-resident-name').textContent = identity.residentName;
        document.querySelector('.permit-home-name').textContent = identity.homeName;
        document.querySelector('.permit-doorplate-value').textContent = doorplate;
        document.querySelector('.home-name').textContent = identity.homeName;
        document.querySelector('.profile-resident-name').textContent = identity.residentName;
        document.querySelector('.profile-relation-core-name').textContent = identity.residentName;
        document.querySelector('.profile-home-name').textContent = identity.homeName;
        document.querySelector('.profile-doorplate').textContent = doorplate;
        document.querySelector('.profile-farm-doorplate').textContent = identity.farmDoorplate;
        document.querySelector('.settings-home-name').value = identity.homeName;
    }

    function setDemoVisibility(emptySelector, demoSelector, enabled) {
        const emptyElement = document.querySelector(emptySelector);
        const demoElement = document.querySelector(demoSelector);
        if (emptyElement) emptyElement.hidden = enabled;
        if (demoElement) demoElement.hidden = !enabled;
    }

    function buildGlimmerTrackFigure(animal) {
        const figure = document.createElement('figure');
        figure.dataset.glimmerAnimalId = animal.revealed ? animal.id : animal.layoutId;
        figure.dataset.glimmerDragTarget = 'group';
        const visual = document.createElement('span');
        visual.className = 'candidate2-glimmer-animal-visual';
        if (animal.revealed === false) {
            visual.classList.add('is-mystery');
            visual.setAttribute('role', 'img');
            visual.setAttribute('aria-label', '未揭晓动物');
            visual.textContent = '?';
        } else {
            const trackAsset = glimmerTrackAssets[animal.id];
            if (animal.atlas === 'glimmer.variants' && animal.set && animal.spriteIndex != null) {
                const column = animal.spriteIndex % 5;
                const row = Math.floor(animal.spriteIndex / 5);
                visual.classList.add('candidate2-glimmer-variant-visual');
                visual.setAttribute('role', 'img');
                visual.setAttribute('aria-label', animal.name + '异色动物图');
                visual.style.setProperty(
                    '--glimmer-variant-sheet',
                    "url('/lingye/glimmer/variants/variant-" + animal.set + ".webp')",
                );
                visual.style.setProperty('--glimmer-variant-x', column * 25 + '%');
                visual.style.setProperty('--glimmer-variant-y', row * 100 / 3 + '%');
            } else if (trackAsset) {
                const image = document.createElement('img');
                image.src = trackAsset;
                image.alt = animal.name + '异色动物图';
                image.width = 200;
                image.height = 200;
                image.draggable = false;
                visual.append(image);
            } else {
                visual.classList.add('is-mystery');
                visual.setAttribute('role', 'img');
                visual.setAttribute('aria-label', '已揭晓动物');
                visual.textContent = '?';
            }
        }
        figure.append(visual);
        if (animal.revealed) {
            const caption = document.createElement('figcaption');
            const name = document.createElement('strong');
            name.textContent = animal.name;
            caption.append(name);
            figure.append(caption);
        }
        return figure;
    }

    function buildGlimmerVariantFigure(variant) {
        const figure = document.createElement('figure');
        const visual = document.createElement('span');
        const unlocked = variant.unlocked !== false;
        const column = variant.spriteIndex % 5;
        const row = Math.floor(variant.spriteIndex / 5);
        visual.className = 'candidate2-glimmer-animal-visual candidate2-glimmer-variant-visual';
        visual.setAttribute('role', 'img');
        figure.dataset.glimmerUnlocked = String(unlocked);
        visual.setAttribute('aria-label', variant.name + '异色动物图' + (unlocked ? '' : '（未解锁）'));
        if (variant.atlas !== undefined && variant.atlas !== 'glimmer.variants') {
            visual.classList.add('is-mystery');
            visual.textContent = '?';
        } else {
            visual.style.setProperty(
                '--glimmer-variant-sheet',
                "url('/lingye/glimmer/variants/variant-" + variant.set + ".webp')",
            );
        }
        visual.style.setProperty('--glimmer-variant-x', column * 25 + '%');
        visual.style.setProperty('--glimmer-variant-y', row * 100 / 3 + '%');
        const caption = document.createElement('figcaption');
        const name = document.createElement('strong');
        name.textContent = variant.name;
        caption.append(name);
        figure.append(visual, caption);
        return figure;
    }

    const togetherCoverAssets = {
        'together.river-from-tomorrow-opening': '/lingye/together/river-opening.webp',
        'together.river-future-wharf': '/lingye/together/river-future-wharf.webp',
        'together.river-cooperative-investigation': '/lingye/together/river-investigation.webp',
        'together.river-fork': '/lingye/together/river-fork.webp',
        'together.river-ending-second-home': '/lingye/together/river-ending-second-home.webp',
        'together.river-ending-quiet-harvest': '/lingye/together/river-ending-quiet-harvest.webp',
        'together.river-ending-ten-thousand-bottles': '/lingye/together/river-ending-ten-thousand-bottles.webp',
        'together.river-ending-no-address': '/lingye/together/river-ending-no-address.webp',
        'together.same-kitchen-opening': '/lingye/together/same-kitchen-opening.jpg',
        'together.same-kitchen-old-recipe': '/lingye/together/same-kitchen-old-recipe.jpg',
        'together.same-kitchen-undelivered-letters': '/lingye/together/same-kitchen-undelivered-letters.jpg',
        'together.same-kitchen-service': '/lingye/together/same-kitchen-service.jpg',
        'together.same-kitchen-final-arrangement': '/lingye/together/same-kitchen-final-arrangement.jpg',
        'together.same-kitchen-ending-one-sign': '/lingye/together/same-kitchen-ending-one-sign.jpg',
        'together.same-kitchen-ending-next-door': '/lingye/together/same-kitchen-ending-next-door.jpg',
        'together.same-kitchen-ending-public-kitchen': '/lingye/together/same-kitchen-ending-public-kitchen.jpg',
    };

    function setTogetherText(selector, value) {
        const element = document.querySelector(selector);
        if (element) element.textContent = value == null ? '' : String(value);
    }

    let togetherArchives = [];
    let togetherArchiveIndex = -1;
    let togetherArchivePageIndex = 0;

    function buildTogetherArchiveIndexCard(archive, index) {
        const button = document.createElement('button');
        button.className = 'candidate2-together-archive-index-card';
        button.type = 'button';
        button.addEventListener('click', () => openTogetherArchive(index));

        const image = document.createElement('img');
        image.className = 'candidate2-together-archive-index-photo';
        image.src = togetherCoverAssets[archive.artFile] || '';
        image.alt = '《' + archive.title + '》往期插图';
        const copy = document.createElement('span');
        copy.className = 'candidate2-together-archive-index-copy';
        const round = document.createElement('span');
        round.className = 'candidate2-together-archive-index-round';
        round.textContent = '第 ' + archive.round + ' 期';
        const title = document.createElement('strong');
        title.className = 'candidate2-together-archive-index-title';
        title.textContent = archive.title;
        const ending = [...archive.history].reverse().find((entry) => entry.kind === 'ending');
        const endingText = document.createElement('span');
        endingText.className = 'candidate2-together-archive-index-ending';
        endingText.textContent = ending ? ending.title : archive.history.at(-1)?.title || '';
        copy.append(round, title, endingText);
        const chevron = document.createElement('span');
        chevron.className = 'candidate2-together-archive-index-chevron';
        chevron.textContent = '›';
        button.append(image, copy, chevron);
        return button;
    }

    function renderTogetherArchivePage() {
        const archive = togetherArchives[togetherArchiveIndex];
        const entry = archive?.history[togetherArchivePageIndex];
        if (!archive || !entry) return;
        setTogetherText('.candidate2-together-archive-reader-round', '第 ' + archive.round + ' 期');
        setTogetherText('.candidate2-together-archive-reader-title', archive.title);
        setTogetherText('.candidate2-together-archive-entry-title', entry.title);
        setTogetherText('.candidate2-together-archive-entry-text', entry.text);
        setTogetherText(
            '.candidate2-together-archive-page-number',
            String(togetherArchivePageIndex + 1) + ' / ' + String(archive.history.length),
        );

        const figure = document.querySelector('.candidate2-together-archive-photo');
        const image = figure?.querySelector('img');
        const photoAsset = togetherCoverAssets[entry.artFile];
        if (figure) figure.hidden = !photoAsset;
        if (image) {
            if (photoAsset) {
                image.src = photoAsset;
                image.alt = '《' + archive.title + '》' + entry.title;
            } else {
                image.removeAttribute('src');
                image.alt = '';
            }
        }
        const buttons = document.querySelectorAll('.candidate2-together-archive-pagination button');
        if (buttons[0]) buttons[0].disabled = togetherArchivePageIndex === 0;
        if (buttons[1]) buttons[1].disabled = togetherArchivePageIndex === archive.history.length - 1;
    }

    function renderTogetherArchives(archives) {
        const directory = document.querySelector('.candidate2-together-archive-directory');
        const empty = document.querySelector('.candidate2-together-archive-empty');
        togetherArchives = (archives || [])
            .map((archive) => ({
                ...archive,
                history: (archive.history || []).filter((entry) =>
                    ['story', 'task', 'clue', 'ending'].includes(entry.kind),
                ),
            }))
            .filter((archive) => archive.history.length > 0);
        if (directory)
            directory.replaceChildren(...togetherArchives.map(buildTogetherArchiveIndexCard));
        if (empty) empty.hidden = togetherArchives.length > 0;
        const historyButton = document.querySelector('.candidate2-together-history-button');
        if (historyButton) historyButton.disabled = togetherArchives.length === 0;
        closeTogetherArchive();
    }

    function openTogetherArchive(index) {
        const archive = togetherArchives[index];
        if (!archive) return;
        togetherArchiveIndex = index;
        togetherArchivePageIndex = 0;
        const directory = document.querySelector('.candidate2-together-archive-directory');
        const reader = document.querySelector('.candidate2-together-archive-reader');
        const historyHeader = document.querySelector('.candidate2-together-history-header');
        if (directory) directory.hidden = true;
        if (reader) reader.hidden = false;
        if (historyHeader) historyHeader.hidden = true;
        renderTogetherArchivePage();
    }

    function closeTogetherArchive() {
        togetherArchiveIndex = -1;
        togetherArchivePageIndex = 0;
        const directory = document.querySelector('.candidate2-together-archive-directory');
        const reader = document.querySelector('.candidate2-together-archive-reader');
        const historyHeader = document.querySelector('.candidate2-together-history-header');
        if (directory) directory.hidden = togetherArchives.length === 0;
        if (reader) reader.hidden = true;
        if (historyHeader) historyHeader.hidden = false;
    }

    function turnTogetherArchivePage(offset) {
        const archive = togetherArchives[togetherArchiveIndex];
        if (!archive) return;
        togetherArchivePageIndex = Math.max(
            0,
            Math.min(archive.history.length - 1, togetherArchivePageIndex + offset),
        );
        renderTogetherArchivePage();
        const page = document.querySelector('.candidate2-together-history-page');
        if (page) page.scrollTop = 0;
    }

    function openTogetherHistory() {
        if (!togetherArchives.length) {
            showLingyeNotice('还没有已完成的往期故事');
            return;
        }
        closeTogetherArchive();
        showScreen('screen-lingye-together-history');
    }

    function renderTogetherData(data) {
        const cover = document.querySelector('.candidate2-together-cover-image');
        const coverAsset = data && togetherCoverAssets[data.artFile];
        if (cover) {
            cover.hidden = !coverAsset;
            if (coverAsset) {
                cover.src = coverAsset;
                cover.alt = data.title ? '《' + data.title + '》活动封面' : '铃野共行活动封面';
            } else {
                cover.removeAttribute('src');
                cover.alt = '';
            }
        }

        const currentContent = document.querySelector('.candidate2-together-current-content');
        const liveEmpty = document.querySelector('.candidate2-together-live-empty');
        const taskList = document.querySelector('.candidate2-together-task-list');
        const choiceList = document.querySelector('.candidate2-together-choice-list');
        if (!data) {
            if (currentContent) currentContent.hidden = true;
            if (liveEmpty) liveEmpty.hidden = false;
            if (taskList) taskList.replaceChildren();
            if (choiceList) choiceList.replaceChildren();
            renderTogetherArchives([]);
            setTogetherText('.candidate2-together-current-kicker', '');
            setTogetherText('.candidate2-together-current-title', '');
            setTogetherText('.candidate2-together-current-status', '');
            setTogetherText('.candidate2-together-stage-name', '');
            setTogetherText('.candidate2-together-current-copy', '');
            setTogetherText('.candidate2-together-task-kicker', '');
            setTogetherText('.candidate2-together-task-title', '');
            setTogetherText('.candidate2-together-choice-kicker', '');
            setTogetherText('.candidate2-together-choice-title', '');
            setTogetherText('.candidate2-together-choice-copy', '');
            setTogetherText('.candidate2-together-rules-title', '');
            setTogetherText('.candidate2-together-rules-copy', '');
            const emptyStageRail = document.querySelector('.candidate2-together-stage-rail');
            if (emptyStageRail) emptyStageRail.replaceChildren();
            return;
        }

        if (liveEmpty) liveEmpty.hidden = true;
        if (currentContent) currentContent.hidden = false;
        renderTogetherArchives(data.archives);
        setTogetherText('.candidate2-together-current-kicker', '第 ' + data.round + ' 期');
        setTogetherText('.candidate2-together-current-title', data.title);
        setTogetherText('.candidate2-together-current-status', data.status);
        setTogetherText('.candidate2-together-stage-name', data.stageName);
        setTogetherText(
            '.candidate2-together-current-copy',
            data.currentSummary
                || (data.currentTask ? data.currentTask.opening : '当前没有可读取的阶段任务。'),
        );
        setTogetherText('.candidate2-together-task-kicker', '当前阶段');
        setTogetherText('.candidate2-together-task-title', '任务链');
        setTogetherText('.candidate2-together-choice-kicker', '公共选择');
        setTogetherText(
            '.candidate2-together-choice-title',
            data.currentChoice ? data.currentChoice.title : '当前没有公共选择',
        );
        setTogetherText(
            '.candidate2-together-choice-copy',
            data.currentChoice
                ? (data.currentChoice.counts
                    ? '这里只读展示全服实际选项与票数；Human 不替小机提交行动。'
                    : '这里只读展示全服实际选项；Human 不替小机提交行动。')
                : '当前阶段没有待处理的公共选择。',
        );
        setTogetherText('.candidate2-together-rules-title', '共行说明');
        setTogetherText(
            '.candidate2-together-rules-copy',
            '全服共用同一条实际故事线。Human 页面只读剧情、插图、任务进度、公共选择与往期档案。',
        );

        const stageRail = document.querySelector('.candidate2-together-stage-rail');
        if (stageRail) {
            stageRail.replaceChildren();
            for (let index = 1; index <= data.stageCount; index += 1) {
                const stage = document.createElement('span');
                stage.textContent = String(index);
                if (index === data.stageIndex) stage.classList.add('is-current');
                stageRail.append(stage);
                if (index < data.stageCount) stageRail.append(document.createElement('i'));
            }
        }

        if (taskList) {
            taskList.replaceChildren(...(data.tasks || []).map((task, index) => {
                const article = document.createElement('article');
                const mark = document.createElement('span');
                mark.className = 'candidate2-task-mark';
                mark.textContent = String(index + 1);
                const copy = document.createElement('div');
                const name = document.createElement('strong');
                name.textContent = task.name;
                const detail = document.createElement('p');
                detail.textContent = task.detail;
                copy.append(name, detail);
                const status = document.createElement('small');
                status.textContent = task.progress ? task.status + ' · ' + task.progress : task.status;
                article.append(mark, copy, status);
                return article;
            }));
        }

        if (choiceList) {
            const choice = data.currentChoice;
            choiceList.replaceChildren(
                ...(choice
                    ? Object.entries(choice.options).map(([option, label]) => {
                        const row = document.createElement('div');
                        const letter = document.createElement('b');
                        letter.textContent = option;
                        const text = document.createElement('span');
                        const count = choice.counts && choice.counts[option];
                        text.textContent = count == null ? label : label + '（' + count + '/3）';
                        row.append(letter, text);
                        return row;
                    })
                    : []),
            );
        }
    }

    const glimmerPage = document.querySelector('.candidate2-glimmer-page');
    const glimmerTrackList = document.querySelector('.candidate2-glimmer-tracks-demo');
    const glimmerAnimalLayoutWidth = 292;
    let glimmerAnimalEditorEnabled = false;
    let glimmerAnimalPositions = {
        duck_peach: { x: 0, y: 0 },
        mystery: { x: 0, y: 0 },
        silk_moth_mist: { x: 0, y: 0 },
        turkey_maple: { x: 0, y: 0 },
    };
    let glimmerAnimalDrag = null;

    function applyGlimmerAnimalPositions(positions) {
        glimmerAnimalPositions = positions;
        glimmerTrackList.querySelectorAll('[data-glimmer-animal-id]').forEach((figure) => {
            const position = positions[figure.dataset.glimmerAnimalId] || { x: 0, y: 0 };
            figure.style.setProperty('--glimmer-group-x', position.x / glimmerAnimalLayoutWidth * 100 + 'cqw');
            figure.style.setProperty('--glimmer-group-y', position.y / glimmerAnimalLayoutWidth * 100 + 'cqw');
        });
    }

    function finishGlimmerAnimalDrag() {
        if (!glimmerAnimalDrag) return;
        glimmerAnimalDrag.target.classList.remove('is-dragging');
        sendAction({
            type: 'glimmer-animal-layout-change',
            positions: glimmerAnimalPositions,
        });
        glimmerAnimalDrag = null;
    }

    glimmerTrackList.addEventListener('pointerdown', (event) => {
        if (!glimmerAnimalEditorEnabled) return;
        const figure = event.target.closest('[data-glimmer-animal-id][data-glimmer-drag-target="group"]');
        if (!figure) return;
        const animalId = figure.dataset.glimmerAnimalId;
        const origin = glimmerAnimalPositions[animalId] || { x: 0, y: 0 };
        glimmerAnimalDrag = {
            animalId,
            originX: origin.x,
            originY: origin.y,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            target: figure,
        };
        figure.classList.add('is-dragging');
        figure.setPointerCapture(event.pointerId);
        event.preventDefault();
    });

    glimmerTrackList.addEventListener('pointermove', (event) => {
        if (!glimmerAnimalDrag || glimmerAnimalDrag.pointerId !== event.pointerId) return;
        const layoutScale = glimmerTrackList.clientWidth / glimmerAnimalLayoutWidth || 1;
        const position = {
            x: Math.round((glimmerAnimalDrag.originX + (event.clientX - glimmerAnimalDrag.startX) / layoutScale) * 10) / 10,
            y: Math.round((glimmerAnimalDrag.originY + (event.clientY - glimmerAnimalDrag.startY) / layoutScale) * 10) / 10,
        };
        applyGlimmerAnimalPositions({
            ...glimmerAnimalPositions,
            [glimmerAnimalDrag.animalId]: position,
        });
    });

    glimmerTrackList.addEventListener('pointerup', finishGlimmerAnimalDrag);
    glimmerTrackList.addEventListener('pointercancel', finishGlimmerAnimalDrag);

    function formatGlimmerEventTimestamp(value) {
        const parts = new Intl.DateTimeFormat('zh-CN', {
            timeZone: 'Asia/Shanghai',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(new Date(value));
        const part = (type) => parts.find((item) => item.type === type)?.value || '—';
        return { date: part('month') + '/' + part('day'), time: part('hour') + ':' + part('minute') };
    }

    function recentGlimmerEvents(events) {
        return [...events]
            .filter((eventItem) => Number.isFinite(Date.parse(eventItem.at)))
            .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
            .slice(0, 10);
    }

    function renderGlimmerData(glimmer) {
        const enabled = Boolean(glimmer);
        const tracks = glimmer && Array.isArray(glimmer.tracks) ? glimmer.tracks : [];
        const events = recentGlimmerEvents(
            glimmer && Array.isArray(glimmer.events) ? glimmer.events : [],
        );
        const variants = glimmer && Array.isArray(glimmer.variants) ? glimmer.variants : [];
        const encounters = glimmer && Array.isArray(glimmer.encounters) ? glimmer.encounters : [];
        const achievements = glimmer && Array.isArray(glimmer.achievements) ? glimmer.achievements : [];
        setDemoVisibility('.candidate2-glimmer-feature-empty', '.candidate2-glimmer-feature-demo', Boolean(glimmer && glimmer.task));
        setDemoVisibility('.candidate2-glimmer-tracks-empty', '.candidate2-glimmer-tracks-demo', tracks.length > 0);
        setDemoVisibility('.candidate2-glimmer-events-empty', '.candidate2-glimmer-events-demo', events.length > 0);
        setDemoVisibility('.candidate2-glimmer-variants-empty', '.candidate2-glimmer-variants-demo', variants.length > 0);
        setDemoVisibility('.candidate2-glimmer-encounters-empty', '.candidate2-glimmer-encounters-demo', encounters.length > 0);
        setDemoVisibility('.candidate2-glimmer-summary-empty', '.candidate2-glimmer-summary-demo', Boolean(glimmer));
        setDemoVisibility('.candidate2-glimmer-achievements-empty', '.candidate2-glimmer-achievements-demo', achievements.length > 0);
        document.querySelector('.candidate2-glimmer-opening-value').textContent = glimmer ? glimmer.openingHours : '—';
        document.querySelector('.candidate2-glimmer-status-value').textContent = glimmer ? glimmer.status : '—';
        document.querySelector('.candidate2-glimmer-trace-value').textContent = glimmer ? glimmer.traceCount : '—';
        const glimmerEventList = document.querySelector('.candidate2-glimmer-events-demo');
        const glimmerVariantList = document.querySelector('.candidate2-glimmer-variants-demo');
        const glimmerEncounterList = document.querySelector('.candidate2-glimmer-encounters-demo');
        const glimmerAchievementList = document.querySelector('.candidate2-glimmer-achievements-demo');
        glimmerTrackList.replaceChildren();
        glimmerEventList.replaceChildren();
        glimmerVariantList.replaceChildren();
        glimmerEncounterList.replaceChildren();
        glimmerAchievementList.replaceChildren();
        document.querySelector('.candidate2-glimmer-task-title').textContent = '';
        document.querySelector('.candidate2-glimmer-task-detail').textContent = '';
        document.querySelector('.candidate2-glimmer-task-progress').textContent = '';
        document.querySelector('.candidate2-glimmer-progress-track i').style.width = '0%';
        document.querySelector('.candidate2-glimmer-summary-encounters').textContent = '';
        document.querySelector('.candidate2-glimmer-summary-variants').textContent = '';
        document.querySelector('.candidate2-glimmer-summary-coops').textContent = '';
        if (!enabled) return;

        if (glimmer.task) {
            document.querySelector('.candidate2-glimmer-task-title').textContent = glimmer.task.title;
            document.querySelector('.candidate2-glimmer-task-detail').textContent = glimmer.task.detail;
            document.querySelector('.candidate2-glimmer-task-progress').textContent =
                glimmer.task.current + ' / ' + glimmer.task.total + ' 家';
            const glimmerProgress = glimmer.task.total > 0
                ? Math.max(0, Math.min(100, glimmer.task.current / glimmer.task.total * 100))
                : 0;
            document.querySelector('.candidate2-glimmer-progress-track i').style.width = glimmerProgress + '%';
        }
        glimmerTrackList.replaceChildren(...tracks.map(buildGlimmerTrackFigure));
        applyGlimmerAnimalPositions(glimmerAnimalPositions);
        glimmerEventList.replaceChildren(...events.map((eventItem) => {
            const item = document.createElement('li');
            const time = document.createElement('time');
            const timestamp = formatGlimmerEventTimestamp(eventItem.at);
            time.dateTime = eventItem.at;
            const date = document.createElement('span');
            date.textContent = timestamp.date;
            const clock = document.createElement('small');
            clock.textContent = timestamp.time;
            time.append(date, clock);
            const copy = document.createElement('div');
            const title = document.createElement('strong');
            title.textContent = eventItem.title;
            copy.append(title);
            item.append(time, copy);
            return item;
        }));
        glimmerVariantList.replaceChildren(...variants.map(buildGlimmerVariantFigure));
        glimmerEncounterList.replaceChildren(...encounters.map((encounter) => {
            const item = document.createElement('li');
            const name = document.createElement('strong');
            name.textContent = encounter.name;
            const status = document.createElement('span');
            status.textContent = encounter.status;
            item.append(name, status);
            return item;
        }));
        document.querySelector('.candidate2-glimmer-summary-encounters').textContent = glimmer.stats.encounters + ' 次';
        document.querySelector('.candidate2-glimmer-summary-variants').textContent = glimmer.stats.variants + ' 种';
        document.querySelector('.candidate2-glimmer-summary-coops').textContent = glimmer.stats.coops + ' 次';
        glimmerAchievementList.replaceChildren(...achievements.map((achievement) => {
            const article = document.createElement('article');
            const copy = document.createElement('div');
            const name = document.createElement('strong');
            name.textContent = achievement.name;
            const reward = document.createElement('small');
            reward.textContent = achievement.reward;
            copy.append(name, reward);
            const state = document.createElement('div');
            const progress = document.createElement('span');
            progress.textContent = achievement.progress;
            const status = document.createElement('span');
            status.textContent = achievement.status;
            state.append(progress, status);
            article.append(copy, state);
            return article;
        }));
    }

    function applyDemoContent(demo) {
        const content = demo && demo.content;
        const enabled = Boolean(content);
        const mailboxUnreadCount = Number.isFinite(content && content.mailboxUnreadCount)
            ? content.mailboxUnreadCount
            : 0;
        homeMailboxUnreadCount = mailboxUnreadCount;
        syncHomeMailboxUnreadBadge();
        const mailboxMessages = content && Array.isArray(content.mailboxMessages)
            ? content.mailboxMessages
            : [];
        homeMailboxMessages = mailboxMessages.map((message) => ({ ...message }));
        homeMailboxCategory = 'all';
        homeMailboxPage = 1;
        renderHomeMailbox();
        setDemoVisibility('.home-doorbell-empty', '.home-doorbell-demo', enabled);
        setDemoVisibility('.home-visitors-empty', '.candidate2-demo-visitors', enabled);
        setDemoVisibility('.profile-relationships-empty', '.candidate2-demo-relationship', enabled);
        setDemoVisibility('.candidate2-profile-empty', '.candidate2-demo-activity-list', enabled);
        setDemoVisibility('.candidate2-memorial-empty', '.candidate2-memorial-demo', enabled);
        setLingyeMemorialFilter(lingyeMemorialFilter);
        const memorialDemoChrome = document.querySelector('.candidate2-memorial-demo-chrome');
        if (memorialDemoChrome) memorialDemoChrome.hidden = !enabled;
        const memorialLayoutEditor = demo && demo.memorialLayoutEditor;
        setMemorialLayoutEditorEnabled(
            Boolean(memorialLayoutEditor && memorialLayoutEditor.enabled),
            memorialLayoutEditor && memorialLayoutEditor.encodedLayout,
            enabled,
            memorialLayoutEditor && memorialLayoutEditor.target,
        );
        const glimmerEditor = demo && demo.glimmerAnimalEditor;
        glimmerAnimalEditorEnabled = Boolean(glimmerEditor && glimmerEditor.enabled);
        glimmerPage.classList.toggle('is-animal-editor', glimmerAnimalEditorEnabled);
        if (glimmerEditor) {
            applyGlimmerAnimalPositions(glimmerEditor.positions);
        }
        const glimmer = content && content.glimmer;
        renderGlimmerData(glimmer);
        renderTogetherData(content && content.together);
        if (!content) return;

        document.querySelector('.home-doorbell-count').textContent = String(content.doorbellRequests.length).padStart(2, '0');
        const requestList = document.querySelector('.candidate2-demo-request-list');
        requestList.replaceChildren(...content.doorbellRequests.map((request) => {
            const item = document.createElement('li');
            item.textContent = request;
            return item;
        }));

        const visitors = document.querySelector('.candidate2-demo-visitors');
        visitors.replaceChildren(...content.visitors.map((visitor) => {
            const item = document.createElement('span');
            item.className = 'candidate2-demo-visitor';
            item.textContent = visitor.name;
            const tones = { sky: 'var(--sky-blue)', sand: 'var(--warm-sand)', pink: 'var(--soft-pink)' };
            item.style.setProperty('--visitor-tone', tones[visitor.tone] || 'var(--sky-blue)');
            return item;
        }));

        const relationNodes = document.querySelectorAll('.candidate2-demo-relation-node');
        relationNodes.forEach((node, index) => {
            const relation = content.relationships[index];
            node.querySelector('strong').textContent = relation ? relation.name : '—';
            node.querySelector('small').textContent = relation ? relation.detail : '';
            const editorRow = relationshipEditor.querySelector('[data-relation-index="' + index + '"]');
            editorRow.querySelector('strong').textContent = relation ? relation.name : '—';
            editorRow.dataset.detail = relation ? relation.detail : '';
        });
        const settings = content.settings;
        document.querySelector('.settings-connection-summary').textContent = settings.wakeBridgeState;
        document.querySelector('.settings-wake-state').textContent = settings.wakeBridgeState;
        document.querySelector('.settings-wake-dot').style.background = '#9dbcae';
        document.querySelector('.settings-environment').value = content.environmentDescription;
        document.querySelector('.settings-climate').value = settings.climateType;
        document.querySelector('.settings-lounge-duration').value = String(settings.loungeDurationMinutes);
        document.querySelector('.settings-initial-message-count').value = String(settings.initialMessageCount);
        document.querySelector('.settings-meme-count').textContent = String(settings.sharedMemeCount);
        document.querySelector('.settings-meme-sync').textContent = '最近同步 ' + settings.sharedMemeLastSync;
        const activityList = document.querySelector('.candidate2-demo-activity-list');
        const visibleActivities = content.activities.slice(0, 20);
        activityList.replaceChildren(...visibleActivities.map((activity, index) => {
            const row = document.createElement('div');
            row.className = 'candidate2-demo-activity is-collapsed';
            row.style.setProperty('--activity-tone', ['var(--soft-pink)', 'var(--sky-blue)', 'var(--warm-sand)', '#D5E6DF'][index % 4]);
            const icon = document.createElement('span');
            icon.textContent = activity.icon;
            const text = document.createElement('span');
            text.textContent = activity.text;
            const time = document.createElement('time');
            time.textContent = activity.time;
            row.append(icon, text, time);
            return row;
        }));
        const moreButton = document.getElementById('profile-activity-more');
        moreButton.hidden = visibleActivities.length <= 4;
        moreButton.dataset.expanded = 'false';
        moreButton.textContent = 'More';
        relationshipEditButton.hidden = content.relationships.length === 0;
    }

    function normalizeLiveGlimmer(read) {
        const data = read && read.data;
        if (!data) return null;
        return {
            openingHours: data.open ? '开放中' : '未开放',
            status: data.status,
            traceCount: data.tracks.length + ' 条',
            task: data.cooperation ? {
                title: data.cooperation.event.name,
                detail: data.cooperation.event.requirement,
                current: data.cooperation.progress.current,
                total: data.cooperation.progress.target,
            } : null,
            tracks: data.tracks.map((track) => track.revealed && track.variant ? {
                revealed: true,
                id: track.variant.id,
                name: track.variant.name,
                atlas: track.variant.atlas,
                set: track.variant.set,
                spriteIndex: track.variant.sprite_index,
            } : { revealed: false, layoutId: 'mystery' }),
            events: data.events.map((eventItem) => ({
                at: eventItem.at,
                title: eventItem.text,
            })),
            variants: data.variants.map((variant) => ({
                id: variant.id,
                name: variant.name,
                atlas: variant.atlas,
                set: variant.set,
                spriteIndex: variant.sprite_index,
                unlocked: variant.unlocked,
            })),
            encounters: data.encounters.map((encounter) => ({
                id: encounter.id,
                name: encounter.name,
                status: encounter.seen ? '已遇见' : '未遇见',
            })),
            stats: {
                coops: data.summary.cooperations,
                encounters: data.summary.encounters,
                variants: data.summary.variants,
            },
            achievements: data.achievements.map((achievement) => ({
                id: achievement.id,
                name: achievement.name,
                progress: achievement.progress.current + ' / ' + achievement.progress.target,
                reward: achievement.reward.coins + ' 金 + ' + achievement.reward.silver + ' 银',
                status: achievement.rewarded ? '已达成' : '未达成',
            })),
        };
    }

    function normalizeLiveTogether(read) {
        const data = read && read.data;
        if (!data) return null;
        const currentTask = data.current_task ? {
            contributors: [],
            name: data.current_task.title,
            opening: data.current_task.text,
            progress: data.current_task.target > 0
                ? Math.round(data.current_task.progress / data.current_task.target * 100)
                : 0,
        } : null;
        let currentSummary = currentTask ? currentTask.opening : null;
        if (!currentSummary && data.ending) currentSummary = data.ending.text;
        if (!currentSummary && data.cooldown) {
            currentSummary = [data.cooldown.text, data.cooldown.ready_text].filter(Boolean).join(' · ');
        }
        return {
            artFile: data.art_asset_key,
            archives: data.archives.map((archive) => ({
                artFile: archive.art_asset_key,
              history: archive.history.map((entry) => ({
                artFile: entry.art_asset_key,
                kind: entry.kind,
                ...(entry.kind === "task"
                  ? { progress: entry.progress, target: entry.target }
                  : {}),
                text: entry.text,
                title: entry.title,
              })),
                round: archive.round,
                title: archive.title,
            })),
            currentChoice: data.current_choice ? {
                counts: data.current_choice.counts,
                index: data.current_choice.index,
                options: Object.fromEntries(data.current_choice.options.map((option) => [option.key, option.label])),
                title: data.current_choice.title,
            } : null,
            currentTask,
            currentSummary,
            stageCount: data.stage.total,
            stageIndex: data.stage.index,
            stageName: data.stage.name,
            tasks: data.current_task ? [{
                detail: data.current_task.text,
                name: data.current_task.title,
                progress: data.current_task.progress + ' / ' + data.current_task.target,
                status: data.phase === 'task' ? '进行中' : data.status,
            }] : [],
            routeName: data.story_id,
            round: data.round,
            status: data.status,
            title: data.title,
        };
    }

    function applyLiveGlimmerState(readState) {
        if (readState.stage === 'idle') {
            renderGlimmerData(null);
            document.querySelector('.candidate2-glimmer-feature-empty-title').textContent = '进入后读取当前协作';
            document.querySelector('.candidate2-glimmer-feature-empty-copy').textContent = '进入后读取真实的全服协作任务。';
            return;
        }
        if (readState.stage === 'loading') {
            showScreen('screen-lingye-glimmer');
            renderGlimmerData(null);
            document.querySelector('.candidate2-glimmer-status-value').textContent = '读取中';
            document.querySelector('.candidate2-glimmer-feature-empty-title').textContent = '正在读取当前协作';
            document.querySelector('.candidate2-glimmer-feature-empty-copy').textContent = '正在读取真实的全服协作任务。';
            return;
        }
        if (readState.stage === 'ready') {
            renderGlimmerData(normalizeLiveGlimmer(readState.data));
            return;
        }
        renderGlimmerData(null);
        if (readState.stage === 'empty') {
            document.querySelector('.candidate2-glimmer-feature-empty-title').textContent = '当前没有流光原野数据';
            document.querySelector('.candidate2-glimmer-feature-empty-copy').textContent = '稍后再进入这里读取全服协作状态。';
            return;
        }
        if (readState.stage === 'error') {
            document.querySelector('.candidate2-glimmer-status-value').textContent = '读取失败';
            document.querySelector('.candidate2-glimmer-feature-empty-title').textContent = '流光原野暂时不可用';
            document.querySelector('.candidate2-glimmer-feature-empty-copy').textContent = readState.message;
        }
    }

    function applyLiveTogetherState(readState) {
        if (readState.stage === 'idle') {
            renderTogetherData(null);
            setTogetherText('.candidate2-together-live-empty', '进入后读取当前铃野共行状态。');
            return;
        }
        if (readState.stage === 'loading') {
            showScreen('screen-lingye-together');
            renderTogetherData(null);
            setTogetherText('.candidate2-together-live-empty', '正在读取当前铃野共行状态。');
            return;
        }
        if (readState.stage === 'ready') {
            const data = normalizeLiveTogether(readState.data);
            renderTogetherData(data);
            if (!data) setTogetherText('.candidate2-together-live-empty', '当前没有铃野共行状态。');
            return;
        }
        renderTogetherData(null);
        setTogetherText(
            '.candidate2-together-live-empty',
            readState.stage === 'empty' ? '当前没有铃野共行状态。' : readState.message,
        );
    }

    const qixiLampShapePositions = {
        'square-palace': '0%',
        'octagonal-palace': '50%',
        'lotus-palace': '100%',
    };
    const qixiLampColorPositions = {
        'moon-white': '0%',
        'peach-pink': '33.333%',
        'mist-blue': '66.667%',
        'apricot-gold': '100%',
    };
    const qixiLampDecorPositions = {
        'short-tassel': ['0%', '0%'],
        'fine-copper-bell': ['50%', '0%'],
        'magpie-ribbon': ['100%', '0%'],
        'star-speckle': ['0%', '33.333%'],
        'qiaoguo-pattern': ['50%', '33.333%'],
        'river-glow': ['100%', '33.333%'],
        'cotton-knot': ['0%', '66.667%'],
        'waterproof-seal': ['50%', '66.667%'],
        'cloud-knot': ['100%', '66.667%'],
        'magpie-bridge': ['0%', '100%'],
        'twin-jade-pendant': ['50%', '100%'],
        'twin-blossom-seal': ['100%', '100%'],
    };
    const qixiLampLayouts = {
        'square-palace': { base: [-28, -6, 180, 135], pattern: [67, 47, 64, 64], ornament: [61, 119, 68, 68], seal: [71, 15, 51, 51] },
        'octagonal-palace': { base: [6, -5, 180, 135], pattern: [61, 43, 64, 64], ornament: [57, 120, 68, 68], seal: [74, 20, 51, 51] },
        'lotus-palace': { base: [42, -5, 180, 135], pattern: [66, 53, 64, 64], ornament: [59, 118, 68, 68], seal: [71, 16, 51, 51] },
    };
    const qixiMagpieLayouts = {
        'square-palace': [64, 108, 68, 68],
        'octagonal-palace': [59, 110, 68, 68],
        'lotus-palace': [55, 112, 68, 68],
    };

    function setQixiLampBox(node, box) {
        if (!node || !box) return;
        node.style.left = box[0] + 'px';
        node.style.right = 'auto';
        node.style.top = box[1] + 'px';
        node.style.width = box[2] + 'px';
        node.style.height = box[3] + 'px';
    }

    function setQixiLampDecor(node, id, box) {
        if (!node) return;
        node.hidden = id === 'none';
        if (node.hidden) return;
        const position = qixiLampDecorPositions[id];
        setQixiLampBox(node, box);
        node.style.backgroundPosition = position[0] + ' ' + position[1];
    }

    function applyQixiLantern(element, name, appearance) {
        const layout = qixiLampLayouts[appearance.shape] || qixiLampLayouts['square-palace'];
        const base = element.querySelector('[data-qixi-lantern-base]');
        const pattern = element.querySelector('[data-qixi-lantern-pattern]');
        const ornament = element.querySelector('[data-qixi-lantern-ornament]');
        const seal = element.querySelector('[data-qixi-lantern-seal]');
        setQixiLampBox(base, layout.base);
        base.style.setProperty('--lamp-x', qixiLampShapePositions[appearance.shape] || '0%');
        base.style.setProperty('--lamp-y', qixiLampColorPositions[appearance.color] || '0%');
        setQixiLampDecor(pattern, appearance.pattern, layout.pattern);
        setQixiLampDecor(
            ornament,
            appearance.ornament,
            appearance.ornament === 'magpie-ribbon'
                ? (qixiMagpieLayouts[appearance.shape] || layout.ornament)
                : layout.ornament,
        );
        setQixiLampDecor(seal, appearance.seal, layout.seal);
        element.dataset.memorialEditorName = name + '的灯';
        element.setAttribute('aria-label', name + '的七夕成品灯');
    }

    function applyQixiMemorialData(read) {
        const data = read && read.data;
        if (!data) return false;
        const sides = {
            human: { name: data.human_name, value: data.human, asset: 'my' },
            ai: { name: data.ai_name, value: data.ai, asset: 'du' },
        };
        Object.entries(sides).forEach(([side, record]) => {
            document.querySelectorAll(
                '[data-qixi-memorial-side="' + side + '"][data-memorial-editor-asset="' + record.asset + '-lantern"]',
            ).forEach((element) => applyQixiLantern(element, record.name, record.value.lantern));
            document.querySelectorAll(
                '[data-qixi-memorial-side="' + side + '"][data-memorial-editor-asset="' + record.asset + '-letter"]',
            ).forEach((element) => {
                const text = element.querySelector('[data-qixi-archive-letter-text]');
                const signature = element.querySelector('.candidate2-qixi-archive-letter-signature');
                if (text) text.textContent = record.value.letter;
                if (signature) signature.textContent = record.name;
                element.dataset.memorialEditorName = record.name + '的信';
                element.setAttribute('aria-label', record.name + '的七夕信件');
            });
        });
        return true;
    }

    function applyLiveQixiMemorialState(readState) {
        const empty = document.querySelector('.candidate2-memorial-empty');
        const chrome = document.querySelector('.candidate2-memorial-demo-chrome');
        if (readState.stage === 'idle') {
            qixiMemorialReady = false;
            return;
        }
        showScreen('screen-lingye-memorial');
        const index = document.querySelector('.candidate2-memorial-index');
        const entry = document.querySelector('.candidate2-memorial-entry-view');
        if (index) index.hidden = false;
        if (entry) entry.hidden = true;
        qixiMemorialReady = readState.stage === 'ready' && applyQixiMemorialData(readState.data);
        if (chrome) chrome.hidden = !qixiMemorialReady;
        if (empty) {
            empty.hidden = qixiMemorialReady;
            empty.textContent = readState.stage === 'loading'
                ? '正在读取活动档案……'
                : readState.stage === 'error'
                    ? readState.message
                    : '还没有可查看的活动档案。';
        }
        setLingyeMemorialFilter(lingyeMemorialFilter);
    }

    function applyLiveLingyeState(lingye) {
        if (!lingye) return;
        applyLiveGlimmerState(lingye.glimmer);
        applyLiveQixiMemorialState(lingye.memorial);
        applyLiveTogetherState(lingye.together);
    }

    function closeRelationshipEditor() {
        relationshipEditor.hidden = true;
        document.querySelector('.candidate2-demo-relationship').hidden = false;
        relationshipEditButton.textContent = 'Edit';
    }

    function openRelationshipEditor() {
        if (!window.__doorbellCandidateDemo || relationshipEditButton.hidden) {
            showCandidateNotice('暂无可编辑的来往数据');
            return;
        }
        relationshipEditor.querySelectorAll('[data-relation-index]').forEach((row) => {
            const select = row.querySelector('select');
            const input = row.querySelector('input');
            select.value = '还行';
            input.value = '';
            input.hidden = true;
        });
        document.querySelector('.candidate2-demo-relationship').hidden = true;
        relationshipEditor.hidden = false;
        relationshipEditButton.textContent = 'Editing';
    }

    function applyDemoRegistrationPrefill(prefill) {
        if (!prefill) return;
        document.getElementById('resident-name').value = prefill.residentName;
        document.getElementById('home-name').value = prefill.homeName;
        farmDoorplateInput.value = prefill.farmDoorplate;
        farmHumanUrlInput.value = prefill.farmHumanUrl;
        updateProfileSubmitState();
    }

    function showCredentialsStep() {
        credentialsForm.hidden = false;
        profileForm.hidden = true;
    }

    function showProfileStep() {
        credentialsForm.hidden = true;
        profileForm.hidden = false;
    }

    function applyFarmLookup(lookup) {
        if (lookup.stage === 'checking') {
            resetFarmConfirmation();
            setStatus(profileStatus, '正在查询农场……');
            farmLookupButton.disabled = true;
            return;
        }

        farmLookupButton.disabled = profileForm.dataset.pending === 'true';
        if (lookup.stage === 'error') {
            resetFarmConfirmation();
            setStatus(profileStatus, lookup.message);
            return;
        }

        if (lookup.stage === 'found') {
            currentFarmName = lookup.farmName;
            currentFarmDoorplate = lookup.doorplate;
            farmName.textContent = lookup.farmName;
            farmDoorplateResult.textContent = '门牌 ' + lookup.doorplate;
            confirmFarmInput.checked = false;
            farmConfirmation.hidden = false;
            setStatus(profileStatus, '请确认就是这个农场。');
            updateProfileSubmitState();
            return;
        }

        resetFarmConfirmation();
    }

    function completePermit() {
        window.clearTimeout(permitTimer);
        sendAction({ type: 'permit-complete' });
    }

    function schedulePermitCompletion() {
        window.clearTimeout(permitTimer);
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        permitTimer = window.setTimeout(completePermit, reducedMotion ? 0 : 700);
    }

    function applyRuntimeState(state, demo) {
        const previousStage = currentStage;
        currentStage = state.stage;
        window.__doorbellCandidateDemo = Boolean(demo);
        applyDemoContent(demo);
        if (!demo && state.stage === 'authenticated') {
            applyLiveLingyeState(state.lingye);
        }

        if (state.stage === 'checking-session') {
            showScreen('screen-login');
            showCredentialsStep();
            mainNav.style.display = 'none';
            setFormDisabled(credentialsForm, true);
            setStatus(credentialsStatus, '正在确认登录状态……');
            return;
        }

        if (state.stage === 'anonymous') {
            showScreen('screen-login');
            showCredentialsStep();
            mainNav.style.display = 'none';
            setFormDisabled(credentialsForm, state.pending);
            setStatus(credentialsStatus, state.issueMessage);
            farmHumanUrlInput.value = '';
            resetFarmConfirmation();
            return;
        }

        if (state.stage === 'registration-profile') {
            showScreen('screen-login');
            showProfileStep();
            mainNav.style.display = 'none';
            profileForm.dataset.pending = String(state.pending);
            setFormDisabled(profileForm, state.pending);
            applyFarmLookup(state.farmLookup);
            if (state.issueMessage) setStatus(profileStatus, state.issueMessage);
            applyDemoRegistrationPrefill(demo && demo.registrationPrefill);
            updateProfileSubmitState();
            return;
        }

        applyIdentity(state.identity);
        if (state.stage === 'issuing-permit') {
            farmHumanUrlInput.value = '';
            resetFarmConfirmation();
            mainNav.style.display = 'none';
            showScreen('screen-residency');
            if (previousStage !== 'issuing-permit') {
                schedulePermitCompletion();
            }
            return;
        }

        mainNav.style.display = 'flex';
        document.getElementById('settings-logout-button').disabled = state.pendingLogout;
        if (!demo) {
            applyHomeSettings(
                state.homeSettings,
                state.homeSettingsPending,
                state.homeSettingsIssueMessage,
            );
            applySharedMemeState(
                state.sharedMemes,
                state.sharedMemeDetail,
                state.sharedMemeCreatePending,
                state.sharedMemeCreateMessage,
            );
        }
        setStatus(document.querySelector('.candidate2-profile-empty'), state.issueMessage || '暂无可读取的活动数据');
        if (previousStage !== 'authenticated') {
            const initialScreen = demo && demo.initialScreen ? demo.initialScreen : 'lounge';
            showScreen('screen-' + initialScreen);
        }
    }

    credentialsForm.addEventListener('submit', (event) => {
        event.preventDefault();
        sendAction({
            type: 'credentials-submit',
            qqNumber: document.getElementById('qq-number').value,
            registrationCode: document.getElementById('registration-code').value,
        });
    });

    document.getElementById('profile-back-button').addEventListener('click', () => {
        showCredentialsStep();
        setStatus(credentialsStatus, '');
    });

    farmDoorplateInput.addEventListener('input', () => {
        resetFarmConfirmation();
        setStatus(profileStatus, '');
    });

    farmHumanUrlInput.addEventListener('input', updateProfileSubmitState);
    confirmFarmInput.addEventListener('change', updateProfileSubmitState);
    settingsHomeName.addEventListener('change', () => saveHomeSetting('homeName', settingsHomeName));
    settingsEnvironment.addEventListener('change', () => saveHomeSetting('environmentDescription', settingsEnvironment));
    settingsClimate.addEventListener('change', () => saveHomeSetting('climateType', settingsClimate));
    settingsPauseAllWakeups.addEventListener('change', () => saveNotificationPreference('pauseAllWakeups', settingsPauseAllWakeups));
    settingsVisitNotifications.addEventListener('change', () => saveNotificationPreference('visitRequestsAndInvitationsEnabled', settingsVisitNotifications));
    settingsActivityNotifications.addEventListener('change', () => saveNotificationPreference('activityInvitationsEnabled', settingsActivityNotifications));
    settingsSystemNotifications.addEventListener('change', () => saveNotificationPreference('importantSystemNotificationsEnabled', settingsSystemNotifications));
    settingsBrowserNotifications.addEventListener('change', () => saveBrowserNotificationPreference('browserNotificationsEnabled', settingsBrowserNotifications));
    settingsActivityReminders.addEventListener('change', () => saveBrowserNotificationPreference('activityRemindersEnabled', settingsActivityReminders));
    settingsSharedMemeUpdates.addEventListener('change', () => saveSharedDataPreference('sharedMemeUpdateSignalsEnabled', settingsSharedMemeUpdates));
    settingsLoungeDuration.addEventListener('change', () => saveCommunityNumberPreference('defaultConnectionDurationMinutes', settingsLoungeDuration));
    settingsInitialMessageCount.addEventListener('change', () => saveCommunityNumberPreference('initialRecentActivityCount', settingsInitialMessageCount));
    settingsChatMode.addEventListener('change', () => saveCommunityChatMode(settingsChatMode));
    settingsActivityRoomWarmup.addEventListener('change', () => saveCommunityBooleanPreference('allowActivityRoomWarmup', settingsActivityRoomWarmup));
    settingsProfileSelect.addEventListener('change', () => {
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示模式不会切换真实档案');
            return;
        }
        sendAction({ type: 'profile-switch', profileId: settingsProfileSelect.value });
    });
    settingsAddProfileButton.addEventListener('click', () => {
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示模式不会建立真实档案');
            return;
        }
        sendAction({ type: 'profile-add' });
    });

    farmLookupButton.addEventListener('click', () => {
        sendAction({ type: 'farm-lookup', farmDoorplate: farmDoorplateInput.value });
    });

    profileForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!confirmFarmInput.checked || currentFarmName.length === 0) {
            setStatus(profileStatus, '请先查询并确认真实农场名称。');
            return;
        }
        sendAction({
            type: 'registration-submit',
            confirmedFarmName: currentFarmName,
            farmDoorplate: currentFarmDoorplate,
            farmHumanUrl: farmHumanUrlInput.value,
            homeName: document.getElementById('home-name').value,
            residentName: document.getElementById('resident-name').value,
        });
    });

    document.getElementById('permit-finish-button').addEventListener('click', completePermit);
    document.getElementById('profile-design-button').addEventListener('click', () => {
        showCandidateNotice('Q版形象设计暂未开放');
    });
    document.getElementById('profile-edit-button').addEventListener('click', () => {
        showCandidateNotice('资料编辑暂未开放');
    });
    relationshipEditButton.addEventListener('click', () => {
        if (relationshipEditor.hidden) openRelationshipEditor();
        else closeRelationshipEditor();
    });
    relationshipCancelButton.addEventListener('click', closeRelationshipEditor);
    relationshipEditor.querySelectorAll('select').forEach((select) => {
        select.addEventListener('change', () => {
            const input = select.parentElement.querySelector('input');
            input.hidden = select.value !== '自定义';
            if (!input.hidden) input.focus();
        });
    });
    relationshipEditor.addEventListener('submit', (event) => {
        event.preventDefault();
        relationshipEditor.querySelectorAll('[data-relation-index]').forEach((row, index) => {
            const select = row.querySelector('select');
            const input = row.querySelector('input');
            const relationText = select.value === '自定义' ? input.value.trim() : select.value;
            const node = document.querySelectorAll('.candidate2-demo-relation-node')[index];
            if (node) node.querySelector('small').textContent = relationText || row.dataset.detail;
        });
        closeRelationshipEditor();
        showCandidateNotice('演示关系已更新（不会保存）');
    });
    document.getElementById('profile-activity-more').addEventListener('click', (event) => {
        const button = event.currentTarget;
        const expanded = button.dataset.expanded !== 'true';
        button.dataset.expanded = String(expanded);
        button.textContent = expanded ? 'Less' : 'More';
        document.querySelectorAll('.candidate2-demo-activity').forEach((row) => {
            row.classList.toggle('is-collapsed', !expanded);
        });
    });
    document.getElementById('settings-logout-button').addEventListener('click', () => {
        sendAction({ type: 'logout' });
    });
    sharedMemesOpenButton.addEventListener('click', () => openSharedMemePage(false));
    sharedMemeAddFromSettingsButton.addEventListener('click', () => openSharedMemePage(true));
    sharedMemesBackButton.addEventListener('click', () => showScreen('screen-settings'));
    sharedMemeAddOpenButton.addEventListener('click', () => {
        sharedMemeAddForm.hidden = false;
        sharedMemeAddForm.elements.term.focus();
    });
    sharedMemeAddCloseButton.addEventListener('click', () => {
        sharedMemeAddForm.hidden = true;
        setStatus(sharedMemeFormStatus, '');
    });
    sharedMemesSearch.addEventListener('input', renderSharedMemeList);
    sharedMemeDetailCloseButton.addEventListener('click', () => {
        sharedMemeDetail.hidden = true;
    });
    sharedMemeAddForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (window.__doorbellCandidateDemo) {
            showCandidateNotice('演示模式不会新增真实共享梗');
            return;
        }
        const formData = new FormData(sharedMemeAddForm);
        sendAction({
            type: 'shared-meme-create',
            input: {
                term: String(formData.get('term') || '').trim(),
                category: optionalSharedMemeText(formData, 'category'),
                type: optionalSharedMemeText(formData, 'meme_type'),
                meaning: optionalSharedMemeText(formData, 'meaning'),
                usage: optionalSharedMemeText(formData, 'usage'),
                origin: optionalSharedMemeText(formData, 'origin'),
                notes: optionalSharedMemeText(formData, 'notes'),
                aliases: sharedMemeLines(formData, 'aliases'),
                examples: sharedMemeLines(formData, 'examples'),
                keywords: sharedMemeLines(formData, 'keywords'),
            },
        });
    });
    document.querySelectorAll('[data-demo-action]').forEach((button) => {
        button.addEventListener('click', () => {
            showCandidateNotice(window.__doorbellCandidateDemo ? button.dataset.demoAction + '为演示入口' : '该功能尚未接入');
        });
    });
    document.querySelectorAll('[data-demo-setting], [data-demo-control]').forEach((control) => {
        control.addEventListener('change', () => {
            if (window.__doorbellCandidateDemo) showCandidateNotice('演示设置已更新（不会保存）');
        });
    });
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !candidateNoticeModal.hidden) closeCandidateNotice();
    });
    window.addEventListener('message', (event) => {
        if (event.source !== window.parent) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'doorbell-candidate2:memorial-color-sampled') {
            const keys = Object.keys(data).sort();
            if (
                keys.length !== 2 ||
                keys[0] !== 'color' ||
                keys[1] !== 'type' ||
                (data.color !== null && (typeof data.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(data.color)))
            ) return;
            if (!memorialEditorSamplingColor || !memorialEditorSamplingTarget) return;
            if (data.color) {
                const state = memorialEditorState(memorialEditorSamplingTarget);
                state.color = data.color;
                memorialEditorColorInput.value = data.color;
                applyMemorialEditorState(memorialEditorSamplingTarget);
                saveMemorialEditorLayout();
                memorialEditorStatus.textContent = '已吸取底图颜色 ' + data.color + '。';
            } else {
                memorialEditorStatus.textContent = '这次没有取到颜色，请再点一次底图。';
            }
            memorialEditorSamplingColor = false;
            memorialEditorSamplingTarget = null;
            memorialPage.classList.remove('is-sampling-color');
            return;
        }
        if (data.type !== 'doorbell-candidate2:state') return;
        applyRuntimeState(data.state, data.demo);
    });

    const originalShowScreen = window.showScreen;
    window.showScreen = (screenId) => {
        originalShowScreen(screenId);
        if (currentStage === 'authenticated') {
            const lingyeFullscreenPageOpen =
                screenId === 'screen-lingye-glimmer' || screenId === 'screen-lingye-memorial';
            mainNav.style.display = lingyeFullscreenPageOpen ? 'none' : 'flex';
            if (lingyeFullscreenPageOpen) mainNav.setAttribute('aria-hidden', 'true');
            else mainNav.removeAttribute('aria-hidden');
        }
        if (screenId === 'screen-home') syncHomeScale();
    };

    showScreen('screen-login');
    syncProfileScale();
    mainNav.style.display = 'none';
    setFormDisabled(credentialsForm, true);
    setStatus(credentialsStatus, '正在确认登录状态……');
    sendAction({ type: 'view-ready' });
`;

function replaceBetween(source: string, start: string, end: string, replacement: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex === -1 || endIndex === -1) {
    throw new Error("Candidate 2 runtime anchor is missing.");
  }

  return `${source.slice(0, startIndex)}${replacement}${source.slice(endIndex)}`;
}

export function buildCandidateTwoRuntimeHtml() {
  let html = candidateTwoHtml
    .replace('<link href="./css2" rel="stylesheet" vid="5">', `${GOOGLE_FONTS}${MOQU_GUFENG_FONT}`)
    .replace(
      "</style>",
      `${HOME_SIGN_STYLES}${RUNTIME_STYLES}${SHARED_MEME_STYLES}${RESIDENCY_PERMIT_STYLES}${LINGYE_STYLES}    </style>`,
    )
    .replace(HOME_HEADER, HOME_HEADER_RUNTIME)
    .replace(HOME_CLIMATE_CARD, "")
    .replace(
      '        <div class="nav-item" onclick="showScreen(&#39;screen-home&#39;)"',
      `${LINGYE_NAV_ITEM}\n        <div class="nav-item" onclick="showScreen(&#39;screen-home&#39;)"`,
    )
    .replace(
      "if (screenId === 'screen-home') updateNav(1);",
      "if (screenId === 'screen-lingye') updateNav(1);\n        if (screenId === 'screen-home') updateNav(2);",
    )
    .replace(
      "if (screenId === 'screen-profile') updateNav(2);",
      "if (screenId === 'screen-profile') updateNav(3);",
    )
    .replace("</script>", `${HOME_SCRIPT}\n${LINGYE_SCRIPT}\n</script>`);

  html = replaceBetween(
    html,
    RESIDENCY_PERMIT_START,
    RESIDENCY_PERMIT_END,
    `${RESIDENCY_PERMIT_CONTENT_WITH_LAYOUT}\n        </div>\n\n`,
  );

  html = replaceBetween(
    html,
    '        <div class="input-group" vid="18">',
    '    <div id="screen-residency"',
    `${LOGIN_RUNTIME_CONTENT}\n    </div>\n\n    \n`,
  );
  html = replaceBetween(
    html,
    '        <div class="home-grid" vid="67">',
    '    <div id="screen-profile"',
    `${HOME_RUNTIME_CONTENT}\n    </div>\n\n    \n`,
  );
  html = replaceBetween(
    html,
    '    <div id="screen-profile" class="screen active" vid="89">',
    '    <nav class="bottom-nav"',
    `    <div id="screen-profile" class="screen" vid="89">\n${PROFILE_RUNTIME_CONTENT}\n    </div>\n\n    \n`,
  );

  html = html
    .replace(
      '    <div id="screen-profile" class="screen"',
      `${LINGYE_SCREEN}\n${LINGYE_INSTITUTION_SCREENS}\n${LINGYE_PLACE_SCREENS}\n    <div id="screen-profile" class="screen"`,
    )
    .replace(
      '    <nav class="bottom-nav"',
      `${SETTINGS_SCREEN}\n${SHARED_MEMES_SCREEN}\n    <nav class="bottom-nav"`,
    )
    .replace(
      '<button class="btn-primary" style="margin-top: 40px;" onclick="finalizeResidency()" vid="51">Confirm &amp; Finish / 确认入住</button>',
      '<button id="permit-finish-button" class="btn-primary" style="margin-top: 40px;" type="button">进入小机活动室</button>',
    )
    .replace(
      '<div class="nav-item" onclick="showScreen(&#39;screen-lounge&#39;)" vid="122">',
      '<div class="nav-item" role="button" tabindex="0" aria-label="小机活动室" onclick="showScreen(&#39;screen-lounge&#39;)" vid="122">',
    )
    .replace(
      '<div class="nav-item" onclick="showScreen(&#39;screen-home&#39;)" vid="128">',
      '<div class="nav-item" role="button" tabindex="0" aria-label="我的家" onclick="showScreen(&#39;screen-home&#39;)" vid="128">',
    )
    .replace(
      '<div class="nav-item active" onclick="showScreen(&#39;screen-profile&#39;)" vid="132">',
      '<div class="nav-item active" role="button" tabindex="0" aria-label="业主档案" onclick="showScreen(&#39;screen-profile&#39;)" vid="132">',
    )
    .replace("    </nav>\n</div>", `${SETTINGS_NAV_ITEM}\n    </nav>\n</div>`)
    .replace(
      "if (screenId === 'screen-profile') updateNav(3);",
      "if (screenId === 'screen-profile') updateNav(3);\n        if (screenId === 'screen-settings') updateNav(4);",
    )
    .replace(
      'id="main-nav" style="display: flex;"',
      'id="main-nav" style="display: none; --candidate2-nav-share: 20%;" aria-label="社区主导航"',
    )
    .replace(
      "</body>",
      `${TRANSIENT_NOTICE_MODAL}\n<script>${CANDIDATE_RUNTIME_SCRIPT}\n    document.querySelectorAll('.nav-item[role="button"]').forEach((item) => {\n        item.addEventListener('keydown', (event) => {\n            if (event.key === 'Enter' || event.key === ' ') {\n                event.preventDefault();\n                item.click();\n            }\n        });\n    });\n</script>\n</body>`,
    )
    .replace(
      /(id="screen-(?:login|residency|lounge|lingye|home|profile|settings|shared-memes)" class="screen(?: screen--lingye)?) active"/g,
      '$1"',
    );

  return html;
}

const candidateTwoMemorialBackdropSource = "/lingye/memorial/memorial-album-backdrop-v1.jpg";
let candidateTwoMemorialBackdropImagePromise: Promise<HTMLImageElement> | null = null;

function loadCandidateTwoMemorialBackdropImage() {
  if (!candidateTwoMemorialBackdropImagePromise) {
    candidateTwoMemorialBackdropImagePromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = candidateTwoMemorialBackdropSource;
    });
  }
  return candidateTwoMemorialBackdropImagePromise;
}

async function sampleCandidateTwoMemorialBackdropColor(xRatio: number, yRatio: number) {
  const image = await loadCandidateTwoMemorialBackdropImage();
  const sourceX = Math.min(
    image.naturalWidth - 1,
    Math.max(0, Math.round(xRatio * image.naturalWidth)),
  );
  const sourceY = Math.min(
    image.naturalHeight - 1,
    Math.max(0, Math.round(yRatio * image.naturalHeight)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("memorial_backdrop_canvas_unavailable");
  }
  context.drawImage(image, sourceX, sourceY, 1, 1, 0, 0, 1, 1);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  return `#${[pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function CandidateTwoPreview({ demo = null, onAction, state }: CandidateTwoPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const demoRef = useRef(demo);
  const onActionRef = useRef(onAction);
  const stateRef = useRef(state);
  const srcDoc = useMemo(() => buildCandidateTwoRuntimeHtml(), []);

  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    demoRef.current = demo;
  }, [demo]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const action = parseCandidateTwoAction(event.data);
      if (!action) {
        return;
      }

      if (action.type === "view-ready") {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "doorbell-candidate2:state", state: stateRef.current, demo: demoRef.current },
          "*",
        );
        return;
      }

      if (action.type === "navigate") {
        if (demoRef.current || shouldHandleCandidateNavigationInParent(action.path)) {
          onActionRef.current(action);
          return;
        }
        window.location.assign(action.path);
        return;
      }

      if (action.type === "glimmer-animal-layout-change") {
        if (!demoRef.current?.glimmerAnimalEditor.enabled) {
          return;
        }
        const url = new URL(window.location.href);
        for (const [animalId, [xParam, yParam]] of Object.entries(
          candidateTwoGlimmerAnimalPositionParams,
        ) as [CandidateTwoGlimmerAnimalPositionId, readonly [string, string]][]) {
          url.searchParams.set(xParam, String(action.positions[animalId].x));
          url.searchParams.set(yParam, String(action.positions[animalId].y));
        }
        url.searchParams.set("gaLayout", "5");
        for (const legacyParam of candidateTwoLegacyGlimmerAnimalLabelPositionParams) {
          url.searchParams.delete(legacyParam);
        }
        window.history.replaceState(null, "", url);
        return;
      }

      if (action.type === "memorial-layout-save") {
        if (!demoRef.current?.memorialLayoutEditor.enabled) {
          return;
        }
        const url = new URL(window.location.href);
        const layoutParam =
          demoRef.current.memorialLayoutEditor.target === "entry"
            ? "memorialEntryLayout"
            : "memorialLayout";
        url.searchParams.set(layoutParam, action.encodedLayout);
        window.history.replaceState(null, "", url);
        return;
      }

      if (action.type === "memorial-backdrop-color-sample") {
        if (!demoRef.current?.memorialLayoutEditor.enabled) {
          return;
        }
        void sampleCandidateTwoMemorialBackdropColor(action.xRatio, action.yRatio)
          .then((color) => {
            iframeRef.current?.contentWindow?.postMessage(
              { type: "doorbell-candidate2:memorial-color-sampled", color },
              "*",
            );
          })
          .catch(() => {
            iframeRef.current?.contentWindow?.postMessage(
              { type: "doorbell-candidate2:memorial-color-sampled", color: null },
              "*",
            );
          });
        return;
      }

      onActionRef.current(action);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "doorbell-candidate2:state", state, demo },
      "*",
    );
  }, [demo, state]);

  return (
    <main className="candidate-two-preview">
      <iframe
        allow="clipboard-write"
        ref={iframeRef}
        sandbox="allow-forms allow-scripts"
        srcDoc={srcDoc}
        title="Doorbell Commons"
      />
    </main>
  );
}
