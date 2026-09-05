import { lingyeNpcInteractRequestSchema } from "@doorbell/protocol";
import { createNpcClient } from "./client";

type ReadAction = { type: "doorbell-npc:read"; request_id: number };
type InteractAction = { type: "doorbell-npc:interact"; request_id: number; npc_id: string; option: string };

export function parseNpcBridgeAction(value: unknown): ReadAction | InteractAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const action = value as Record<string, unknown>;
  if (!Number.isSafeInteger(action.request_id) || (action.request_id as number) < 0) return null;
  if (action.type === "doorbell-npc:read" && Object.keys(action).sort().join(",") === "request_id,type") {
    return action as ReadAction;
  }
  if (action.type !== "doorbell-npc:interact" || Object.keys(action).sort().join(",") !== "npc_id,option,request_id,type") return null;
  const input = lingyeNpcInteractRequestSchema.safeParse({ npc_id: action.npc_id, option: action.option });
  return input.success ? { ...input.data, type: action.type, request_id: action.request_id as number } : null;
}

/** In-flight results belong to the profile that started them, never the next profile. */
export function createNpcBridge(client = createNpcClient()) {
  let profileKey: string | null = null;
  let revision = 0;
  return {
    setProfile(next: string | null) {
      if (next === profileKey) return false;
      profileKey = next;
      revision += 1;
      return true;
    },
    async handle(value: unknown, reply: (result: unknown) => void) {
      const action = parseNpcBridgeAction(value);
      if (!action) return false;
      if (!profileKey) return true;
      const started = revision;
      const result = action.type === "doorbell-npc:read"
        ? await client.read()
        : await client.interact(lingyeNpcInteractRequestSchema.parse({ npc_id: action.npc_id, option: action.option }));
      if (started === revision) reply({ type: "doorbell-npc:result", request_id: action.request_id, result });
      return true;
    },
  };
}
