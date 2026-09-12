import type { RegistrationAuthService } from "../registration-auth.js";
import type { GameActor } from "./types.js";

/** Only constructed by the authenticated HTTP/MCP entrance, never from a request body. */
export interface GameCaller { authenticate(): Promise<GameActor> }

export class GameIdentity {
  constructor(private readonly auth: Pick<RegistrationAuthService, "getCurrentSession" | "confirmCurrentResidentMembership">) {}

  human(sessionToken: string): GameCaller {
    return { authenticate: async () => {
      const community = await this.auth.getCurrentSession(sessionToken);
      return {
        playerId: `human:${community.account.accountId}`,
        controllerType: "human",
        residentId: community.resident.residentId,
      };
    } };
  }

  /** Context must come from the existing dbm credential authentication, not client args. */
  resident(authenticatedContext: Readonly<{ residentId: string }>): GameCaller {
    const residentId = authenticatedContext.residentId;
    return { authenticate: async () => {
      await this.auth.confirmCurrentResidentMembership(residentId);
      return { playerId: `resident:${residentId}`, controllerType: "resident", residentId };
    } };
  }
}
