// Service-only operations on the existing Farm economy connection. No wallet,
// inventory, titles, furniture or additional ledger is created here.
function valid(input, refund = false) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).sort().join(",") !== (refund ? "gold,payment_id,refund_id,resident_id" : "gold,payment_id,resident_id") ||
      typeof input.payment_id !== "string" || !input.payment_id ||
      typeof input.resident_id !== "string" || !input.resident_id || input.gold !== 10000 ||
      (refund && input.refund_id !== `${input.payment_id}:refund`))
    throw new Error("invalid_together_registration");
}
function conflict() { throw new Error("registration_payment_conflict"); }

export function createTournamentRegistrationService({ database, backend }) {
  return {
    read(input) {
      valid(input);
      const row = database.prepare(`SELECT c.journal_id, c.command_type, j.business_ref,
          f.resident_id, f.kind, f.currency, f.amount, f.business_reference
        FROM economy_commands c JOIN economy_journals j ON j.journal_id=c.journal_id
        LEFT JOIN economy_financial_receipts f ON f.receipt_id=c.journal_id
        WHERE c.idempotency_key=?`).get(`together-registration:${input.payment_id}`);
      if (!row) return { ok: true, ...input, status: "not_found", journal_id: null };
      if (row.command_type !== "system.charge.together_registration" || row.business_ref !== input.payment_id ||
          row.resident_id !== input.resident_id || row.kind !== "system_gold_charge" || row.currency !== "gold" ||
          row.amount !== input.gold || row.business_reference !== input.payment_id) conflict();
      return { ok: true, ...input, status: "paid", journal_id: row.journal_id };
    },
    refund(input) {
      valid(input, true);
      // The caller cannot choose another refund key and collect twice.
      if (database.isTransaction || database.inTransaction) throw new Error("registration_refund_nested");
      database.exec("BEGIN IMMEDIATE");
      try {
        const paid = this.read({ payment_id: input.payment_id, resident_id: input.resident_id, gold: input.gold });
        if (paid.status !== "paid") throw new Error("registration_payment_unconfirmed");
        const key = `together-registration-refund:${input.payment_id}`;
        backend.trustedSystemCommands.creditFromSystem({ residentId: input.resident_id, currency: "gold", amount: input.gold,
          businessType: "together_registration_refund", businessRef: JSON.stringify([input.payment_id, paid.journal_id]),
          idempotencyKey: key });
        const record = database.prepare("SELECT journal_id FROM economy_commands WHERE idempotency_key=?").get(key);
        if (!record?.journal_id) throw new Error("registration_receipt_invalid");
        database.exec("COMMIT");
        return { ok: true, ...input, journal_id: record.journal_id };
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

export async function handleTournamentRegistration(req, res, method, runtime, io, operation) {
  if (!io.authorize(req, res, method)) return;
  try {
    const input = await io.readBody(req);
    if (operation !== "read" && operation !== "refund") throw new Error("invalid_together_registration");
    if (operation === "refund" && typeof runtime?.syncTogetherBalances !== "function")
      throw new Error("together_balance_projection_unavailable");
    const receipt = createTournamentRegistrationService(runtime)[operation](input);
    if (operation === "refund") runtime.syncTogetherBalances();
    return io.jsonOut(res, 200, receipt);
  } catch (error) {
    const code = error?.code ?? error?.message;
    if (code === "invalid_together_registration" || code === "invalid_json")
      return io.error(res, 400, "invalid_request", "The activity registration request is invalid");
    if (code === "registration_payment_conflict" || code === "IDEMPOTENCY_CONFLICT")
      return io.jsonOut(res, 409, { error: { code: "registration_payment_conflict" } });
    return io.jsonOut(res, 503, { error: { code: "registration_payment_unconfirmed" } });
  }
}
