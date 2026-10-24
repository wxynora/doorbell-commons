// Service-only activity payouts use the existing Farm ledger, never a second wallet.
import { validTogetherTitles } from "../../domain/together/title-reward.js";
export function createTogetherRewardService({ database, backend, decorationRewards }) {
  const credit = backend?.trustedSystemCommands?.creditFromSystem;
  if (!database || typeof credit !== "function") throw new Error("together_reward_unavailable");
  let sequence = 0;
  return {
    grant(input) {
      if (!input || typeof input !== "object" || Array.isArray(input) ||
          Object.keys(input).sort().join(",") !== ["gold", "grant_id", "resident_id", "silver", ...(Object.hasOwn(input, "decoration") ? ["decoration"] : []), ...(Object.hasOwn(input, "titles") ? ["titles"] : [])].sort().join(",") ||
          typeof input.grant_id !== "string" || !input.grant_id ||
          typeof input.resident_id !== "string" || !input.resident_id ||
          !Number.isSafeInteger(input.gold) || input.gold < 0 ||
          !Number.isSafeInteger(input.silver) || input.silver < 0 ||
          (input.gold + input.silver === 0 && !validTogetherTitles(input)))
        throw new Error("invalid_together_reward");
      if (Object.hasOwn(input, "titles") && !validTogetherTitles(input))
        throw new Error("invalid_together_reward");
      if (input.titles && (typeof decorationRewards?.grantTitles !== "function" ||
          typeof decorationRewards?.assertTitleGrant !== "function"))
        throw new Error("together_title_unavailable");
      decorationRewards?.assertTitleGrant?.(input);
      if (input.decoration !== undefined && (!input.decoration || typeof input.decoration !== "object" ||
          Array.isArray(input.decoration) || Object.keys(input.decoration).sort().join(",") !== "item_id,quantity" ||
          !["farm_decor:snow_fort", "farm_decor:small_snow_fort"].includes(input.decoration.item_id) || input.decoration.quantity !== 1))
        throw new Error("invalid_together_reward");
      if (input.decoration && typeof decorationRewards?.grant !== "function")
        throw new Error("together_decoration_unavailable");
      // Farm inventory must publish at its own durable world checkpoint, never
      // inside an older SQL transaction (the existing persistence contract).
      if ((input.decoration || input.titles) && (database.isTransaction || database.inTransaction))
        throw new Error("together_decoration_nested_forbidden");
      const nested = database.isTransaction === true || database.inTransaction === true;
      const savepoint = `together_reward_${++sequence}`;
      database.exec(nested ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
      let journals;
      try {
        const reference = JSON.stringify(["together", input.grant_id, input.resident_id, input.gold, input.silver,
          ...(input.decoration ? [[input.decoration.item_id, input.decoration.quantity]] : [])]);
        // Both currencies bind the entire grant, including zero amounts. Replaying
        // a one-currency grant cannot silently add the previously absent currency.
        for (const currency of ["gold", "silver"]) {
          const previous = database.prepare(`SELECT j.business_ref FROM economy_commands c
            JOIN economy_journals j ON j.journal_id=c.journal_id WHERE c.idempotency_key=?`)
            .get(`together-reward:${input.grant_id}:${currency}`);
          if (previous && previous.business_ref !== reference) {
            const error = new Error("together_reward_conflict"); error.code = "IDEMPOTENCY_CONFLICT"; throw error;
          }
        }
        journals = [];
        for (const currency of ["gold", "silver"]) {
          if (input[currency] === 0) continue;
          const key = `together-reward:${input.grant_id}:${currency}`;
          credit({ residentId: input.resident_id, currency, amount: input[currency],
            businessType: "together_reward", businessRef: reference, idempotencyKey: key });
          const record = database.prepare("SELECT journal_id FROM economy_commands WHERE idempotency_key=?").get(key);
          if (!record || typeof record.journal_id !== "string") throw new Error("together_reward_receipt_invalid");
          journals.push(record.journal_id);
        }
        database.exec(nested ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
      } catch (error) {
        if (nested) { database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`); database.exec(`RELEASE SAVEPOINT ${savepoint}`); }
        else if (database.isTransaction || database.inTransaction) database.exec("ROLLBACK");
        throw error;
      }
      // A failed inventory checkpoint leaves the whole HTTP reward unconfirmed.
      // Retry the same grant: currency journals replay, then inventory resumes.
      const decoration = input.decoration ? decorationRewards.grant(input) : undefined;
      const titles = input.titles ? decorationRewards.grantTitles(input) : undefined;
      return { ok: true, grant_id: input.grant_id, resident_id: input.resident_id,
        gold: input.gold, silver: input.silver, journal_ids: journals,
        ...(decoration ? { decoration } : {}), ...(titles ? { titles } : {}) };
    },
  };
}

export async function handleTogetherReward(req, res, method, runtime, io) {
  if (!io.authorize(req, res, method)) return;
  try {
    const input = await io.readBody(req);
    if (typeof runtime?.syncTogetherBalances !== "function") throw new Error("together_balance_projection_unavailable");
    const receipt = createTogetherRewardService(runtime).grant(input);
    runtime.syncTogetherBalances();
    return io.jsonOut(res, 200, receipt);
  } catch (error) {
    const code = error?.code ?? error?.message;
    if (code === "invalid_together_reward" || code === "invalid_json")
      return io.error(res, 400, "invalid_request", "The activity reward request is invalid");
    if (code === "IDEMPOTENCY_CONFLICT")
      return io.error(res, 409, "reward_conflict", "The activity reward ID was used with different data");
    return io.error(res, 503, "service_unavailable", "The activity reward could not be confirmed");
  }
}

export function createTogetherRegistrationService({ database, backend }) {
  const charge = backend?.trustedSystemCommands?.chargeToSystem;
  if (!database || typeof charge !== "function") throw new Error("together_registration_unavailable");
  return {
    charge(input) {
      if (!input || typeof input !== "object" || Array.isArray(input) ||
          Object.keys(input).sort().join(",") !== "gold,payment_id,resident_id" ||
          typeof input.payment_id !== "string" || !input.payment_id ||
          typeof input.resident_id !== "string" || !input.resident_id || input.gold !== 10000)
        throw new Error("invalid_together_registration");
      const key = `together-registration:${input.payment_id}`;
      charge({ residentId: input.resident_id, currency: "gold", amount: input.gold,
        actor: "agent", businessType: "together_registration", businessRef: input.payment_id,
        idempotencyKey: key });
      const record = database.prepare("SELECT journal_id FROM economy_commands WHERE idempotency_key=?").get(key);
      if (!record || typeof record.journal_id !== "string") throw new Error("registration_receipt_invalid");
      return { ok: true, payment_id: input.payment_id, resident_id: input.resident_id,
        gold: input.gold, journal_id: record.journal_id };
    },
  };
}

export async function handleTogetherRegistration(req, res, method, runtime, io) {
  if (!io.authorize(req, res, method)) return;
  try {
    const input = await io.readBody(req);
    if (typeof runtime?.syncTogetherBalances !== "function") throw new Error("together_balance_projection_unavailable");
    const receipt = createTogetherRegistrationService(runtime).charge(input);
    runtime.syncTogetherBalances();
    return io.jsonOut(res, 200, receipt);
  } catch (error) {
    const code = error?.code ?? error?.message;
    if (code === "invalid_together_registration" || code === "invalid_json")
      return io.error(res, 400, "invalid_request", "The activity registration request is invalid");
    if (code === "BALANCE_INSUFFICIENT")
      return io.jsonOut(res, 409, { error: { code: "registration_balance_insufficient" } });
    if (code === "IDEMPOTENCY_CONFLICT")
      return io.jsonOut(res, 409, { error: { code: "registration_payment_conflict" } });
    return io.jsonOut(res, 503, { error: { code: "registration_payment_unconfirmed" } });
  }
}
