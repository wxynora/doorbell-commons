import type { WerewolfMove, WerewolfView } from "./werewolf-client";

export function targetMove(view: WerewolfView, playerId: string): WerewolfMove | null {
  const candidates = view.legal_moves.filter(
    (move) => "target_id" in move && move.target_id === playerId,
  );
  if (view.phase === "night_witch") {
    return candidates.find((move) => move.action === "witch" && move.use === "poison") ?? null;
  }
  return candidates[0] ?? null;
}

export function moveByAction(
  view: WerewolfView,
  action: WerewolfMove["action"],
  use?: "pass" | "heal" | "poison",
): WerewolfMove | null {
  return (
    view.legal_moves.find(
      (move) => move.action === action && (move.action !== "witch" || move.use === use),
    ) ?? null
  );
}

const SPEECHES = [
  "先听完整轮发言，我会重点看投票理由。",
  "昨夜信息有限，先别急着把身份坐死。",
  "我会记一下前后矛盾和跟票位置。",
  "这一轮先看谁在回避具体判断。",
] as const;

export function residentSpeech(view: WerewolfView): string {
  return SPEECHES[(view.day + view.revision) % SPEECHES.length] ?? SPEECHES[0];
}

export function chooseResidentMove(view: WerewolfView): WerewolfMove | null {
  if (view.phase === "round_over") return null;
  if (view.phase === "discussion") {
    if (!view.legal_actions.includes("speak")) return null;
    return { action: "speak", text: residentSpeech(view), label: "公开发言" };
  }
  if (view.phase === "night_witch") {
    return moveByAction(view, "witch", "heal") ?? moveByAction(view, "witch", "pass") ?? null;
  }
  if (view.phase === "day_vote" && view.private?.role === "seer") {
    const knownWolf = view.private.seer_checks?.find((check) => check.is_wolf);
    if (knownWolf) {
      const knownMove = targetMove(view, knownWolf.target_id);
      if (knownMove) return knownMove;
    }
  }
  if (view.phase === "hunter_shot") {
    return moveByAction(view, "hunter_pass") ?? null;
  }
  return view.legal_moves[0] ?? null;
}

export function phaseCopy(view: WerewolfView): { title: string; instruction: string } {
  const mine = view.current_player_id === view.viewer_id;
  const current = view.players.find((player) => player.id === view.current_player_id);
  if (view.phase === "round_over") {
    return {
      title: `${view.result?.winner_label ?? "本局"}获胜`,
      instruction: "身份已经公开，可以换人数再开一局",
    };
  }
  const waiting = current ? `等待 ${current.name}` : "等待其他玩家";
  if (view.phase === "night_wolf")
    return {
      title: `第 ${view.night} 夜 · 狼人行动`,
      instruction: mine ? "点一名非狼人玩家" : waiting,
    };
  if (view.phase === "night_seer")
    return {
      title: `第 ${view.night} 夜 · 预言家查验`,
      instruction: mine ? "点一名玩家查看阵营" : waiting,
    };
  if (view.phase === "night_witch")
    return {
      title: `第 ${view.night} 夜 · 女巫用药`,
      instruction: mine ? "选择解药、不用药，或点玩家使用毒药" : waiting,
    };
  if (view.phase === "hunter_shot")
    return { title: "猎人开枪", instruction: mine ? "点一名存活玩家，或放弃开枪" : waiting };
  if (view.phase === "discussion")
    return {
      title: `第 ${view.day} 天 · 公开讨论`,
      instruction: mine ? "说出判断，或直接过麦" : waiting,
    };
  return {
    title: `第 ${view.day} 天 · 放逐投票`,
    instruction: mine ? "直接点一名玩家投票" : waiting,
  };
}
