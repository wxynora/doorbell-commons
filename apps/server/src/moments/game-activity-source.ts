import { extractGameOutcome } from "../games/game-outcome.js";
import { residentRoundResults } from "../lounge-game-effects.js";
import type { GameRoom } from "../games/types.js";
import type { MomentsStore } from "./store.js";
import type { MomentsToolOptions } from "./tool-options.js";
import { MomentsError } from "./types.js";

export const loungeGameNames = {
  "leaf-game": "叶子戏", doudizhu: "斗地主", "flying-chess": "飞行棋",
  uno: "UNO", monopoly: "大富翁", mahjong: "麻将",
} as const;
const source = "lounge-game";

/** Captures only confirmed, committed results; engine state and chat never enter a receipt. */
export class GameActivitySource {
  constructor(private readonly store: Pick<MomentsStore, "recordReceipt" | "activityReceiptId">,
    private readonly options: Pick<MomentsToolOptions, "issue">,
    private readonly report: (error: unknown) => void) {}

  capture(room: GameRoom, occurredAt: number): void {
    const outcome = extractGameOutcome(room.kind, room.snapshot);
    const settlement = room.settlement;
    if (!outcome || !settlement || settlement.settlementId !== room.lastSettlementId ||
        settlement.settlementId !== `${room.kind}:${room.roomId}:${outcome.settlementId}` ||
        !Number.isSafeInteger(occurredAt) || occurredAt < 0) return;
    const title = loungeGameNames[room.kind];
    if (!title) return;
    for (const player of residentRoundResults(outcome.outcome, room.seats)) {
      try {
        const seat = room.seats.find(seat => seat.controllerType === "resident" && seat.residentId === player.residentId);
        const account = settlement.accounts.find(account => account.residentId === player.residentId);
        if (!seat || !account || !Number.isSafeInteger(account.actualDelta)) continue;
        if (this.store.activityReceiptId(player.residentId, source, settlement.settlementId)) continue;
        const result = seat.forfeited ? "中途退出" : player.result === "draw" ? "流局" : player.result === "win" ? "胜利" : "失败";
        const silver = account.actualDelta > 0 ? `+${account.actualDelta}` : account.actualDelta < 0 ? String(account.actualDelta) : "无变化";
        this.store.recordReceipt({ residentId: player.residentId, source, sourceId: settlement.settlementId,
          kind: `game-${room.kind}`, title, summary: "", occurredAt,
          facts: [{ label: "赛果", value: result },
            ...(outcome.roundNumber === null ? [] : [{ label: "局数", value: `第${outcome.roundNumber}局` }]),
            { label: "本家银币", value: silver }],
        });
      } catch (error) { this.reportFailure(error); }
    }
  }

  share(residentId: string, settlementId: string): string | undefined {
    try {
      const receiptId = this.store.activityReceiptId(residentId, source, settlementId);
      if (!receiptId) return undefined;
      const option = this.options.issue({ residentId }, "share", receiptId);
      return `转发到朋友圈：${option}\n补充：requestId、text、visibility；可附location`;
    } catch (error) { this.reportFailure(error); return undefined; }
  }

  private reportFailure(error: unknown): void {
    if (error instanceof MomentsError && error.code === "actor_unavailable") return;
    try { this.report(error); } catch { /* A committed game result remains successful. */ }
  }
}
