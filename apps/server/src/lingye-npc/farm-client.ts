import {
  farmHumanNpcReadRequestSchema, farmHumanNpcReadSuccessSchema,
  farmHumanNpcInteractRequestSchema, farmHumanNpcInteractSuccessSchema, farmHumanNpcErrorSchema,
  type FarmHumanNpcReadSuccess, type FarmHumanNpcInteractSuccess, type LingyeNpcInteractRequest,
} from "@doorbell/protocol";

export interface FarmNpcIdentity {
  residentId: string;
  farmHumanKey: string;
  farmDoorplate: string;
}

export interface FarmNpcReader {
  readNpcs(input: FarmNpcIdentity): Promise<FarmHumanNpcReadSuccess>;
  interactNpc(input: FarmNpcIdentity & LingyeNpcInteractRequest): Promise<FarmHumanNpcInteractSuccess>;
}

export class FarmNpcClientError extends Error {
  constructor(readonly code: "farm_unavailable" | "upstream_contract_unavailable" | "registration_profile_required" | "npc_action_rejected") {
    super(code);
    this.name = "FarmNpcClientError";
  }
}

export class FarmNpcClient implements FarmNpcReader {
  readonly #options;
  readonly #fetch: typeof fetch;
  readonly #base: URL;
  constructor(options: { apiBaseUrl: string; requestTimeoutMs: number; serviceToken: string; fetchImplementation?: typeof fetch }) {
    this.#options = options;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#base = new URL(options.apiBaseUrl.endsWith("/") ? options.apiBaseUrl : `${options.apiBaseUrl}/`);
  }

  readNpcs(input: FarmNpcIdentity) {
    return this.#request("read", input, farmHumanNpcReadRequestSchema.parse(this.#identity(input)), farmHumanNpcReadSuccessSchema);
  }

  interactNpc(input: FarmNpcIdentity & LingyeNpcInteractRequest) {
    const body = farmHumanNpcInteractRequestSchema.parse({ ...this.#identity(input), npc_id: input.npc_id, option: input.option });
    return this.#request("interact", input, body, farmHumanNpcInteractSuccessSchema).then(result => {
      if (result.npc.npc_id !== input.npc_id) throw new FarmNpcClientError("upstream_contract_unavailable");
      return result;
    });
  }

  #identity(input: FarmNpcIdentity) {
    return { resident_id: input.residentId, farm_human_key: input.farmHumanKey, expected_farm_doorplate: input.farmDoorplate };
  }

  async #request<T extends { subject: { farm_doorplate: string } }>(
    action: "read" | "interact", input: FarmNpcIdentity, body: unknown,
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.#fetch(new URL(`internal/doorbell/human/npcs/${action}`, this.#base), {
        method: "POST", headers: { authorization: `Bearer ${this.#options.serviceToken}`, "content-type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(this.#options.requestTimeoutMs),
      });
    } catch { throw new FarmNpcClientError("farm_unavailable"); }
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new FarmNpcClientError("upstream_contract_unavailable"); }
    if (!response.ok) {
      const error = farmHumanNpcErrorSchema.safeParse(payload);
      if (!error.success) throw new FarmNpcClientError("upstream_contract_unavailable");
      if (["farm_credential_not_found", "farm_doorplate_mismatch", "farm_migration_required"].includes(error.data.error.code)) {
        throw new FarmNpcClientError("registration_profile_required");
      }
      if (response.status >= 500) throw new FarmNpcClientError("farm_unavailable");
      throw new FarmNpcClientError("npc_action_rejected");
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success || parsed.data.subject.farm_doorplate !== input.farmDoorplate) {
      throw new FarmNpcClientError("upstream_contract_unavailable");
    }
    return parsed.data;
  }
}
