// Limited-time Together adapter. Existing options plus one chat action; no new tool or identity input.
import { randomBytes } from "node:crypto";
import { projectSnowBoard } from "./snow-war-board.mjs";
import {
  activeSnowChatTurn,
  advanceSnowChatTurn,
  currentSnowChatNotice,
  snowChatWindow,
} from "./snow-war-chat.mjs";
import { resolveSnowComposition, snowCompositionMenu } from "./snow-war-composed-options.mjs";
import { SNOW_WAR_CONFIG as CFG, SNOW_WAR_ECONOMY } from "./snow-war-config.mjs";
import { currentSnowDecision, reconcileSnowDecisions } from "./snow-war-decision-wakes.mjs";
import {
  advanceSnowLifecycle,
  currentSnowCaptainNotice,
  currentSnowDiscussionNotice,
  reconcileSnowRegistrationEligibility,
  registeredHomes,
} from "./snow-war-lifecycle.mjs";
import { SNOW_WAR_NOTICE_COPY } from "./snow-war-notice-copy.mjs";
import {
  describeSnowOption,
  renderSnowOperation,
  renderSnowResult,
} from "./snow-war-presentation.mjs";
import { openSnowWarRuntime } from "./snow-war-runtime.mjs";
import { createSeries, seriesView } from "./snow-war-series.mjs";
import { decorateSnowStatus } from "./snow-war-status.mjs";
import { openSnowWarStore } from "./snow-war-store.mjs";
import { SNOW_WAR_WAIT_COPY } from "./snow-war-wait-copy.mjs";
import { playedSnowRound, snowWaitBoundaries } from "./snow-war-waits.mjs";

const DAY = 86_400_000;
const own = (value, key) => Object.hasOwn(value, key);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = (code) => {
  throw new Error(code);
};
const bjDay = (time) => Math.floor((time + 8 * 3_600_000) / DAY);
const bjHour = (time) => new Date(time + 8 * 3_600_000).getUTCHours();

export function openSnowWarTogether({
  database,
  dbPath,
  identityForResident,
  listEligibleResidents = () => [],
  now = Date.now,
  clock,
  automatic = true,
  npcPolicy,
  onChange = () => {},
}) {
  const store = openSnowWarStore(database ?? dbPath);
  const runtime = openSnowWarRuntime({
    store,
    now,
    ...(clock ? { clock } : {}),
    automatic,
    npcPolicy,
    onTerminal: onChange,
    onDecisionDue: onChange,
  });
  const phase = (state) =>
    now() < state.opensAt
      ? "scheduled"
      : now() < state.closesAt
        ? "registration"
        : state.registrationEmpty
          ? "ended"
          : !store.loadSeries(state.activityId)
            ? "awaiting_teams"
            : "competition";

  const advance = (state) => {
    advanceSnowLifecycle({
      state,
      store,
      runtime,
      now: now(),
      eligibleResidents: listEligibleResidents(),
      identityForResident,
    });
    reconcileSnowDecisions(state, {
      runtime,
      loadBattle: (id) => store.loadBattle(id),
      identityForResident,
      present,
      render: renderSnowResult,
      at: now(),
    });
  };

  const available = (state, residentId) => {
    const stage = phase(state);
    const actions = [];
    if (stage === "registration") {
      if (!own(state.registrations, residentId)) actions.push({ kind: "register" });
      return { phase: stage, actions };
    }
    if (stage !== "competition") return { phase: stage, actions };
    const series = store.loadSeries(state.activityId);
    const summary = seriesView(series);
    for (const team of Object.values(summary.teams))
      for (const member of team.members) {
        if (member.isNpc) continue;
        const identity = identityForResident(member.id);
        if (identity?.residentName) member.residentName = identity.residentName;
        if (identity?.farmDoorplate) member.farmDoorplate = identity.farmDoorplate;
      }
    const side = ["A", "B"].find((key) =>
      series.teams[key].members.some((member) => member.id === residentId),
    );
    // No observer privileges are inferred from registration or a forged ID.
    if (!side) return { phase: "not_participant", actions };
    const channel = (state.messages ?? [])
      .filter((message) => message.side === side)
      .map(({ residentId, text, createdAt, messageId }) => ({
        residentId,
        text,
        createdAt,
        messageId,
      }));
    if (state.chatEnabled && series.status !== "complete") {
      const turn = activeSnowChatTurn(state, series, side, now(), identityForResident);
      if (turn?.currentResidentId === residentId)
        actions.push(
          { kind: "chat", turn: turn.turn, matchIndex: turn.matchIndex },
          { kind: "chat_pass", turn: turn.turn, matchIndex: turn.matchIndex },
        );
    }
    const matchIndex = series.matches.findIndex((match) => !match.winner);
    if (series.status === "complete" || matchIndex < 0)
      return { phase: "complete", series: summary, channel, actions };
    const match = series.matches[matchIndex];
    if (!match.locked) {
      if (series.captains[side] === residentId) {
        const key = `${matchIndex}:${side}`;
        const draft = state.drafts[key] ?? { order: [], skills: {} };
        const members = series.teams[side].members.map((member) => member.id);
        if (!match.lineups[side] && now() < state.lineupDeadlines[matchIndex]) {
          actions.push({ kind: "lineup_order", matchIndex, composed: "lineup" });
          if (
            draft.order.length === members.length &&
            draft.order.every((id) => draft.skills[id]?.length === CFG.maxCommanderSkillsPerMember)
          ) {
            if (
              !state.chatEnabled ||
              now() >= snowChatWindow(state, series, side, now()).closesAt
            ) {
              actions.push({ kind: "lineup_confirm", matchIndex });
            }
          }
          if (draft.order.length) actions.push({ kind: "lineup_reset", matchIndex });
        }
        return { phase: "lineup", series: summary, draft, channel, actions };
      }
      return { phase: "lineup", series: summary, channel, actions };
    }
    if (now() < state.matchStartsAt[matchIndex])
      return { phase: "scheduled_match", series: summary, channel, actions };
    const round = match.rounds.find((value) => !value.winner);
    if (!round) fail("round_missing");
    if (!own(series.startedRounds, round.battleId))
      runtime.prepare(state.activityId, matchIndex, round.index);
    if (round.attackMember !== residentId && round.defendMember !== residentId)
      return { phase: "waiting_round", series: summary, channel, actions };
    const actor = runtime.forResident(residentId);
    const view = actor.view(round.battleId);
    if (view.substituted)
      return { phase: "battle", series: summary, battle: view, channel, actions };
    if (!view.started) {
      if (!own(view.ready, residentId)) actions.push({ kind: "ready", battleId: round.battleId });
      return { phase: "preparation", series: summary, battle: view, channel, actions };
    }
    actions.push({ kind: "command", battleId: round.battleId, composed: "command" });
    return { phase: "battle", series: summary, battle: view, channel, actions };
  };

  const present = (state, residentId) => {
    const { actions, ...facts } = available(state, residentId);
    const series = store.loadSeries(state.activityId);
    const side =
      series &&
      ["A", "B"].find((key) =>
        series.teams[key].members.some((member) => member.id === residentId),
      );
    const matchIndex = series?.matches.findIndex((match) => !match.winner);
    const viewer = {
      id: residentId,
      side: side ?? null,
      captain: side ? series.captains[side] === residentId : false,
      lineupSubmitted:
        side && matchIndex >= 0 ? Boolean(series.matches[matchIndex].lineups[side]) : false,
    };
    const serial = state.serials[residentId] ?? 0;
    const issued = new Map(
      Object.entries(state.options)
        .filter(([, value]) => value.residentId === residentId && value.serial === serial)
        .map(([token, value]) => [JSON.stringify(value.action), [token, value]]),
    );
    const options = [...actions, { kind: "rules" }].map((action) => {
      let record = issued.get(JSON.stringify(action));
      if (!record) {
        let token;
        do {
          token = `sf_${randomBytes(9).toString("base64url")}`;
        } while (own(state.options, token));
        const value = { residentId, serial, action };
        state.options[token] = value;
        record = [token, value];
      }
      const composition = snowCompositionMenu(action, { ...facts, viewer }, record[0]);
      return {
        option: composition ? composition.prefix : record[0],
        action,
        label: describeSnowOption(action, { ...facts, viewer }),
        ...(composition
          ? { composition }
          : action.kind === "chat"
            ? { input: { action: "chat", option: record[0] } }
            : { call: { op: "farm.together.choose", args: { option: record[0] } } }),
      };
    });
    const rewards = Object.values(state.rewards ?? {})
      .filter((reward) => reward.residentId === residentId)
      .map(
        ({ grantId, gold, silver, status, kind, matchIndex, roundIndex, decoration, titles }) => ({
          grantId,
          gold,
          silver,
          status,
          kind,
          matchIndex,
          roundIndex,
          ...(decoration ? { decoration: structuredClone(decoration) } : {}),
          ...(titles ? { titles: [...titles] } : {}),
        }),
      );
    const expectedRewards =
      series?.status === "complete" && state.configuration.rewards && side
        ? [
            `${state.activityId}:titles:${residentId}`,
            ...series.matches.flatMap((match) =>
              match.rounds
                .filter((round) => playedSnowRound(round, residentId))
                .map((round) => `${round.battleId}:reward:${residentId}`),
            ),
            ...(series.matches
              .filter((match) => match.winner)
              .every((match) => match.rounds.some((round) => playedSnowRound(round, residentId)))
              ? [`${state.activityId}:complete:${residentId}`]
              : []),
            ...(series.seriesWinner === side &&
            series.matches.some((match) =>
              match.rounds.some((round) => playedSnowRound(round, residentId)),
            )
              ? [`${state.activityId}:champion:${residentId}`]
              : []),
          ]
        : [];
    return {
      activityId: state.activityId,
      ...(side && series && state.chatEnabled
        ? { discussion: snowChatWindow(state, series, side, now()) }
        : {}),
      viewer,
      ...facts,
      schedule: {
        opensAt: state.opensAt,
        closesAt: state.closesAt,
        matchStartsAt: state.matchStartsAt,
        plannedMatchStartsAt: state.configuration.matchStartsAt,
      },
      rules: structuredClone(CFG),
      participation:
        series && side
          ? series.matches.flatMap((match) =>
              match.rounds
                .filter(
                  (round) =>
                    round.winner && [round.attackMember, round.defendMember].includes(residentId),
                )
                .map((round) => ({
                  matchIndex: match.index,
                  roundIndex: round.index,
                  substituted: round.substitutes?.includes(residentId) ?? false,
                })),
            )
          : [],
      waitMessages: [
        ...(side && state.autoLineups?.[`${matchIndex}:${side}`] && viewer.captain
          ? [SNOW_WAR_WAIT_COPY.lineup]
          : []),
        ...(facts.battle?.substituted ? [SNOW_WAR_WAIT_COPY.preparation] : []),
        ...(side &&
        state.chatTurns?.[side]?.matchIndex === matchIndex &&
        state.chatTurns[side].timeouts?.[residentId]
          ? [SNOW_WAR_WAIT_COPY.chatTimeout]
          : []),
        ...(side &&
        state.chatTurns?.[side]?.matchIndex === matchIndex &&
        state.chatTurns[side].stopped
          ? [SNOW_WAR_WAIT_COPY.chatStopped]
          : []),
      ],
      waiting: {
        lineupDeadlineAt: state.lineupDeadlines?.[matchIndex] ?? null,
        chatDeadlineAt:
          side &&
          state.chatTurns?.[side]?.matchIndex === matchIndex &&
          !state.chatTurns[side].stopped
            ? (state.chatTurns[side].deadlineAt ?? null)
            : null,
      },
      ...(state.configuration.rewards
        ? { rewardPlan: structuredClone(state.configuration.rewards) }
        : {}),
      registration: {
        status: own(state.registrations, residentId)
          ? "registered"
          : (state.registrationPayments?.[residentId]?.status ?? "not_registered"),
        gold: SNOW_WAR_ECONOMY.registrationFeeGold,
        ...(state.registrationPayments?.[residentId]?.status === "pending"
          ? { option: state.registrationPayments[residentId].option }
          : {}),
      },
      rewards,
      rewardsSettled:
        series?.status === "complete" &&
        expectedRewards.every((id) => state.rewards[id]?.status === "paid"),
      options,
    };
  };

  const apply = (state, residentId, action, option, text) => {
    if (action.kind === "register") {
      if (state.registrationPayments?.[residentId]?.status !== "paid")
        fail("registration_payment_required");
      const identity = identityForResident(residentId);
      if (!identity || typeof identity.humanId !== "string" || !identity.humanId)
        fail("resident_not_eligible");
      // Only the trusted resolver supplies household identity; it is never projected.
      state.registrations[residentId] = { humanId: identity.humanId };
      return {
        ok: true,
        registration: { registered: true, gold: SNOW_WAR_ECONOMY.registrationFeeGold },
      };
    }
    if (action.kind === "chat" || action.kind === "chat_pass") {
      if (action.kind === "chat" && (typeof text !== "string" || !text.trim()))
        fail("message_required");
      const series = store.loadSeries(state.activityId);
      const side = ["A", "B"].find((key) =>
        series.teams[key].members.some((member) => member.id === residentId),
      );
      if (!side) fail("not_series_participant");
      const window = snowChatWindow(state, series, side, now());
      advanceSnowChatTurn(state, series, side, residentId, action.turn, identityForResident, {
        at: now(),
        pass: action.kind === "chat_pass",
        closesAt: window.closesAt,
      });
      if (action.kind === "chat") {
        state.messages ??= [];
        state.messages.push({ messageId: option, side, residentId, text, createdAt: now() });
        return { ok: true, messageId: option };
      }
      return { ok: true };
    }
    const actor = runtime.forResident(residentId);
    if (action.kind === "ready") return { ok: true, ...actor.ready(action.battleId) };
    if (action.kind === "command") {
      const result = action.waitOnly
        ? { ok: true }
        : actor.command(action.battleId, { ...action.command, requestId: option });
      const decisionWait = actor.waitForDecision(action.battleId, option, action.waitTicks);
      return { ...result, ...(decisionWait ? { decisionWait } : {}) };
    }
    const series = store.loadSeries(state.activityId);
    const side = ["A", "B"].find((key) => series.captains[key] === residentId);
    if (!side) fail("not_team_captain");
    const key = `${action.matchIndex}:${side}`;
    state.drafts[key] ??= { order: [], skills: {} };
    const draft = state.drafts[key];
    if (action.kind === "lineup_reset") {
      state.drafts[key] = { order: [], skills: {} };
      series.matches[action.matchIndex].lineups[side] = null;
      store.saveSeries(series);
    } else if (action.composed === "lineup") state.drafts[key] = structuredClone(action.lineup);
    else if (action.kind === "lineup_order") draft.order.push(action.member);
    else if (action.kind === "lineup_skill") {
      draft.skills[action.member] ??= [];
      draft.skills[action.member].push(action.skill);
    } else if (action.kind === "lineup_confirm")
      return actor.lineup(state.activityId, action.matchIndex, draft);
    else fail("unknown_activity_action");
    return { ok: true };
  };

  const perform = (state, residentId, action, option, text) => {
    const before = action.kind === "command" ? store.loadBattle(action.battleId) : undefined;
    const unit = before?.units[action.command?.unitId];
    const result = {
      ...apply(state, residentId, action, option, text),
      action: structuredClone(action),
    };
    const context = {};
    if (action.composed === "lineup") {
      const name = (id) => identityForResident(id)?.residentName ?? id;
      const series = store.loadSeries(state.activityId);
      const side = ["A", "B"].find((key) => series.captains[key] === residentId);
      const role = series.matches[action.matchIndex].attackSide === side ? "attack" : "defend";
      context.lineup = action.lineup.order.map((id) => ({
        name: name(id),
        skills: action.lineup.skills[id].map((key) => CFG.commanderSkills[role][key].name),
      }));
    }
    if (action.member) {
      const series = store.loadSeries(state.activityId);
      const side = ["A", "B"].find((key) => series.captains[key] === residentId);
      const draft = state.drafts[`${action.matchIndex}:${side}`];
      const name = (id) => identityForResident(id)?.residentName ?? id;
      context.memberName = name(action.member);
      context.position = draft.order.indexOf(action.member) + 1;
      context.remainingMembers = series.teams[side].members
        .filter((member) => !draft.order.includes(member.id))
        .map((member) => name(member.id));
      const role = series.matches[action.matchIndex].attackSide === side ? "attack" : "defend";
      context.skillName = CFG.commanderSkills[role][action.skill]?.name;
      context.skills = (draft.skills[action.member] ?? []).map(
        (key) => CFG.commanderSkills[role][key].name,
      );
    }
    if (action.kind === "command" && !action.waitOnly) {
      const command = action.command;
      const battle = store.loadBattle(action.battleId);
      const role = battle.participants.attack.includes(residentId) ? "attack" : "defend";
      const definition =
        role === "attack"
          ? CFG.attackerUnits[command.unitType ?? unit?.typeKey]
          : CFG.defenderUnits[command.unitType ?? unit?.typeKey];
      context.unitName = definition?.name;
      context.skillName =
        command.type === "unit_skill"
          ? definition?.unitSkill?.name
          : CFG.commanderSkills[role][command.skill]?.name;
      const key =
        command.type === "unit_skill"
          ? `${command.unitId}:skill`
          : `${role}:${residentId}:${command.skill}`;
      context.cooldownUntil = battle.cooldowns[key];
      const actual = result.facts ?? result;
      context.effect = {
        ...(actual.effect && Object.keys(actual.effect).length
          ? {
              效果: {
                ...(actual.effect.armorMult === undefined
                  ? {}
                  : { 护甲倍率: actual.effect.armorMult }),
                ...(actual.effect.intervalMult === undefined
                  ? {}
                  : { 攻击间隔倍率: actual.effect.intervalMult }),
                ...(actual.effect.speedMult === undefined
                  ? {}
                  : { 速度倍率: actual.effect.speedMult }),
              },
            }
          : {}),
        ...(actual.targetUnitIds === undefined ? {} : { 目标编号: actual.targetUnitIds }),
        ...(actual.shields === undefined
          ? {}
          : {
              效果: {
                新增护盾: Object.fromEntries(
                  actual.shields.map((target) => [target.unitId, target.added]),
                ),
              },
              生效至战斗秒: Object.fromEntries(
                actual.shields.map((target) => [target.unitId, target.untilTick]),
              ),
            }),
        ...(actual.healed === undefined ? {} : { 实际治疗: actual.healed }),
        ...(actual.untilTick === undefined ? {} : { 生效至战斗秒: actual.untilTick }),
        ...(actual.blockerId === undefined
          ? {}
          : { 目标编号: actual.blockerId, 停止攻击至战斗秒: actual.silencedUntilTick }),
      };
    }
    result.context = context;
    result.text = renderSnowOperation(result);
    return result;
  };

  return {
    decorateFarmStatus(residentId, text) {
      return runtime.atomic(() => {
        const state = store.readActivity();
        return decorateSnowStatus(text, state, residentId, now());
      });
    },
    mailboxNotificationExclusions(residentId, deliveredMessageIds = []) {
      const state = store.readActivity();
      if (!state) return [];
      const delivered = new Set(deliveredMessageIds);
      const represented = (notice) => {
        if (!notice.facts.lastMessageId) return false;
        const messages = (state.messages ?? []).filter(
          (message) => message.side === notice.facts.team,
        );
        const end = messages.findIndex(
          (message) => message.messageId === notice.facts.lastMessageId,
        );
        return (
          end >= 0 &&
          messages.slice(0, end + 1).every((message) => delivered.has(message.messageId))
        );
      };
      return Object.values(state.notices ?? {})
        .filter(
          (notice) =>
            notice.residentId === residentId &&
            notice.letterId &&
            ["registration", "chat_turn", "captain", "action_due", "discussion_start"].includes(
              notice.kind,
            ),
        )
        .filter(
          (notice) =>
            state.retired ||
            notice.status === "cancelled" ||
            (notice.kind === "discussion_start" &&
              !currentSnowDiscussionNotice(
                state,
                store.loadSeries(state.activityId),
                notice,
                now(),
              )) ||
            (notice.kind === "action_due" &&
              !currentSnowDecision(
                store.loadBattle(notice.facts.battleId),
                residentId,
                notice.id,
              )) ||
            (notice.kind === "registration" &&
              (now() < state.opensAt ||
                now() >= state.closesAt ||
                state.registrationPayments?.[residentId]?.status === "pending" ||
                own(state.registrations, residentId))) ||
            (notice.kind === "captain" &&
              !currentSnowCaptainNotice(
                state,
                store.loadSeries(state.activityId),
                notice,
                now(),
              )) ||
            (notice.kind === "chat_turn" &&
              (!currentSnowChatNotice(state, store.loadSeries(state.activityId), notice, now()) ||
                // Only skip the supplemental letter when this response already
                // delivered every message represented by that exact letter.
                represented(notice))),
        )
        .map((notice) => notice.letterId);
    },
    chatNoticeMessages(id) {
      const state = store.readActivity(),
        notice = state?.notices?.[id];
      if (notice?.kind !== "chat_turn" || !notice.facts.lastMessageId) return [];
      const messages = (state.messages ?? []).filter(
        (message) => message.side === notice.facts.team,
      );
      const end = messages.findIndex((message) => message.messageId === notice.facts.lastMessageId);
      if (end < 0) fail("chat_history_missing");
      return messages.slice(0, end + 1).map((message) => ({
        residentName: identityForResident(message.residentId)?.residentName ?? message.residentId,
        text: message.text,
      }));
    },
    prepareRegistration({ residentId, op, args }) {
      if (op !== "farm.together.choose" || args.action !== undefined) return undefined;
      return runtime.atomic(() => {
        const state = store.readActivity();
        if (!state || state.retired) return undefined;
        const record = own(state.options, args.option) ? state.options[args.option] : undefined;
        if (
          record?.residentId !== residentId ||
          record.action.kind !== "register" ||
          own(state.receipts, args.option)
        )
          return undefined;
        const identity = identityForResident(residentId);
        if (!identity) return undefined;
        state.registrationPayments ??= {};
        const previous = state.registrationPayments[residentId];
        if (previous?.excludedFromSeries) return undefined;
        if (previous?.status === "pending") {
          previous.attemptRevision = (previous.attemptRevision ?? 0) + 1;
          store.saveActivity(state);
          return {
            paymentId: previous.paymentId,
            residentId,
            gold: previous.gold,
            status: previous.status,
            option: previous.option,
            attemptRevision: previous.attemptRevision,
          };
        }
        if (
          phase(state) !== "registration" ||
          record.serial !== (state.serials[residentId] ?? 0) ||
          own(state.registrations, residentId)
        )
          return undefined;
        const payment = {
          paymentId: `${state.activityId}:registration:${residentId}`,
          residentId,
          gold: SNOW_WAR_ECONOMY.registrationFeeGold,
          status: "pending",
          option: args.option,
          attemptRevision: (previous?.attemptRevision ?? 0) + 1,
          humanId: identity.humanId,
        };
        state.registrationPayments[residentId] = payment;
        store.saveActivity(state);
        return {
          paymentId: payment.paymentId,
          residentId,
          gold: payment.gold,
          status: payment.status,
          option: payment.option,
          attemptRevision: payment.attemptRevision,
        };
      });
    },
    completeRegistration(payment, receipt) {
      return runtime.atomic(() => {
        const state = store.readActivity();
        const intent = state?.registrationPayments?.[payment.residentId];
        if (
          !intent ||
          intent.paymentId !== payment.paymentId ||
          intent.gold !== payment.gold ||
          receipt.paymentId !== payment.paymentId ||
          receipt.residentId !== payment.residentId ||
          receipt.gold !== payment.gold ||
          typeof receipt.journalId !== "string" ||
          !receipt.journalId
        )
          fail("registration_receipt_mismatch");
        if (intent.excludedFromSeries) {
          if (intent.receipt && !equal(intent.receipt, receipt))
            fail("registration_receipt_mismatch");
          intent.status = "paid";
          intent.receipt = receipt;
          store.saveActivity(state);
          return { ok: false, data: { error: "resident_not_eligible" } };
        }
        const identity = identityForResident(payment.residentId);
        if (!identity || identity.humanId !== intent.humanId) fail("resident_not_eligible");
        const replay = own(state.receipts, intent.option);
        if (replay && !equal(intent.receipt, receipt)) fail("registration_receipt_mismatch");
        if (!replay) {
          intent.status = "paid";
          intent.receipt = receipt;
          const result = perform(state, payment.residentId, { kind: "register" }, intent.option);
          state.receipts[intent.option] = result;
          state.receiptInputs ??= {};
          state.receiptInputs[intent.option] = null;
          state.serials[payment.residentId] = (state.serials[payment.residentId] ?? 0) + 1;
        }
        const data = {
          ...present(state, payment.residentId),
          result: state.receipts[intent.option],
          ...(replay ? { replay: true } : {}),
        };
        store.saveActivity(state);
        return { ok: true, data };
      });
    },
    failRegistration(payment, insufficient) {
      return runtime.atomic(() => {
        const state = store.readActivity(),
          intent = state?.registrationPayments?.[payment.residentId];
        if (!intent || intent.paymentId !== payment.paymentId || intent.gold !== payment.gold)
          fail("registration_receipt_mismatch");
        if (intent.excludedFromSeries) {
          if (
            intent.status !== "paid" &&
            insufficient &&
            intent.attemptRevision === payment.attemptRevision
          ) {
            intent.status = "declined";
            store.saveActivity(state);
          }
          return { ok: false, data: { error: "resident_not_eligible" } };
        }
        if (intent.status === "paid") {
          return {
            ok: true,
            data: {
              ...present(state, payment.residentId),
              result: state.receipts[intent.option],
              replay: true,
            },
          };
        }
        // Only the latest attempt can confirm insufficient funds. An unknown
        // outcome, even from an older dispatched attempt, must remain recoverable.
        const status = !insufficient
          ? "pending"
          : intent.attemptRevision === payment.attemptRevision
            ? "declined"
            : intent.status;
        if (intent.status !== status) {
          intent.status = status;
          store.saveActivity(state);
        }
        return {
          ok: false,
          data: {
            error:
              status === "declined"
                ? "registration_balance_insufficient"
                : "registration_payment_unconfirmed",
            registration: {
              status,
              gold: intent.gold,
              ...(status === "pending" ? { paymentId: intent.paymentId } : {}),
            },
          },
        };
      });
    },
    // Trusted event lifecycle input, not a resident tool or invented default schedule.
    configure({
      activityId,
      opensAt,
      closesAt,
      matchStartsAt,
      rewards,
      copy = SNOW_WAR_NOTICE_COPY,
      chatEnabled = false,
    }) {
      if (
        typeof activityId !== "string" ||
        !activityId ||
        !Number.isSafeInteger(opensAt) ||
        !Number.isSafeInteger(closesAt) ||
        closesAt <= opensAt ||
        !Array.isArray(matchStartsAt) ||
        matchStartsAt.length !== 3 ||
        matchStartsAt.some((value) => !Number.isSafeInteger(value)) ||
        matchStartsAt[0] < closesAt ||
        !(matchStartsAt[0] < matchStartsAt[1] && matchStartsAt[1] < matchStartsAt[2]) ||
        bjDay(matchStartsAt[0]) !== bjDay(matchStartsAt[1]) ||
        bjDay(matchStartsAt[2]) !== bjDay(matchStartsAt[0]) + 1 ||
        bjHour(matchStartsAt[0]) >= 12 ||
        bjHour(matchStartsAt[1]) < 12 ||
        bjHour(matchStartsAt[2]) >= 12
      )
        fail("invalid_activity_schedule");
      runtime.atomic(() => {
        const previous = store.readActivity();
        if (
          rewards &&
          ["round", "complete", "champion"].some(
            (key) =>
              !rewards[key] ||
              !Number.isSafeInteger(rewards[key].gold) ||
              rewards[key].gold < 0 ||
              !Number.isSafeInteger(rewards[key].silver) ||
              rewards[key].silver < 0,
          )
        )
          fail("invalid_rewards");
        if (
          copy &&
          ["registration", "team", "captain", "round", "started", "result"].some(
            (key) => typeof copy[key] !== "string" || !copy[key].trim(),
          )
        )
          fail("invalid_copy");
        const configuration = {
          activityId,
          opensAt,
          closesAt,
          matchStartsAt,
          ...(rewards ? { rewards } : {}),
          ...(copy ? { copy } : {}),
          ...(chatEnabled ? { chatEnabled } : {}),
        };
        if (previous) {
          if (!equal(previous.configuration, configuration)) fail("activity_already_configured");
          return;
        }
        store.saveActivity({
          ...configuration,
          configuration,
          registrations: {},
          drafts: {},
          serials: {},
          options: {},
          receipts: {},
          receiptInputs: {},
          messages: [],
          notices: {},
          rewards: {},
        });
      });
    },
    finalizeRegistration({ captains }) {
      return runtime.atomic(() => {
        const state = store.readActivity();
        if (!state || now() < state.closesAt) fail("registration_not_closed");
        if (reconcileSnowRegistrationEligibility(state, identityForResident, now()))
          fail("registration_payments_pending");
        const existing = store.loadSeries(state.activityId);
        if (existing) {
          if (!equal(existing.captains, captains)) fail("captain_conflict");
          return seriesView(existing);
        }
        store.saveActivity(state);
        return runtime.create({
          seriesId: state.activityId,
          captains,
          humanEntries: registeredHomes(state, identityForResident),
        });
      });
    },
    setCaptains(captains) {
      runtime.atomic(() => {
        const state = store.readActivity();
        if (!state) fail("activity_not_configured");
        const existing = store.loadSeries(state.activityId);
        if (existing) {
          if (!equal(existing.captains, captains)) fail("captain_conflict");
          return;
        }
        if (now() < state.closesAt) fail("registration_not_closed");
        if (reconcileSnowRegistrationEligibility(state, identityForResident, now()))
          fail("registration_payments_pending");
        if (
          !captains ||
          Object.keys(captains).sort().join(",") !== "A,B" ||
          captains.A === captains.B ||
          !identityForResident(captains.A) ||
          !identityForResident(captains.B)
        )
          fail("invalid_captain");
        const preview = createSeries({
          seriesId: state.activityId,
          humanEntries: registeredHomes(state, identityForResident),
        });
        for (const side of ["A", "B"])
          if (
            !preview.teams[side].members.some(
              (member) => member.id === captains[side] && !member.isNpc,
            )
          )
            fail("invalid_captain");
        state.adminCaptains = captains;
        advance(state);
        store.saveActivity(state);
      });
      onChange();
    },
    reconcile() {
      return runtime.atomic(() => {
        const state = store.readActivity();
        if (!state) return;
        advance(state);
        store.saveActivity(state);
      });
    },
    controlView() {
      const state = store.readActivity();
      if (!state) return undefined;
      const eligibleHomes =
        now() >= state.closesAt ? registeredHomes(state, identityForResident) : [];
      return {
        configuration: state.configuration,
        retired: state.retired === true,
        registrations: Object.keys(state.registrations),
        registrationPayments: Object.values(state.registrationPayments ?? {}).map(
          ({
            paymentId,
            residentId,
            gold,
            status,
            option,
            attemptRevision = 0,
            excludedFromSeries,
            excludedAt,
          }) => ({
            paymentId,
            residentId,
            gold,
            status,
            option,
            attemptRevision,
            ...(excludedFromSeries ? { excludedFromSeries, excludedAt } : {}),
          }),
        ),
        series: store.loadSeries(state.activityId),
        ...(eligibleHomes.length
          ? {
              proposedTeams: createSeries({
                seriesId: state.activityId,
                humanEntries: eligibleHomes,
              }).teams,
            }
          : {}),
        notices: Object.values(state.notices ?? {}),
        chatBoundaries: Object.values(state.chatWindows ?? {}).flatMap((windows) =>
          windows.flatMap((window) => [window.opensAt, window.closesAt]),
        ),
        waitBoundaries: snowWaitBoundaries(state, store.loadSeries(state.activityId), (id) =>
          store.loadBattle(id),
        ),
        rewards: Object.values(state.rewards ?? {}),
      };
    },
    board(residentId) {
      return runtime.atomic(() => {
        const state = store.readActivity();
        if (!state) return null;
        advance(state);
        store.saveActivity(state);
        return projectSnowBoard({
          state,
          series: store.loadSeries(state.activityId),
          residentId,
          now: now(),
          identityForResident,
          loadBattle: (id) => store.loadBattle(id),
        });
      });
    },
    publishNotice(id, deliver) {
      return runtime.atomic(() => {
        const state = store.readActivity(),
          notice = state?.notices?.[id];
        if (!notice) fail("notice_missing");
        if (notice.status !== "pending") return structuredClone(notice);
        if (
          (notice.kind === "discussion_start" &&
            !currentSnowDiscussionNotice(
              state,
              store.loadSeries(state.activityId),
              notice,
              now(),
            )) ||
          (notice.kind === "captain" &&
            !currentSnowCaptainNotice(state, store.loadSeries(state.activityId), notice, now())) ||
          (notice.kind === "chat_turn" &&
            !currentSnowChatNotice(state, store.loadSeries(state.activityId), notice, now())) ||
          (notice.kind === "action_due" &&
            !currentSnowDecision(
              store.loadBattle(notice.facts.battleId),
              notice.residentId,
              notice.id,
            ))
        ) {
          if (notice.status === "pending")
            Object.assign(notice, { status: "cancelled", endedAt: now() });
          store.saveActivity(state);
          return structuredClone(notice);
        }
        notice.bellEligible = ["team", "captain", "round", "action_due", "chat_turn"].includes(
          notice.kind,
        );
        if (!notice.letterId) {
          notice.letterId = deliver(structuredClone(notice));
        }
        store.saveActivity(state);
        return structuredClone(notice);
      });
    },
    finishNotice(id, status, at, blockReason = null, errorCode = null) {
      return runtime.atomic(() => {
        const state = store.readActivity(),
          notice = state?.notices?.[id];
        if (!notice) return "missing";
        if (notice.status === status) return "duplicate";
        if (notice.status !== "pending") return "conflict";
        Object.assign(notice, { status, endedAt: at, blockReason, errorCode });
        store.saveActivity(state);
        return "changed";
      });
    },
    settleReward(id, receipt) {
      runtime.atomic(() => {
        const state = store.readActivity(),
          reward = state?.rewards?.[id];
        if (
          !reward ||
          receipt.grantId !== id ||
          receipt.residentId !== reward.residentId ||
          receipt.gold !== reward.gold ||
          receipt.silver !== reward.silver ||
          !equal(receipt.titles ?? null, reward.titles ?? null) ||
          (reward.decoration
            ? receipt.decoration?.itemId !== reward.decoration.itemId ||
              receipt.decoration?.quantity !== reward.decoration.quantity
            : receipt.decoration !== undefined)
        )
          fail("reward_receipt_mismatch");
        reward.status = "paid";
        reward.receipt = receipt;
        store.saveActivity(state);
      });
    },
    retire() {
      runtime.atomic(() => {
        const state = store.readActivity();
        // atomic() first pumps due battle ticks. Generate any newly owed rewards
        // before checking settlement, including when that pump ended the series.
        if (state) advance(state);
        const series = state && store.loadSeries(state.activityId);
        const emptyEnded =
          state?.registrationEmpty === true &&
          now() >= state.closesAt &&
          !series &&
          !Object.values(state.registrationPayments ?? {}).some(
            (payment) => payment.status === "pending" && !payment.excludedFromSeries,
          );
        if (!state || (series?.status !== "complete" && !emptyEnded)) fail("activity_not_complete");
        if (Object.values(state.rewards ?? {}).some((reward) => reward.status !== "paid"))
          fail("rewards_not_settled");
        for (const notice of Object.values(state.notices ?? {})) {
          if (notice.status === "pending")
            Object.assign(notice, { status: "cancelled", endedAt: now() });
        }
        state.retired = true;
        store.saveActivity(state);
      });
    },
    async execute({ residentId, op, args }) {
      if (op !== "farm.together.view" && op !== "farm.together.choose") return undefined;
      if (op === "farm.together.view" && args.section === "history") return undefined;
      const active = store.readActivity();
      if (!active)
        return args.action === "chat"
          ? { ok: false, data: { error: "option_not_available" } }
          : undefined;
      if (active.retired) {
        if (
          op === "farm.together.view" ||
          typeof args.option !== "string" ||
          !args.option.startsWith("sf_")
        )
          return undefined;
        const option = args.option;
        const text = args.action === "chat" ? args.text : null;
        const token = option.split(":", 1)[0];
        const record = own(active.options, token) ? active.options[token] : undefined;
        if (record?.residentId !== residentId || !identityForResident(residentId))
          return { ok: false, data: { error: "option_not_available" } };
        if ((active.receiptInputs?.[option] ?? null) !== text)
          return { ok: false, data: { error: "request_conflict" } };
        const result = active.receipts[option];
        return result
          ? {
              ok: result.ok,
              data: {
                activityId: active.activityId,
                phase: "ended",
                replay: true,
                result,
                options: [],
              },
            }
          : { ok: false, data: { error: "option_not_available" } };
      }
      if (!identityForResident(residentId))
        return { ok: false, data: { error: "resident_not_eligible" } };
      return runtime.atomic(() => {
        const state = store.readActivity();
        advance(state);
        const decline = (error) => {
          const data = present(state, residentId);
          store.saveActivity(state);
          return { ok: false, data: { error, waitMessages: data.waitMessages } };
        };
        if (state.registrationPayments?.[residentId]?.excludedFromSeries)
          return decline("resident_not_eligible");
        if (op === "farm.together.view") {
          const data = present(state, residentId);
          store.saveActivity(state);
          return { ok: true, data };
        }
        const option = args.option;
        const token = typeof option === "string" ? option.split(":", 1)[0] : undefined;
        const text = args.action === "chat" ? args.text : undefined;
        const record =
          typeof token === "string" && own(state.options, token) ? state.options[token] : undefined;
        if (!record || record.residentId !== residentId) return decline("option_not_available");
        if ((record.action.kind === "chat") !== (args.action === "chat"))
          return decline("option_not_available");
        // Successful receipts remain valid even after the phase or actor's options changed.
        if (own(state.receipts, option)) {
          if ((state.receiptInputs?.[option] ?? null) !== (text ?? null))
            return decline("request_conflict");
          const data = {
            ...present(state, residentId),
            replay: true,
            result: state.receipts[option],
          };
          store.saveActivity(state);
          return { ok: state.receipts[option].ok, data };
        }
        const current = available(state, residentId);
        if (
          record.serial !== (state.serials[residentId] ?? 0) ||
          (record.action.kind !== "rules" &&
            !current.actions.some((action) => equal(action, record.action)))
        )
          return decline("option_not_available");
        if (record.action.kind === "rules") {
          store.saveActivity(state);
          return {
            ok: true,
            data: { activityId: state.activityId, section: "rules", rules: structuredClone(CFG) },
          };
        }
        let action = record.action;
        if (action.composed) {
          try {
            action = resolveSnowComposition(
              action,
              option.slice(token.length + 1),
              store.loadSeries(state.activityId),
              residentId,
              current.battle,
            );
            if (option[token.length] !== ":") return decline("option_not_available");
          } catch (error) {
            if (error.message !== "option_not_available") throw error;
            return decline("option_not_available");
          }
        } else if (option !== token) return decline("option_not_available");
        const result = perform(state, residentId, action, option, text);
        state.receipts[option] = result;
        state.receiptInputs ??= {};
        state.receiptInputs[option] = text ?? null;
        state.serials[residentId] = (state.serials[residentId] ?? 0) + 1;
        if (["chat", "chat_pass", "ready", "command"].includes(record.action.kind)) advance(state);
        const data = { ...present(state, residentId), result };
        store.saveActivity(state);
        return { ok: result.ok, data };
      });
    },
    close() {
      runtime.close();
    },
  };
}
