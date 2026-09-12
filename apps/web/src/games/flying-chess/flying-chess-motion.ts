import type {
  FlyingLastMove,
  FlyingMove,
  FlyingPiece,
  FlyingPlayer,
  FlyingView,
} from "./flying-chess-client";
import {
  BOARD_CENTER,
  type BoardPoint,
  HANGAR_POINTS,
  HOME_POINTS,
  LAUNCH_POINTS,
  TRACK_POINTS,
} from "./flying-chess-interaction";

type MotionPoint = BoardPoint & { duration: number; kind: "step" | "jump" | "flight" };

function progressPoint(
  view: FlyingView,
  player: FlyingPlayer,
  piece: FlyingPiece,
  progress: number,
): BoardPoint {
  if (progress < 0) return HANGAR_POINTS[player.seat]![piece.number - 1]!;
  if (progress === 0) return LAUNCH_POINTS[player.seat]!;
  if (progress <= view.board.main_steps)
    return TRACK_POINTS[
      (view.board.start_indices[player.seat]! + progress - 1) % view.board.outer_length
    ]!;
  if (progress < view.board.goal_progress)
    return HOME_POINTS[player.seat]![progress - view.board.main_steps - 1]!;
  return BOARD_CENTER;
}

export function flightPathPoints(view: FlyingView, seat: number): BoardPoint[] {
  const start = view.board.start_indices[seat]!;
  return [
    TRACK_POINTS[(start + view.board.flight_source_progress - 1) % view.board.outer_length]!,
    HOME_POINTS[(seat + 2) % 4]![view.board.home_cross_progress - view.board.main_steps - 1]!,
    TRACK_POINTS[(start + view.board.flight_dest_progress - 1) % view.board.outer_length]!,
  ];
}

export function arrivalReturnPath(view: FlyingView, move: FlyingLastMove): BoardPoint[] {
  if (move.to_progress !== view.board.goal_progress) return [];
  const player = view.players.find((candidate) => candidate.id === move.player_id);
  if (!player) return [];
  return [BOARD_CENTER, HANGAR_POINTS[player.seat]![move.piece_number - 1]!];
}

// Dice supply the ordinary steps; special moves come only from the authoritative effect list.
export function movementPath(view: FlyingView, move: FlyingLastMove): MotionPoint[] {
  const player = view.players.find((p) => p.id === move.player_id);
  const piece = player?.pieces.find((p) => p.id === move.piece_id);
  if (!player || !piece) return [];
  const path: MotionPoint[] = [
    { ...progressPoint(view, player, piece, move.from_progress), duration: 0, kind: "step" },
  ];
  const add = (progress: number, kind: MotionPoint["kind"], duration: number) =>
    path.push({ ...progressPoint(view, player, piece, progress), kind, duration });
  if (move.from_progress < 0 || move.to_progress < 0) {
    add(move.to_progress, "jump", 320);
    return path;
  }
  let progress = move.from_progress;
  for (let step = 1; step <= move.dice; step++) {
    const raw = move.from_progress + step;
    progress = raw > view.board.goal_progress ? 2 * view.board.goal_progress - raw : raw;
    add(progress, "step", 240);
  }
  for (const effect of move.effects) {
    if (effect === "color_jump") {
      progress += 4;
      add(progress, "jump", 280);
    } else if (effect === "flight") {
      const crossing = flightPathPoints(view, player.seat)[1]!;
      path.push({ ...crossing, kind: "flight", duration: 260 });
      progress = view.board.flight_dest_progress;
      add(progress, "flight", 260);
    }
  }
  // Keep the engine's destination authoritative if a future effect adds another landing.
  const target = progressPoint(view, player, piece, move.to_progress);
  if (path.at(-1)?.x !== target.x || path.at(-1)?.y !== target.y)
    path.push({ ...target, kind: "step", duration: 240 });
  return path;
}

const position = (point: BoardPoint) => ({
  left: `${((point.x + 0.5) / 15) * 100}%`,
  top: `${((point.y + 0.5) / 15) * 100}%`,
});

export async function animateFlyingMove(
  board: HTMLElement | null,
  before: FlyingView,
  after: FlyingView,
  command: FlyingMove,
  signal?: AbortSignal,
): Promise<void> {
  const move = after.last_move;
  if (
    !board || signal?.aborted ||
    command.action === "roll" ||
    !move ||
    move.piece_id !== command.piece_id ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  const buttons = [...board.querySelectorAll<HTMLButtonElement>("[data-piece-id]")];
  const actor = buttons.find((button) => button.dataset.pieceId === move.piece_id);
  const path = movementPath(before, move);
  if (!actor || path.length < 2) return;
  const duration = path.reduce((sum, point) => sum + point.duration, 0);
  const frames: Keyframe[] = [
    {
      left: actor.style.getPropertyValue("--piece-x"),
      top: actor.style.getPropertyValue("--piece-y"),
      offset: 0,
    },
  ];
  let elapsed = 0;
  path.slice(1).forEach((point, index) => {
    if (point.kind === "flight") {
      elapsed += point.duration;
      frames.push({
        ...position(point),
        transform: "translate(-50%, -50%)",
        offset: elapsed / duration,
        easing: "linear",
      });
      return;
    }
    const previous = path[index]!;
    const from =
      index === 0
        ? {
            left: actor.style.getPropertyValue("--piece-x"),
            top: actor.style.getPropertyValue("--piece-y"),
          }
        : position(previous);
    const landed = { ...position(point), transform: "translate(-50%, -50%)" };
    frames.push({
      ...from,
      transform: "translate(-50%, -50%)",
      offset: (elapsed + point.duration * 0.12) / duration,
      easing: "ease-out",
    });
    frames.push({
      ...position({ x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 }),
      transform:
        point.kind === "step"
          ? "translate(-50%, -85%) scale(1.1)"
          : "translate(-50%, -100%) scale(1.18)",
      offset: (elapsed + point.duration * 0.46) / duration,
      easing: "ease-in",
    });
    frames.push({
      ...landed,
      offset: (elapsed + point.duration * 0.78) / duration,
      easing: "linear",
    });
    elapsed += point.duration;
    frames.push({ ...landed, offset: elapsed / duration });
  });
  actor.dataset.moving = "true";
  let guide: Element | null = null;
  if (move.effects.includes("flight")) {
    const seat = before.players.find((player) => player.id === move.player_id)?.seat;
    guide = board.querySelector(`[data-flight-seat="${seat}"]`);
    guide?.classList.add("is-active");
  }
  const animation = actor.animate(frames, { duration, easing: "linear", fill: "forwards" });
  const cancel = () => board.getAnimations({ subtree: true }).forEach(item => item.cancel());
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    await animation.finished;
    if(signal?.aborted)return;
    await Promise.all(
      move.captured_piece_ids.map(async (id) => {
        const captured = buttons.find((button) => button.dataset.pieceId === id);
        const owner = before.players.find((player) =>
          player.pieces.some((piece) => piece.id === id),
        );
        const piece = owner?.pieces.find((candidate) => candidate.id === id);
        if (!captured || !owner || !piece) return;
        const returning = captured.animate(
          [
            {
              left: captured.style.getPropertyValue("--piece-x"),
              top: captured.style.getPropertyValue("--piece-y"),
            },
            { ...position(HANGAR_POINTS[owner.seat]![piece.number - 1]!), opacity: 0.6 },
          ],
          { duration: 280, fill: "forwards", easing: "ease-in-out" },
        );
        try {
          await returning.finished;
          returning.commitStyles();
        } finally {
          returning.cancel();
        }
      }),
    );
    animation.commitStyles();
    animation.cancel();
    const arrival = arrivalReturnPath(before, move);
    if (arrival.length) {
      actor.dataset.arriving = "true";
      const token = actor.querySelector<HTMLElement>(".fc-piece__token");
      if (token) {
        const flip = token.animate(
          [
            { transform: "rotateY(0deg)", offset: 0 },
            { transform: "rotateY(0deg)", offset: 0.25 },
            { transform: "rotateY(180deg)", offset: 1 },
          ],
          { duration: 400, fill: "forwards", easing: "ease-in-out" },
        );
        try {
          await flip.finished;
          flip.commitStyles();
        } finally {
          flip.cancel();
        }
      }
      const returnToAirport = actor.animate(
        [
          { ...position(arrival[0]!), transform: "translate(-50%, -50%)" },
          { ...position(arrival[1]!), transform: "translate(-50%, -50%)" },
        ],
        { duration: 420, fill: "forwards", easing: "ease-in-out" },
      );
      try {
        await returnToAirport.finished;
        returnToAirport.commitStyles();
      } finally {
        returnToAirport.cancel();
      }
    }
  } catch {
    // Unmounting or restarting cancels the visual transition.
  } finally {
    signal?.removeEventListener("abort", cancel);
    animation.cancel();
    guide?.classList.remove("is-active");
    delete actor.dataset.moving;
    delete actor.dataset.arriving;
  }
}
