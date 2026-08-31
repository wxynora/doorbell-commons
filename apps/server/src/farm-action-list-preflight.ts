import type { FarmActionListItem, FarmActionListItemView } from "@doorbell/protocol";
import type {
  FarmActionListMessageItem,
  FarmActionListToolCall,
} from "./farm-action-list-message.js";

export interface FarmActionListProfile {
  residentId: string;
  homeId: string;
  farmDoorplate: string;
  farmHumanKey: string;
}

export interface FarmActionListFieldSnapshot {
  maturePlotCount: number;
  emptyPlotCount: number;
  commonSeeds: number;
  fantasySeeds: number;
  limitedSeeds: Readonly<Record<string, number>>;
}

export interface FarmActionListStealSnapshot {
  targets: readonly { target: string; plotId: number }[];
}

export interface FarmActionListFishSnapshot {
  remainingAttempts: number;
  availableBaits: readonly string[];
}

export interface FarmActionListExploreSnapshot {
  remainingCharges: number;
  activeJourney: boolean;
}

export interface FarmActionListResolvedItem {
  actionable: boolean;
  displayText: string;
  reason: string | null;
  call: FarmActionListToolCall | null;
}

export interface FarmActionListActivitySnapshot {
  activityId: string;
  name: string;
  completed: boolean;
  call: FarmActionListToolCall;
}

export interface FarmActionListAuthorityReader {
  readField(profile: FarmActionListProfile): Promise<FarmActionListFieldSnapshot>;
  readSteal(profile: FarmActionListProfile): Promise<FarmActionListStealSnapshot>;
  readFish(profile: FarmActionListProfile): Promise<FarmActionListFishSnapshot>;
  readExplore(profile: FarmActionListProfile): Promise<FarmActionListExploreSnapshot>;
  resolveCook(
    profile: FarmActionListProfile,
    item: Extract<FarmActionListItem, { kind: "cook" }>,
  ): Promise<FarmActionListResolvedItem>;
  resolveActivity(
    profile: FarmActionListProfile,
    item: Extract<FarmActionListItem, { kind: "activity" }>,
  ): Promise<FarmActionListResolvedItem>;
  readActivities(profile: FarmActionListProfile): Promise<FarmActionListActivitySnapshot[]>;
}

export interface FarmActionListCheckedItem {
  view: FarmActionListItemView;
  messageItem: FarmActionListMessageItem | null;
}

const plantCall = (): FarmActionListToolCall => ({ op: "farm.plant", args: {} });

const fishCall = (): FarmActionListToolCall => ({ op: "farm.fish.cast", args: {} });

const exploreCall = (): FarmActionListToolCall => ({ op: "farm.explore", args: {} });

function fallback(item: FarmActionListItem): {
  displayText: string;
  toolCalls: FarmActionListToolCall[];
} {
  if (item.kind === "harvest") {
    return { displayText: "收菜", toolCalls: [{ op: "farm.harvest", args: {} }] };
  }
  if (item.kind === "plant") {
    return {
      displayText: item.details ? `种菜：${item.details}` : "种菜",
      toolCalls: [plantCall()],
    };
  }
  if (item.kind === "buy") {
    return { displayText: `购买：${item.details}`, toolCalls: [] };
  }
  if (item.kind === "steal") {
    return {
      displayText: "偷菜",
      toolCalls: [
        { op: "farm.visit", args: {} },
        { op: "farm.steal", args: { to: "1", plotId: 1 } },
      ],
    };
  }
  if (item.kind === "fish") return { displayText: "钓鱼", toolCalls: [fishCall()] };
  if (item.kind === "explore") return { displayText: "探险", toolCalls: [exploreCall()] };
  if (item.kind === "cook") return { displayText: "做饭", toolCalls: [] };
  if (item.kind === "activity") {
    return { displayText: `参加活动：${item.activity_id}`, toolCalls: [] };
  }
  return { displayText: item.text, toolCalls: [] };
}

export function createFarmActionListDraftView(item: FarmActionListItem): FarmActionListItemView {
  const { displayText } = fallback(item);
  return {
    item,
    status: "active",
    reason: null,
    display_text: displayText,
  };
}

function checked(
  item: FarmActionListItem,
  status: FarmActionListItemView["status"],
  reason: string | null,
  displayText: string,
  toolCalls: readonly FarmActionListToolCall[],
): FarmActionListCheckedItem {
  return {
    view: { item, status, reason, display_text: displayText },
    messageItem: status === "crossed" ? null : { text: displayText, toolCalls },
  };
}

export async function preflightFarmActionList(
  profile: FarmActionListProfile,
  items: readonly FarmActionListItem[],
  authority: FarmActionListAuthorityReader,
): Promise<FarmActionListCheckedItem[]> {
  let field: Promise<FarmActionListFieldSnapshot> | undefined;
  let steal: Promise<FarmActionListStealSnapshot> | undefined;
  let fish: Promise<FarmActionListFishSnapshot> | undefined;
  let explore: Promise<FarmActionListExploreSnapshot> | undefined;
  const readField = () => {
    if (!field) field = authority.readField(profile);
    return field;
  };
  const readSteal = () => {
    if (!steal) steal = authority.readSteal(profile);
    return steal;
  };
  const readFish = () => {
    if (!fish) fish = authority.readFish(profile);
    return fish;
  };
  const readExplore = () => {
    if (!explore) explore = authority.readExplore(profile);
    return explore;
  };
  return Promise.all(
    items.map(async (item) => {
      const base = fallback(item);
      if (item.kind === "note") return checked(item, "active", null, item.text, []);
      try {
        if (item.kind === "harvest") {
          const snapshot = await readField();
          return snapshot.maturePlotCount > 0
            ? checked(item, "active", null, base.displayText, base.toolCalls)
            : checked(item, "crossed", "当前没有成熟作物", base.displayText, []);
        }
        if (item.kind === "plant") {
          const snapshot = await readField();
          if (snapshot.emptyPlotCount === 0) {
            return checked(item, "crossed", "当前没有空地", base.displayText, []);
          }
          const hasSeed =
            snapshot.commonSeeds > 0 ||
            snapshot.fantasySeeds > 0 ||
            Object.values(snapshot.limitedSeeds).some((quantity) => quantity > 0);
          return hasSeed
            ? checked(item, "active", null, base.displayText, base.toolCalls)
            : checked(item, "crossed", "当前没有对应种子", base.displayText, []);
        }
        if (item.kind === "buy") return checked(item, "active", null, base.displayText, []);
        if (item.kind === "steal") {
          const snapshot = await readSteal();
          const target = snapshot.targets[0];
          return target
            ? checked(item, "active", null, "偷菜", [
                { op: "farm.visit", args: {} },
                { op: "farm.steal", args: { to: target.target, plotId: target.plotId } },
              ])
            : checked(item, "crossed", "当前没有可偷目标", "偷菜", []);
        }
        if (item.kind === "fish") {
          const snapshot = await readFish();
          if (snapshot.remainingAttempts === 0) {
            return checked(item, "crossed", "今日钓鱼次数已用完", "钓鱼", []);
          }
          return checked(item, "active", null, "钓鱼", [fishCall()]);
        }
        if (item.kind === "explore") {
          const snapshot = await readExplore();
          return !snapshot.activeJourney && snapshot.remainingCharges === 0
            ? checked(item, "crossed", "今日探险次数已用完", "探险", [])
            : checked(item, "active", null, "探险", [exploreCall()]);
        }
        if (item.kind === "cook") {
          const resolved = await authority.resolveCook(profile, item);
          return resolved.actionable
            ? checked(
                item,
                "active",
                null,
                resolved.displayText,
                resolved.call ? [resolved.call] : [],
              )
            : checked(item, "crossed", resolved.reason ?? "当前无法制作", resolved.displayText, []);
        }
        const resolved = await authority.resolveActivity(profile, item);
        return resolved.actionable
          ? checked(
              item,
              "active",
              null,
              resolved.displayText,
              resolved.call ? [resolved.call] : [],
            )
          : checked(item, "crossed", resolved.reason ?? "当前无法参加", resolved.displayText, []);
      } catch {
        return checked(
          item,
          "authority_unavailable",
          "权威状态暂时无法核对",
          base.displayText,
          base.toolCalls,
        );
      }
    }),
  );
}
