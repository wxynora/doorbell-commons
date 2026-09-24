import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import {
  CRUST_LEVELS,
  CRUST_STAGES,
  MOONCAKE_MERGE_BOARD,
  MooncakeMergeModel,
  type MooncakeMergePiece,
  type MooncakeMergeSnapshot,
} from "./mooncake-merge-model";
import "./mooncake-merge-game.css";

const STAGE_WIDTH = 402;
const STAGE_HEIGHT = 874;
const CRUST_TARGET_SLOTS = ["first-wrapper", "second-wrapper"] as const;

const PIECE_COLORS = [
  ["#f0c45f", "#a96924"],
  ["#9bd66e", "#397446"],
  ["#63b69a", "#286a62"],
  ["#dfac36", "#8f5e1e"],
  ["#d47a3d", "#7e3827"],
  ["#bd5b43", "#6f2c31"],
  ["#83aec2", "#3e657b"],
  ["#e6d6af", "#8a7257"],
  ["#eca348", "#98522d"],
  ["#c8685d", "#773b42"],
  ["#9a82ad", "#554c76"],
  ["#cf533c", "#7b2e29"],
] as const;

function pieceRadius(level: number) {
  return CRUST_LEVELS[level]?.radius ?? 12;
}

function drawPiece(
  context: CanvasRenderingContext2D,
  piece: MooncakeMergePiece,
  sprite: HTMLImageElement | null,
) {
  const level = CRUST_LEVELS[piece.level];
  if (!level) return;
  const radius = pieceRadius(piece.level);
  const colors = PIECE_COLORS[piece.level] ?? PIECE_COLORS[0];
  context.save();
  context.translate(piece.x, piece.y);
  context.rotate(piece.angle);

  if (sprite?.complete && sprite.naturalWidth > 0) {
    const cellWidth = sprite.naturalWidth / 4;
    const cellHeight = sprite.naturalHeight / 3;
    const column = piece.level % 4;
    const row = Math.floor(piece.level / 4);
    const paintedSize = radius * 2.35;
    context.shadowColor = "rgba(65, 39, 22, 0.24)";
    context.shadowBlur = Math.max(2, radius * 0.12);
    context.shadowOffsetY = Math.max(1, radius * 0.07);
    context.drawImage(
      sprite,
      column * cellWidth,
      row * cellHeight,
      cellWidth,
      cellHeight,
      -paintedSize / 2,
      -paintedSize / 2,
      paintedSize,
      paintedSize,
    );
    context.restore();
    return;
  }

  const fill = context.createRadialGradient(-radius * 0.28, -radius * 0.35, 1, 0, 0, radius);
  fill.addColorStop(0, "#fff4d7");
  fill.addColorStop(0.22, colors[0]);
  fill.addColorStop(1, colors[1]);
  context.fillStyle = fill;
  context.beginPath();
  context.arc(0, 0, radius - 1.5, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(87, 50, 24, 0.52)";
  context.lineWidth = Math.max(1.2, radius * 0.055);
  context.beginPath();
  context.arc(0, 0, radius - 2.2, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = "rgba(255, 245, 205, 0.38)";
  context.lineWidth = Math.max(1, radius * 0.035);
  context.beginPath();
  context.arc(-radius * 0.1, -radius * 0.08, radius * 0.67, Math.PI * 1.04, Math.PI * 1.7);
  context.stroke();

  const fontSize = Math.max(10, Math.min(24, radius * 0.68));
  context.fillStyle = piece.level < 7 ? "#4e351f" : "#fff5d9";
  context.font = `700 ${fontSize}px "Noto Serif SC", "Songti SC", serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(level.shortLabel, 0, 1);
  context.restore();
}

function drawBoard(
  canvas: HTMLCanvasElement,
  snapshot: MooncakeMergeSnapshot,
  aimX: number,
  sprite: HTMLImageElement | null,
) {
  const density = Math.min(window.devicePixelRatio || 1, 2);
  const width = MOONCAKE_MERGE_BOARD.width;
  const height = MOONCAKE_MERGE_BOARD.height;
  if (canvas.width !== width * density || canvas.height !== height * density) {
    canvas.width = width * density;
    canvas.height = height * density;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(density, 0, 0, density, 0, 0);
  context.clearRect(0, 0, width, height);

  const frameLeft = (width - snapshot.stage.playWidth) / 2;
  const frameRight = width - frameLeft;
  context.fillStyle = "rgba(238, 217, 197, 0.26)";
  context.fillRect(0, 0, frameLeft, height);
  context.fillRect(frameRight, 0, frameLeft, height);
  context.strokeStyle = "rgba(173, 129, 104, 0.46)";
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(frameLeft, snapshot.dangerY);
  context.lineTo(frameLeft, height);
  context.moveTo(frameRight, snapshot.dangerY);
  context.lineTo(frameRight, height);
  context.stroke();

  context.save();
  context.setLineDash([7, 8]);
  context.strokeStyle =
    snapshot.dangerProgress > 0 ? "rgba(196, 67, 69, 0.9)" : "rgba(143, 68, 47, 0.52)";
  context.lineWidth = snapshot.dangerProgress > 0 ? 2.5 : 1.5;
  context.beginPath();
  context.moveTo(frameLeft + 7, snapshot.dangerY);
  context.lineTo(frameRight - 7, snapshot.dangerY);
  context.stroke();
  context.restore();

  if (snapshot.status === "playing") {
    context.save();
    context.strokeStyle = "rgba(111, 76, 40, 0.32)";
    context.lineWidth = 1.25;
    context.beginPath();
    context.moveTo(aimX, 6);
    context.lineTo(aimX, MOONCAKE_MERGE_BOARD.spawnY + 18);
    context.stroke();
    context.fillStyle = "rgba(111, 76, 40, 0.52)";
    context.beginPath();
    context.moveTo(aimX - 5, MOONCAKE_MERGE_BOARD.spawnY + 12);
    context.lineTo(aimX + 5, MOONCAKE_MERGE_BOARD.spawnY + 12);
    context.lineTo(aimX, MOONCAKE_MERGE_BOARD.spawnY + 18);
    context.closePath();
    context.fill();
    context.restore();
  }

  for (const piece of snapshot.pieces) drawPiece(context, piece, sprite);
}

function CrustToken({ level, compact = false }: { level: number; compact?: boolean }) {
  const item = CRUST_LEVELS[level] ?? CRUST_LEVELS[0];
  const colors = PIECE_COLORS[level] ?? PIECE_COLORS[0];
  return (
    <span
      className={`moon-merge-token${compact ? " is-compact" : ""}`}
      style={
        {
          "--token-light": colors[0],
          "--token-deep": colors[1],
          "--token-x": `${(level % 4) * (100 / 3)}%`,
          "--token-y": `${Math.floor(level / 4) * 50}%`,
        } as CSSProperties
      }
      aria-hidden="true"
      data-label={item.shortLabel}
    />
  );
}


export function MooncakeMergeGame({
  active = true,
  onBack,
  onComplete,
}: {
  active?: boolean;
  onBack?: () => void;
  onComplete?: () => Promise<void>;
}) {
  const modelRef = useRef(new MooncakeMergeModel());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spriteRef = useRef<HTMLImageElement | null>(null);
  const draggingRef = useRef(false);
  const aimRef = useRef(MOONCAKE_MERGE_BOARD.width / 2);
  const [aimX, setAimX] = useState(aimRef.current);
  const [scale, setScale] = useState(1);
  const [snapshot, setSnapshot] = useState(() => modelRef.current.snapshot());
  const [lastMergeLevel, setLastMergeLevel] = useState<number | null>(null);
  const [settlement, setSettlement] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const settling = useRef(false);
  const saveCompletion = useCallback(async () => {
    if (!onComplete || settling.current) return;
    settling.current = true;
    setSettlement("saving");
    try {
      await onComplete();
      setSettlement("saved");
    } catch {
      setSettlement("error");
    } finally {
      settling.current = false;
    }
  }, [onComplete]);

  useEffect(() => {
    if (snapshot.status === "complete" && settlement === "idle") void saveCompletion();
  }, [snapshot.status, settlement, saveCompletion]);

  const refresh = useCallback(() => {
    const next = modelRef.current.snapshot();
    setSnapshot(next);
    if (canvasRef.current) drawBoard(canvasRef.current, next, aimRef.current, spriteRef.current);
  }, []);

  useEffect(() => {
    const sprite = new Image();
    sprite.decoding = "async";
    sprite.src = "/mid-autumn/merge/crust-pieces-v3.png";
    sprite.addEventListener("load", () => {
      spriteRef.current = sprite;
      refresh();
    });
    return () => {
      spriteRef.current = null;
    };
  }, [refresh]);

  useEffect(() => {
    const resize = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      setScale(Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT, 1.12));
    };
    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    if (!active) return;
    let previous = performance.now();
    let lastReactRefresh = previous;
    const animate = (now: number) => {
      const elapsed = (now - previous) / 1000;
      previous = now;
      const events = modelRef.current.step(elapsed);
      const next = modelRef.current.snapshot();
      if (canvasRef.current) {
        drawBoard(canvasRef.current, next, aimRef.current, spriteRef.current);
      }
      if (events.length > 0 || now - lastReactRefresh > 100) {
        const merge = [...events].reverse().find((event) => event.type === "merge");
        if (merge?.type === "merge") setLastMergeLevel(merge.level);
        setSnapshot(next);
        lastReactRefresh = now;
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  const updateAim = useCallback((clientX: number, surface: HTMLElement) => {
    const bounds = surface.getBoundingClientRect();
    const stage = modelRef.current.stage;
    const radius = pieceRadius(modelRef.current.nextLevel);
    const margin = (MOONCAKE_MERGE_BOARD.width - stage.playWidth) / 2;
    const next = Math.max(
      margin + radius + 4,
      Math.min(
        MOONCAKE_MERGE_BOARD.width - margin - radius - 4,
        ((clientX - bounds.left) / bounds.width) * MOONCAKE_MERGE_BOARD.width,
      ),
    );
    aimRef.current = next;
    setAimX(next);
  }, []);

  const drop = useCallback(() => {
    if (modelRef.current.status !== "playing") return;
    modelRef.current.dropAt(aimRef.current);
    refresh();
  }, [refresh]);

  const restart = useCallback(() => {
    modelRef.current.restart();
    setLastMergeLevel(null);
    refresh();
  }, [refresh]);

  const advanceStage = useCallback(() => {
    if (!modelRef.current.advanceStage()) return;
    setLastMergeLevel(null);
    refresh();
  }, [refresh]);

  const restartChapter = useCallback(() => {
    modelRef.current.restartChapter();
    setLastMergeLevel(null);
    refresh();
  }, [refresh]);

  const statusText =
    snapshot.status === "complete"
      ? "1 张饼皮已经入柜"
      : snapshot.status === "stage_complete"
        ? `${snapshot.stage.title}完成`
        : snapshot.status === "failed"
          ? "食材堆过警戒线了"
          : snapshot.dangerProgress > 0
            ? "有食材越过警戒线，快让它落回去"
            : lastMergeLevel === null
              ? "拖动落点，松手投放"
              : `合成了${CRUST_LEVELS[lastMergeLevel]?.label ?? "新食材"}`;

  return (
    <main className="moon-merge-viewport">
      <div className="moon-merge-safe-area">
        <section
          className="moon-merge-stage"
          style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
          aria-label="中秋饼皮合成游戏"
        >
          <div className="moon-merge-moon" aria-hidden="true" />
          <header className="moon-merge-heading">
            <p>
              饼皮章节 · 第 {snapshot.stageIndex + 1}/{CRUST_STAGES.length} 关
            </p>
            <h1>{snapshot.stage.title}</h1>
            <button type="button" onClick={restart} aria-label="重新开始饼皮关">
              重开本关
            </button>
            {onBack && (
              <button type="button" className="moon-merge-open-workshop" onClick={onBack} aria-label="返回活动主页">
                ‹
              </button>
            )}
          </header>

          <section className="moon-merge-progress" aria-label="本关进度">
            <div className="moon-merge-next">
              <span>下一件</span>
              <CrustToken level={snapshot.nextLevel} />
              <strong>{CRUST_LEVELS[snapshot.nextLevel]?.label}</strong>
            </div>
            <div className="moon-merge-cupboard">
              <span>本关目标</span>
              <div>
                {CRUST_TARGET_SLOTS.slice(0, snapshot.stage.targetCount).map((slot, index) => (
                  <i className={index < snapshot.collected ? "is-filled" : ""} key={slot}>
                    <CrustToken level={snapshot.stage.targetLevel} compact />
                  </i>
                ))}
              </div>
              <strong>
                {snapshot.collected}/{snapshot.stage.targetCount}
              </strong>
            </div>
          </section>


          <section className="moon-merge-board-shell" aria-label="合成盘">
            <div
              className={`moon-merge-danger-label${snapshot.dangerProgress > 0 ? " is-active" : ""}`}
              style={{ top: `${snapshot.dangerY - 45}px` }}
              aria-hidden="true"
            >
              {snapshot.dangerProgress > 0 ? "危险" : "警戒线"}
            </div>
            <canvas ref={canvasRef} className="moon-merge-board" aria-label="当前合成盘内的食材" />
            <button
              type="button"
              className="moon-merge-board-input"
              aria-label="合成盘。左右拖动选择落点，松手投放下一件食材。也可以用左右方向键移动，按空格投放。"
              onPointerDown={(event) => {
                draggingRef.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                updateAim(event.clientX, event.currentTarget);
              }}
              onPointerMove={(event) => {
                if (draggingRef.current) updateAim(event.clientX, event.currentTarget);
              }}
              onPointerUp={(event) => {
                updateAim(event.clientX, event.currentTarget);
                draggingRef.current = false;
                event.currentTarget.releasePointerCapture(event.pointerId);
                drop();
              }}
              onPointerCancel={() => {
                draggingRef.current = false;
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  const direction = event.key === "ArrowLeft" ? -1 : 1;
                  const next = Math.max(
                    12,
                    Math.min(MOONCAKE_MERGE_BOARD.width - 12, aimRef.current + direction * 22),
                  );
                  aimRef.current = next;
                  setAimX(next);
                }
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  drop();
                }
              }}
            />
            <div
              className="moon-merge-drop-guide"
              style={{ left: `${(aimX / MOONCAKE_MERGE_BOARD.width) * 100}%` }}
              aria-hidden="true"
            >
              <CrustToken level={snapshot.nextLevel} compact />
            </div>
            {snapshot.status !== "playing" ? (
              <div className={`moon-merge-result is-${snapshot.status}`} role="status">
                <span aria-hidden="true">
                  {snapshot.status === "complete"
                    ? "☾"
                    : snapshot.status === "stage_complete"
                      ? "✓"
                      : "桂"}
                </span>
                <strong>
                  {snapshot.status === "complete"
                    ? "饼皮入柜"
                    : snapshot.status === "stage_complete"
                      ? `${snapshot.stage.title}完成`
                      : "这一盘放满了"}
                </strong>
                {snapshot.status !== "stage_complete" ? (
                  <p>
                    {snapshot.status === "complete"
                      ? onComplete
                        ? settlement === "saved" ? "食材已解锁，可以去作坊做月饼了。"
                          : settlement === "error" ? "材料解锁尚未确认，请重试。" : "正在保存材料解锁……"
                        : "五个小关已经完成，1 张饼皮准备好了。"
                      : "已经完成的小关不会丢失；只需重试当前这一盘。"}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={snapshot.status === "complete" && Boolean(onComplete) && (settlement === "idle" || settlement === "saving")}
                  onClick={
                    snapshot.status === "complete"
                      ? settlement === "error" ? () => void saveCompletion() : (onBack ?? restartChapter)
                      : snapshot.status === "stage_complete"
                        ? advanceStage
                        : restart
                  }
                >
                  {snapshot.status === "complete"
                    ? settlement === "error" ? "重试材料解锁" : onBack
                      ? "返回活动"
                      : "重玩饼皮章节"
                    : snapshot.status === "stage_complete"
                      ? "进入下一关"
                      : "重试本关"}
                </button>
              </div>
            ) : null}
          </section>

          <p className="moon-merge-status" aria-live="polite">
            {statusText}
          </p>

          <section className="moon-merge-chain" aria-label="饼皮制作合成链">
            <header>
              <span>当前工序</span>
              <strong>{CRUST_LEVELS[snapshot.highestLevel]?.label}</strong>
              <b>{Math.min(snapshot.highestLevel + 1, CRUST_LEVELS.length)}/12</b>
            </header>
            <ol>
              {CRUST_LEVELS.map((level, index) => (
                <li
                  key={level.id}
                  className={
                    index <= snapshot.highestLevel || snapshot.collected > 0 ? "is-reached" : ""
                  }
                  title={`${index + 1}. ${level.label}`}
                />
              ))}
            </ol>
            <p>相同食材相碰，继续下一道工序</p>
          </section>
        </section>
      </div>
    </main>
  );
}
