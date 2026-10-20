import type { RegistrationAuthService } from "../registration-auth.js";
import type { TogetherActivity } from "../together-activity.js";
import type { SnowActivity, SnowRegistrationPayment, SnowRewardPort } from "./contracts.js";

export class RegistrationBalanceInsufficientError extends Error {}

export function createRegistrationCoordinator(
  activity: SnowActivity,
  economy: SnowRewardPort,
  auth: Pick<RegistrationAuthService, "confirmCurrentResidentMembership">,
) {
  const settle = async (payment: SnowRegistrationPayment) => {
    try {
      await auth.confirmCurrentResidentMembership(payment.residentId);
      if (!economy.chargeRegistration) throw new Error("registration_payment_unavailable");
      const receipt = await economy.chargeRegistration(payment);
      return activity.completeRegistration(payment, receipt);
    } catch (error) {
      // Read the durable current fact, not the outcome of an older HTTP attempt.
      return activity.failRegistration(
        payment,
        error instanceof RegistrationBalanceInsufficientError,
      );
    }
  };
  return {
    async execute(input: Parameters<TogetherActivity["execute"]>[0]) {
      const payment = activity.prepareRegistration(input);
      return payment ? settle(payment) : activity.execute(input);
    },
    async recover() {
      for (const payment of activity.controlView()?.registrationPayments ?? []) {
        if (payment.status !== "pending") continue;
        const attempt = activity.prepareRegistration({
          residentId: payment.residentId,
          op: "farm.together.choose",
          args: { option: payment.option },
        });
        if (attempt) await settle(attempt);
      }
    },
  };
}
