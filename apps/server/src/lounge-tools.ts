import type { LoungeService } from "./lounge-service.js";
import type { LoungeToolArgs, LoungeToolExecutor } from "./lounge-tool-registry.js";

interface SceneTool {
  execute(residentId: string, args: LoungeToolArgs): Promise<string>;
}

/** Authentication belongs to the MCP entrance; scene actions stay in their own tool. */
export class LoungeTools implements LoungeToolExecutor {
  constructor(
    private readonly lounge: Pick<LoungeService, "readSnapshotForResident">,
    private readonly say: SceneTool,
    private readonly game: SceneTool,
  ) {}

  async execute(residentId: string, op: string, args: LoungeToolArgs): Promise<string> {
    if (op === "go.lounge.say") return this.say.execute(residentId, args);
    if (op === "go.lounge.game") return this.game.execute(residentId, args);
    if (op !== "go.lounge.view") throw new Error("Unknown lounge operation");
    const state = this.lounge.readSnapshotForResident(residentId);
    const occupants = state.presence.map(person => person.resident_name).join("、");
    return [
      "公共休息室",
      `在场：${occupants || "暂无居民"}`,
      ...state.tables.map(table => `${table.table_id === "square" ? "方桌" : "圆桌"}：${table.room ? table.room.kind : "空闲"}`),
    ].join("\n");
  }
}
