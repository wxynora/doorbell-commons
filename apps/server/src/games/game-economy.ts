/**
 * Internal Main/Farm boundary for game silver.  The caller supplies only
 * server-derived resident ids and the Farm side remains authoritative for
 * balances and the actual debit/credit policy.
 */
export interface GameEconomyPort {
  balances(
    residentIds: readonly string[],
  ): Promise<readonly { residentId: string; balance: number }[]>;
  settle(input: {
    settlementId: string;
    deltas: readonly { residentId: string; delta: number }[];
  }): Promise<{
    settlementId: string;
    accounts: readonly {
      residentId: string;
      expectedDelta: number;
      actualDelta: number;
      balance: number;
    }[];
  }>;
}

export class GameEconomyError extends Error {
  constructor(
    readonly code: string,
    message = code,
    readonly residentIds: readonly string[] = [],
  ) {
    super(message);
    this.name = "GameEconomyError";
  }
}
