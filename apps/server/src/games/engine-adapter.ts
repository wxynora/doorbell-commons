import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import type { GameActor, GameEngineAdapter, GameKind, GameAppliedUpdate } from "./types.js";
import { GameStateError } from "./types.js";

export interface PythonGameEngineAdapterOptions {
  /** Exact executable to invoke; no shell lookup or implicit fallback. */
  pythonExecutable: string;
  /** Repository root containing the six standalone games. */
  repositoryRoot: string;
  /** Local isolated validation may point to the candidate bridge. */
  bridgePath?: string;
  /** Internal test seam; production uses a fresh unsigned 32-bit seed. */
  generateSeed?: () => number;
}

type BridgeRequest =
  | {
      operation: "create";
      kind: GameKind;
      roomId: string;
      actors: readonly GameActor[];
      seed?: number;
    }
  | {
      operation: "apply" | "apply_update";
      kind: GameKind;
      snapshot: unknown;
      actorId: string;
      command: Record<string, unknown>;
      nowMs?: number;
    }
  | {
      operation: "project";
      kind: GameKind;
      snapshot: unknown;
      viewerId: string;
      nowMs?: number;
    };

interface BridgeSuccess {
  ok: true;
  result: unknown;
}

interface BridgeFailure {
  ok: false;
  error?: { type?: unknown; message?: unknown };
}

type BridgeResponse = BridgeSuccess | BridgeFailure;

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function phaseOf(kind: GameKind, snapshot: unknown): unknown {
  const raw = recordOf(snapshot);
  if (!raw) return undefined;
  if (kind === "mahjong") return recordOf(raw.state)?.phase;
  return raw.phase;
}

function freshSeed(): number {
  return randomBytes(4).readUInt32BE(0);
}

/**
 * Thin internal adapter over the six standalone Python rule engines.
 *
 * A fresh bridge process receives the complete authoritative snapshot for
 * every operation.  This class intentionally has no room storage, CAS, retry,
 * timeout, truncation, or resident-action policy.
 */
export class PythonGameEngineAdapter implements GameEngineAdapter {
  private readonly pythonExecutable: string;
  private readonly repositoryRoot: string;
  private readonly bridgePath: string;
  private readonly generateSeed: () => number;

  constructor(options: PythonGameEngineAdapterOptions) {
    if (!options.pythonExecutable) {
      throw new TypeError("pythonExecutable is required");
    }
    if (!options.repositoryRoot) {
      throw new TypeError("repositoryRoot is required");
    }
    this.pythonExecutable = options.pythonExecutable;
    this.repositoryRoot = resolve(options.repositoryRoot);
    this.generateSeed = options.generateSeed ?? freshSeed;
    this.bridgePath = options.bridgePath ?? resolve(
      this.repositoryRoot,
      "apps/server/src/games/engine-bridge.py",
    );
  }

  async create(kind: GameKind, roomId: string, actors: readonly GameActor[]): Promise<unknown> {
    const seed = kind === "mahjong" ? undefined : this.generateValidatedSeed();
    return this.run({
      operation: "create",
      kind,
      roomId,
      actors,
      ...(seed === undefined ? {} : { seed }),
    });
  }

  async apply(
    kind: GameKind,
    snapshot: unknown,
    actorId: string,
    command: Record<string, unknown>,
  ): Promise<unknown> {
    return this.run({
      operation: "apply",
      kind,
      snapshot,
      actorId,
      command,
      ...(kind === "leaf-game" ? { nowMs: Date.now() } : {}),
    });
  }

  async project(kind: GameKind, snapshot: unknown, viewerId: string): Promise<unknown> {
    return this.run({
      operation: "project",
      kind,
      snapshot,
      viewerId,
      ...(kind === "leaf-game" ? { nowMs: Date.now() } : {}),
    });
  }

  async applyUpdate(kind: GameKind, snapshot: unknown, actorId: string, command: Record<string, unknown>): Promise<GameAppliedUpdate> {
    return await this.run({ operation: "apply_update", kind, snapshot, actorId, command,
      ...(kind === "leaf-game" ? { nowMs: Date.now() } : {}) }) as GameAppliedUpdate;
  }

  isFinished(kind: GameKind, snapshot: unknown): boolean {
    const phase = phaseOf(kind, snapshot);
    switch (kind) {
      case "leaf-game":
        return phase === "finished";
      case "doudizhu":
        return phase === "game_over";
      case "flying-chess":
        return phase === "round_over";
      case "uno":
        // round_over still accepts next_round; the engine has no terminal
        // game_over phase for the match.
        return phase === "finished" || phase === "game_over";
      case "monopoly":
        return phase === "game_over";
      case "mahjong":
        return phase === "finished";
    }
  }

  /**
   * Resolve only the already-defined Leaf Game final challenge timeout.
   *
   * This is deliberately opt-in and state-in/state-out: callers must CAS the
   * returned snapshot before publishing it.  It never runs from project().
   * Other games have no system timeout in their current engines.
   */
  async settleDue(kind: GameKind, snapshot: unknown): Promise<unknown | null> {
    if (kind !== "leaf-game") return null;
    const state = recordOf(snapshot);
    if (!state || state.phase !== "final_challenge") return null;
    const deadline = state.final_challenge_deadline_ms;
    if (typeof deadline !== "number" || deadline > Date.now()) return null;
    const revision = state.revision;
    if (typeof revision !== "number") {
      throw new GameStateError("Leaf Game snapshot has no numeric revision");
    }
    const gameId = typeof state.game_id === "string" ? state.game_id : "unknown";
    return this.run({
      operation: "apply",
      kind,
      snapshot,
      actorId: "system",
      nowMs: Date.now(),
      command: {
        command_id: `adapter-final-timeout:${gameId}:${deadline}`,
        expected_revision: revision,
        actor_id: "system",
        action: "resolve_final_timeout",
      },
    });
  }

  private generateValidatedSeed(): number {
    const seed = this.generateSeed();
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
      throw new GameStateError("Game seed must be an unsigned 32-bit integer");
    }
    return seed;
  }

  private run(request: BridgeRequest): Promise<unknown> {
    let encodedRequest: string;
    try {
      encodedRequest = JSON.stringify(request);
    } catch (error) {
      return Promise.reject(new GameStateError(`Game bridge request is not JSON-serializable: ${String(error)}`));
    }
    if (encodedRequest === undefined) {
      return Promise.reject(new GameStateError("Game bridge request is not JSON-serializable"));
    }
    const child = spawn(
      this.pythonExecutable,
      [this.bridgePath, this.repositoryRoot],
      {
        cwd: this.repositoryRoot,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    return new Promise((resolveResult, rejectResult) => {
      let stdout = "";
      let stderr = "";
      let settled = false;

      const rejectOnce = (error: Error): void => {
        if (settled) return;
        settled = true;
        rejectResult(error);
      };

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.stdin.on("error", (error) => {
        rejectOnce(new GameStateError(`Python game bridge stdin failed: ${error.message}`));
      });
      child.on("error", (error) => {
        rejectOnce(new GameStateError(`Python game bridge failed to start: ${error.message}`));
      });
      child.on("close", (code, signal) => {
        if (settled) return;
        if (code !== 0) {
          rejectOnce(
            new GameStateError(
              `Python game bridge exited with ${signal ? `signal ${signal}` : `code ${code}`}${stderr ? `: ${stderr.trim()}` : ""}`,
            ),
          );
          return;
        }
        const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
        if (lines.length !== 1) {
          rejectOnce(new GameStateError(`Python game bridge must return exactly one JSON object; received ${lines.length}`));
          return;
        }
        const line = lines[0];
        if (line === undefined) {
          rejectOnce(new GameStateError("Python game bridge returned no JSON object"));
          return;
        }
        let response: BridgeResponse;
        try {
          response = JSON.parse(line) as BridgeResponse;
        } catch (error) {
          rejectOnce(new GameStateError(`Python game bridge returned invalid JSON: ${String(error)}`));
          return;
        }
        if (!response || typeof response !== "object" || response.ok !== true) {
          const failure = response as BridgeFailure;
          const message = failure?.error?.message;
          rejectOnce(new GameStateError(typeof message === "string" ? message : "Python game bridge rejected the request"));
          return;
        }
        settled = true;
        resolveResult(response.result);
      });
      child.stdin.end(`${encodedRequest}\n`);
    });
  }
}

export function createPythonGameEngineAdapter(
  options: PythonGameEngineAdapterOptions,
): GameEngineAdapter {
  return new PythonGameEngineAdapter(options);
}
