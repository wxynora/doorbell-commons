export const MOONCAKE_MERGE_BOARD = {
  width: 356,
  height: 522,
  dangerY: 110,
  spawnY: 34,
} as const;

export const CRUST_LEVELS = [
  { id: "wheat-seed", label: "麦种", shortLabel: "种", radius: 15 },
  { id: "wheat-sprout", label: "麦苗", shortLabel: "苗", radius: 19 },
  { id: "green-wheat", label: "青麦", shortLabel: "青", radius: 23 },
  { id: "ripe-ear", label: "成熟麦穗", shortLabel: "穗", radius: 28 },
  { id: "wheat-sheaf", label: "麦束", shortLabel: "束", radius: 34 },
  { id: "threshed-wheat", label: "脱粒小麦", shortLabel: "粒", radius: 40 },
  { id: "stone-milled-flour", label: "石磨面粉", shortLabel: "磨", radius: 48 },
  { id: "sifted-flour", label: "筛好面粉", shortLabel: "筛", radius: 56 },
  { id: "syrup-oil-dough", label: "糖浆油面", shortLabel: "拌", radius: 66 },
  { id: "first-kneaded-dough", label: "初揉面团", shortLabel: "揉", radius: 76 },
  { id: "rested-dough", label: "醒好面剂", shortLabel: "醒", radius: 87 },
  { id: "pressed-wrapper", label: "压制饼皮", shortLabel: "皮", radius: 100 },
] as const;

export type CrustLevel = (typeof CRUST_LEVELS)[number];
export type MooncakeMergeStatus = "playing" | "failed" | "stage_complete" | "complete";

export interface MooncakeMergeStage {
  id: string;
  title: string;
  targetLevel: number;
  targetCount: number;
  dropLevels: readonly number[];
  playWidth: number;
}

export const CRUST_STAGES: readonly MooncakeMergeStage[] = [
  {
    id: "harvest",
    title: "收麦",
    targetLevel: 3,
    targetCount: 1,
    dropLevels: [0, 1, 2],
    playWidth: 220,
  },
  {
    id: "thresh",
    title: "脱粒",
    targetLevel: 5,
    targetCount: 1,
    dropLevels: [0, 1, 2, 3, 4],
    playWidth: 252,
  },
  {
    id: "mill",
    title: "磨粉",
    targetLevel: 7,
    targetCount: 1,
    dropLevels: [0, 1, 2, 3, 4],
    playWidth: 286,
  },
  {
    id: "knead",
    title: "揉面",
    targetLevel: 9,
    targetCount: 1,
    dropLevels: [0, 1, 2, 3, 4],
    playWidth: 320,
  },
  {
    id: "press",
    title: "压皮",
    targetLevel: 11,
    targetCount: 2,
    dropLevels: [0, 1, 2, 3, 4],
    playWidth: 348,
  },
] as const;

export interface MooncakeMergePiece {
  id: number;
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  dangerFor: number;
  age: number;
}

export interface MooncakeMergeSnapshot {
  pieces: readonly MooncakeMergePiece[];
  nextLevel: number;
  collected: number;
  status: MooncakeMergeStatus;
  highestLevel: number;
  dangerProgress: number;
  stageIndex: number;
  stage: MooncakeMergeStage;
}

export type MooncakeMergeEvent =
  | { type: "merge"; level: number; x: number; y: number }
  | { type: "collect"; collected: number }
  | { type: "failed" }
  | { type: "stage_complete"; stageIndex: number }
  | { type: "complete" };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function radiusFor(level: number) {
  return CRUST_LEVELS[level]?.radius ?? CRUST_LEVELS.at(-1)?.radius ?? 80;
}

const DANGER_GRACE_SECONDS = 0.6;
const DANGER_HOLD_SECONDS = 1.2;

export class MooncakeMergeModel {
  readonly pieces: MooncakeMergePiece[] = [];
  nextLevel = 0;
  collected = 0;
  stageIndex: number;
  status: MooncakeMergeStatus = "playing";
  private nextPieceId = 1;
  private randomState: number;

  constructor(seed = Date.now(), stageIndex = 0) {
    this.randomState = seed >>> 0 || 0x6d2b79f5;
    this.stageIndex = clamp(Math.floor(stageIndex), 0, CRUST_STAGES.length - 1);
    this.nextLevel = this.randomDropLevel();
  }

  get stage() {
    return CRUST_STAGES[this.stageIndex] ?? CRUST_STAGES[0];
  }

  dropAt(rawX: number) {
    if (this.status !== "playing") return null;
    const level = this.nextLevel;
    const bounds = this.horizontalBounds(level);
    const piece: MooncakeMergePiece = {
      id: this.nextPieceId++,
      level,
      x: clamp(rawX, bounds.left, bounds.right),
      y: MOONCAKE_MERGE_BOARD.spawnY,
      vx: 0,
      vy: 18,
      angle: 0,
      angularVelocity: (this.random() - 0.5) * 1.4,
      dangerFor: 0,
      age: 0,
    };
    this.pieces.push(piece);
    this.nextLevel = this.randomDropLevel();
    return piece.id;
  }

  restart() {
    this.pieces.splice(0);
    this.collected = 0;
    this.status = "playing";
    this.nextLevel = this.randomDropLevel();
  }

  restartChapter() {
    this.stageIndex = 0;
    this.restart();
  }

  advanceStage() {
    if (this.status !== "stage_complete") return false;
    if (this.stageIndex >= CRUST_STAGES.length - 1) return false;
    this.stageIndex += 1;
    this.restart();
    return true;
  }

  snapshot(): MooncakeMergeSnapshot {
    return {
      pieces: this.pieces.map((piece) => ({ ...piece })),
      nextLevel: this.nextLevel,
      collected: this.collected,
      status: this.status,
      highestLevel: this.pieces.reduce(
        (highest, piece) => Math.max(highest, piece.level),
        this.collected > 0 ? this.stage.targetLevel : 0,
      ),
      dangerProgress: clamp(
        this.pieces.reduce((highest, piece) => Math.max(highest, piece.dangerFor), 0) /
          DANGER_HOLD_SECONDS,
        0,
        1,
      ),
      stageIndex: this.stageIndex,
      stage: this.stage,
    };
  }

  step(elapsedSeconds: number): MooncakeMergeEvent[] {
    if (this.status !== "playing") return [];
    const elapsed = clamp(elapsedSeconds, 0, 1 / 20);
    if (elapsed === 0) return [];
    const events: MooncakeMergeEvent[] = [];
    const substeps = 3;
    const dt = elapsed / substeps;

    for (let substep = 0; substep < substeps && this.status === "playing"; substep += 1) {
      this.integrate(dt);
      this.resolveCollisions(events);
      this.checkDanger(dt, events);
    }

    return events;
  }

  private integrate(dt: number) {
    const gravity = 980;
    const velocityDamping = 0.997 ** (dt * 60);

    for (const piece of this.pieces) {
      const radius = radiusFor(piece.level);
      const bounds = this.horizontalBounds(piece.level);
      piece.age = (piece.age ?? 0) + dt;
      piece.vy += gravity * dt;
      piece.vx *= velocityDamping;
      piece.angularVelocity *= velocityDamping;
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.angle += piece.angularVelocity * dt;

      if (piece.x < bounds.left) {
        piece.x = bounds.left;
        piece.vx = Math.abs(piece.vx) * 0.18;
      } else if (piece.x > bounds.right) {
        piece.x = bounds.right;
        piece.vx = -Math.abs(piece.vx) * 0.18;
      }

      if (piece.y + radius > MOONCAKE_MERGE_BOARD.height - 5) {
        piece.y = MOONCAKE_MERGE_BOARD.height - radius - 5;
        piece.vy = -Math.abs(piece.vy) * 0.08;
        if (Math.abs(piece.vy) < 10) piece.vy = 0;
        piece.vx *= 0.91;
        piece.angularVelocity = piece.vx / Math.max(radius, 1);
      }
    }
  }

  private resolveCollisions(events: MooncakeMergeEvent[]) {
    let merged = true;
    let passes = 0;

    while (merged && passes < 24 && this.status === "playing") {
      merged = false;
      passes += 1;

      collisionLoop: for (let leftIndex = 0; leftIndex < this.pieces.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < this.pieces.length; rightIndex += 1) {
          const left = this.pieces[leftIndex];
          const right = this.pieces[rightIndex];
          if (!left || !right) continue;
          const dx = right.x - left.x;
          const dy = right.y - left.y;
          const minimumDistance = radiusFor(left.level) + radiusFor(right.level);
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared >= minimumDistance * minimumDistance) continue;

          if (left.level === right.level) {
            this.mergePair(leftIndex, rightIndex, events);
            merged = true;
            break collisionLoop;
          }

          const distance = Math.sqrt(distanceSquared) || 0.001;
          const normalX = dx / distance;
          const normalY = dy / distance;
          const overlap = minimumDistance - distance;
          const leftMass = radiusFor(left.level) ** 2;
          const rightMass = radiusFor(right.level) ** 2;
          const totalMass = leftMass + rightMass;
          left.x -= normalX * overlap * (rightMass / totalMass);
          left.y -= normalY * overlap * (rightMass / totalMass);
          right.x += normalX * overlap * (leftMass / totalMass);
          right.y += normalY * overlap * (leftMass / totalMass);

          const relativeVelocity = (right.vx - left.vx) * normalX + (right.vy - left.vy) * normalY;
          if (relativeVelocity < 0) {
            const impulse = (-(1 + 0.12) * relativeVelocity) / (1 / leftMass + 1 / rightMass);
            left.vx -= (impulse * normalX) / leftMass;
            left.vy -= (impulse * normalY) / leftMass;
            right.vx += (impulse * normalX) / rightMass;
            right.vy += (impulse * normalY) / rightMass;
          }
        }
      }
    }
  }

  private mergePair(leftIndex: number, rightIndex: number, events: MooncakeMergeEvent[]) {
    const left = this.pieces[leftIndex];
    const right = this.pieces[rightIndex];
    if (!left || !right) return;
    const nextLevel = left.level + 1;
    const x = (left.x + right.x) / 2;
    const y = (left.y + right.y) / 2;
    const vx = (left.vx + right.vx) / 2;
    const vy = Math.min((left.vy + right.vy) / 2, -24);

    this.pieces.splice(rightIndex, 1);
    this.pieces.splice(leftIndex, 1);

    if (nextLevel >= this.stage.targetLevel) {
      this.collected += 1;
      events.push({ type: "collect", collected: this.collected });
      if (this.collected >= this.stage.targetCount) {
        if (this.stageIndex >= CRUST_STAGES.length - 1) {
          this.status = "complete";
          events.push({ type: "complete" });
        } else {
          this.status = "stage_complete";
          events.push({ type: "stage_complete", stageIndex: this.stageIndex });
        }
      }
      return;
    }

    this.pieces.push({
      id: this.nextPieceId++,
      level: nextLevel,
      x: clamp(x, this.horizontalBounds(nextLevel).left, this.horizontalBounds(nextLevel).right),
      y,
      vx,
      vy,
      angle: (left.angle + right.angle) / 2,
      angularVelocity: (left.angularVelocity + right.angularVelocity) / 2,
      dangerFor: 0,
      age: Math.max(left.age, right.age),
    });
    events.push({ type: "merge", level: nextLevel, x, y });
  }

  private checkDanger(dt: number, events: MooncakeMergeEvent[]) {
    let crossedFor = 0;
    for (const piece of this.pieces) {
      const warningCrossed = piece.y - radiusFor(piece.level) < MOONCAKE_MERGE_BOARD.dangerY;
      if (piece.age >= DANGER_GRACE_SECONDS && warningCrossed) {
        piece.dangerFor += dt;
      } else {
        piece.dangerFor = Math.max(0, piece.dangerFor - dt * 2);
      }
      crossedFor = Math.max(crossedFor, piece.dangerFor);
    }

    if (crossedFor >= DANGER_HOLD_SECONDS) {
      this.status = "failed";
      events.push({ type: "failed" });
    }
  }

  private random() {
    let value = this.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0;
    return this.randomState / 0x1_0000_0000;
  }

  private horizontalBounds(level: number) {
    const radius = radiusFor(level);
    const margin = (MOONCAKE_MERGE_BOARD.width - this.stage.playWidth) / 2;
    return {
      left: margin + radius + 4,
      right: MOONCAKE_MERGE_BOARD.width - margin - radius - 4,
    };
  }

  private randomDropLevel() {
    const levels = this.stage.dropLevels;
    return levels[Math.floor(this.random() * levels.length)] ?? levels[0] ?? 0;
  }
}

