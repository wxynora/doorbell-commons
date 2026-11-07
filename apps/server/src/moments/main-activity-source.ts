import { randomUUID } from "node:crypto";
import { dailyDocumentFromEdition, dailyDocumentText } from "@doorbell/protocol";
import type { LingyeDailyIssueRecord } from "../lingye-daily-store.js";
import type { MomentsStore } from "./store.js";
import { MomentsError } from "./types.js";
import type { MomentsTool } from "./tool.js";

type StatusKey =
  | "newspaper.read" | "newspaper.comment"
  | "snow.win" | "snow.loss" | "snow.core-win" | "snow.core-loss"
  | "snow.timeout-win" | "snow.timeout-loss" | "snow.surrender-win" | "snow.surrender-loss"
  | "snow.champion" | "snow.champion-furniture" | "snow.harvest-buff";
type StatusReceipt = Parameters<MomentsStore["recordReceipt"]>[0] & { statusKeys: StatusKey[] };
type Game = {
  battleId: string; attackerTeamId: string; defenderTeamId: string; winnerTeamId: string;
  endReason?: "core_broken" | "time_limit" | "surrender";
  finishedAt?: number;
  participants?: Record<"attack" | "defend", { residentId: string; human: boolean }>;
};
type SnowEdition = {
  id: string; title: string; phase: string;
  teams: { id: string; members: { id: string }[] }[];
  matches: { id: string; status: string; winnerTeamId: string | null; games?: Game[] }[];
  bracket: { finalMatchId: string | null; championTeamId: string | null };
  settledGrants?: Record<string, { id: string; residentId: string; kind: string; gold: number; silver: number; journalIds: string[] }>;
  settledFurniture?: Record<string, { id: string; editionId: string; residentId: string; itemId: string; quantity: number; grantedAt: number }>;
  settledHarvest?: Record<string, { id: string; editionId: string; residentId: string; bonusPercent: number; grantedAt: number }>;
};

const validTime = (at: unknown, now: number): at is number =>
  typeof at === "number" && Number.isSafeInteger(at) && at >= 0 && at <= now;
const roles = ["attack", "defend"] as const;

function gameFacts(game: Game, role: typeof roles[number]) {
  if (!game.endReason) return undefined;
  const teamId = role === "attack" ? game.attackerTeamId : game.defenderTeamId;
  const won = game.winnerTeamId === teamId;
  const result: StatusKey = won ? "snow.win" : "snow.loss";
  const detail: StatusKey = game.endReason === "core_broken" ? (won ? "snow.core-win" : "snow.core-loss") :
    game.endReason === "time_limit" ? (won ? "snow.timeout-win" : "snow.timeout-loss") :
      (won ? "snow.surrender-win" : "snow.surrender-loss");
  return { statusKeys: [result, detail], facts: [
    { label: "赛果", value: won ? "胜利" : "失败" },
    { label: "身份", value: role === "attack" ? "进攻方" : "防守方" },
    { label: "结束方式", value: game.endReason === "core_broken" ? "击破核心" :
      game.endReason === "time_limit" ? "时间结束" : "认输" },
  ] };
}

/**
 * Consumes only Main's already-authorized read/comment and persisted tournament
 * facts. Event keys remain internal; no success text is parsed into facts.
 */
export class MainActivitySource {
  constructor(private readonly store: Pick<MomentsStore, "recordReceipt">,
    private readonly tool: Pick<MomentsTool, "shareOption">,
    private readonly report: (error: unknown) => void) {}

  private record(receipt: StatusReceipt): string | undefined {
    try { return this.store.recordReceipt(receipt); }
    catch (error) {
      // A former member no longer has a writable community home.
      if (!(error instanceof MomentsError && error.code === "actor_unavailable")) this.report(error);
      return undefined;
    }
  }

  private share(residentId: string, receiptId: string | undefined): string | undefined {
    if (!receiptId) return undefined;
    try {
      const option = this.tool.shareOption({ residentId }, receiptId);
      return `${option.label}：${option.option}\n补充：requestId、text、visibility；可附location`;
    } catch (error) {
      this.report(error);
      return undefined;
    }
  }

  /** The issue is the actual published revision read by this resident now. */
  dailyRead(residentId: string, issue: LingyeDailyIssueRecord, readAt: number): string | undefined {
    if (!validTime(issue.publishedAt, readAt) || !validTime(readAt, readAt)) return undefined;
    try {
      const document = issue.edition.editor_document ?? dailyDocumentFromEdition(issue.edition, issue.issueDate);
      const receiptId = this.record({ residentId, source: "lingye-daily-read",
        sourceId: JSON.stringify([issue.issueDate, issue.issueNumber, issue.revision, randomUUID()]),
        kind: "newspaper", title: "《铃野日报》", summary: dailyDocumentText(document), occurredAt: readAt,
        facts: [], statusKeys: ["newspaper.read"] });
      return this.share(residentId, receiptId);
    } catch (error) { this.report(error); return undefined; }
  }

  /** Called only after the existing comment transaction commits successfully. */
  dailyComment(input: { residentId: string; issueDate: string; sectionTitle: string;
    commentId: string; text: string; createdAt: number }): string | undefined {
    const receiptId = this.record({ residentId: input.residentId, source: "lingye-daily-comment",
      sourceId: JSON.stringify([input.issueDate, input.commentId]), kind: "newspaper-comment",
      title: input.sectionTitle, summary: input.text, occurredAt: input.createdAt,
      facts: [], statusKeys: ["newspaper.comment"] });
    return this.share(input.residentId, receiptId);
  }

  /**
   * Called with a persisted edition after Main's validated result/settlement.
   */
  syncSnow(edition: SnowEdition, now: number): void {
    const record = (residentId: string, sourceId: string, occurredAt: number, statusKeys: StatusKey[],
      facts: StatusReceipt["facts"] = []) => {
      this.record({ residentId, source: "snow-tournament-status", sourceId,
        kind: "snow-result", title: edition.title, summary: "", occurredAt, facts, statusKeys });
    };
    for (const match of edition.matches) for (const game of match.games ?? []) {
      if (!game.participants || !game.endReason || !validTime(game.finishedAt, now)) continue;
      for (const role of roles) {
        const participant: { residentId: string; human: boolean } = game.participants[role];
        if (!participant.human) continue;
        const view = gameFacts(game, role)!;
        record(participant.residentId, JSON.stringify(["game", edition.id, game.battleId]), game.finishedAt,
          view.statusKeys, view.facts);
      }
    }
    const championId = edition.bracket.championTeamId;
    const final = edition.matches.find(match => match.id === edition.bracket.finalMatchId);
    const lastGame = final?.games?.[2];
    if (edition.phase === "completed" && championId && final?.status === "completed" &&
        final.winnerTeamId === championId && lastGame && validTime(lastGame.finishedAt, now)) {
      for (const member of edition.teams.find(team => team.id === championId)?.members ?? [])
        record(member.id, JSON.stringify(["champion", edition.id]), lastGame.finishedAt, ["snow.champion"]);
    }
    for (const receipt of Object.values(edition.settledFurniture ?? {})) {
      if (receipt.editionId !== edition.id || receipt.itemId !== "farm_decor:snow_king" ||
          receipt.quantity !== 1 || !validTime(receipt.grantedAt, now)) continue;
      record(receipt.residentId, JSON.stringify(["snow.champion-furniture", edition.id, receipt.id]),
        receipt.grantedAt, ["snow.champion-furniture"], [{ label: "限定家具", value: `雪王×${receipt.quantity}` }]);
    }
    for (const receipt of Object.values(edition.settledHarvest ?? {})) {
      if (receipt.editionId !== edition.id || receipt.bonusPercent !== 15 || !validTime(receipt.grantedAt, now)) continue;
      record(receipt.residentId, JSON.stringify(["snow.harvest-buff", edition.id, receipt.id]),
        receipt.grantedAt, ["snow.harvest-buff"], [{ label: "丰收加成", value: `${receipt.bonusPercent}%` }]);
    }
  }

  /** The current resident sees only their own verified games and confirmed rewards. */
  snowShares(edition: SnowEdition, residentId: string, now: number): string[] {
    const shares: string[] = [];
    const offer = (receipt: StatusReceipt) => {
      const share = this.share(residentId, this.record(receipt));
      if (share) shares.push([receipt.title, ...receipt.facts.map(fact => `${fact.label}：${fact.value}`), share].join("\n"));
    };
    for (const match of edition.matches) for (const game of match.games ?? []) {
      if (!game.participants || !game.endReason || !validTime(game.finishedAt, now)) continue;
      for (const role of roles) {
        const participant: { residentId: string; human: boolean } = game.participants[role];
        if (!participant.human || participant.residentId !== residentId) continue;
        const view = gameFacts(game, role)!;
        const grantId = JSON.stringify(["snow-tournament", edition.id, game.battleId, residentId]);
        const grant = edition.settledGrants?.[grantId];
        const confirmed = grant?.id === grantId && grant.residentId === residentId && grant.kind === "match";
        const facts = [...view.facts, ...(confirmed ? [{ label: "奖金", value: `${grant.gold}金币、${grant.silver}银币` }] : [])];
        offer({ residentId, source: "snow-tournament-share", sourceId: JSON.stringify(["game", edition.id, game.battleId, confirmed ? grantId : null]),
          kind: "snow-result", title: edition.title, summary: "", occurredAt: game.finishedAt, facts, statusKeys: view.statusKeys });
      }
    }
    for (const receipt of Object.values(edition.settledFurniture ?? {})) {
      if (receipt.residentId !== residentId || receipt.editionId !== edition.id || receipt.itemId !== "farm_decor:snow_king" ||
          receipt.quantity !== 1 || !validTime(receipt.grantedAt, now)) continue;
      offer({ residentId, source: "snow-tournament-status", sourceId: JSON.stringify(["snow.champion-furniture", edition.id, receipt.id]),
        kind: "snow-result", title: edition.title, summary: "", occurredAt: receipt.grantedAt,
        facts: [{ label: "限定家具", value: `雪王×${receipt.quantity}` }], statusKeys: ["snow.champion-furniture"] });
    }
    for (const receipt of Object.values(edition.settledHarvest ?? {})) {
      if (receipt.residentId !== residentId || receipt.editionId !== edition.id || receipt.bonusPercent !== 15 ||
          !validTime(receipt.grantedAt, now)) continue;
      offer({ residentId, source: "snow-tournament-status", sourceId: JSON.stringify(["snow.harvest-buff", edition.id, receipt.id]),
        kind: "snow-result", title: edition.title, summary: "", occurredAt: receipt.grantedAt,
        facts: [{ label: "丰收加成", value: `${receipt.bonusPercent}%` }], statusKeys: ["snow.harvest-buff"] });
    }
    return shares;
  }
}
