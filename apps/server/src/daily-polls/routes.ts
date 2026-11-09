import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { lingyeDailyPollBallotSchema, lingyeDailyPollViewSchema } from "@doorbell/protocol";
import { AuthenticationRequiredError, QqNotGroupMemberError, type RegistrationAuthService } from "../registration-auth.js";
import { readHumanSessionToken } from "../session-cookie.js";
import { DailyPollError, type DailyPollStore } from "./store.js";
import { dailyPollErrorText } from "./tool.js";

export function readDailyPollForHuman(store: DailyPollStore, issueDate: string, accountId: string, now: number) {
  const poll = store.read(issueDate, { humanAccountId: accountId }, now);
  if (!poll) return undefined;
  return lingyeDailyPollViewSchema.parse({
    title: poll.title, status: poll.status, closes_at: poll.closesAt,
    choices: poll.choices, own_choices: poll.ownChoices,
  });
}

export function registerDailyPollRoutes(app: FastifyInstance, options: {
  polls: DailyPollStore;
  auth: Pick<RegistrationAuthService, "getCurrentSession">;
  now?: () => number;
}) {
  const params = z.strictObject({ date: z.iso.date() });
  const now = options.now ?? Date.now;
  app.post("/api/lingye-daily/issues/:date/poll", async (request, reply) => {
    reply.header("cache-control", "no-store");
    try {
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) throw new AuthenticationRequiredError();
      const { origin, host } = request.headers;
      if (origin && new URL(origin).host !== host) {
        return reply.code(403).send({ error: { code: "invalid_request", message: "Origin mismatch" } });
      }
      const session = await options.auth.getCurrentSession(token);
      const { date } = params.parse(request.params);
      const { choices } = lingyeDailyPollBallotSchema.parse(request.body);
      return { choices: options.polls.vote(date, { humanAccountId: session.account.accountId }, choices, now()) };
    } catch (error) {
      if (error instanceof AuthenticationRequiredError || error instanceof QqNotGroupMemberError) {
        return reply.code(401).send({ error: { code: "authentication_required", message: "请先登录社区。" } });
      }
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: { code: "invalid_request", message: "请填1～3个不同的有效编号。" } });
      }
      if (error instanceof DailyPollError) {
        const status = error.code === "closed" ? 409 : error.code === "missing" ? 404 : 400;
        return reply.code(status).send({ error: { code: "invalid_request", message: dailyPollErrorText(error) } });
      }
      request.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Daily poll request failed");
      return reply.code(503).send({ error: { code: "service_unavailable", message: "投票暂时无法提交，请重试。" } });
    }
  });
}
