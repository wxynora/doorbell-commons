import { randomBytes, randomUUID } from "node:crypto";
import type { LoungeSnapshot } from "@doorbell/protocol";
import {
  LOUNGE_CHAT_DURATION_MINUTES,
  type LoungeChatDurationMinutes,
} from "./lounge-chat-wake-policy.js";
import type { LoungeChatRuntimePort } from "./lounge-runtime.js";
import type {
  LoungeChooseAreaInput,
  LoungeEnterInput,
  LoungeRetractInput,
  LoungeSayInput,
  LoungeService,
} from "./lounge-service.js";

/**
 * The say entry deliberately depends on the already implemented lounge
 * domain service. It does not own another presence, message, or notification
 * store.
 */
export type LoungeChatToolService = Pick<
  LoungeService,
  "readSnapshotForResident" | "enter" | "chooseArea" | "say" | "retract"
>;

export interface LoungeChatToolArgs {
  option?: string;
  text?: string;
  replyToMessageId?: string;
}

export interface LoungeChatToolOptions {
  loungeService: LoungeChatToolService;
  runtime?: LoungeChatRuntimePort;
  now?: () => number;
  generateMessageId?: () => string;
  /** Trusted runtime state that prevents chat area changes during a game. */
  canChat?: (residentId: string) => boolean | Promise<boolean>;
}

export type LoungeChatToolErrorCode =
  | "invalid_args"
  | "option_invalid"
  | "not_in_lounge"
  | "chat_unavailable"
  | "reply_target_invalid";

export class LoungeChatToolError extends Error {
  constructor(
    readonly code: LoungeChatToolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LoungeChatToolError";
  }
}

type LoungeChatOptionKind = "enter" | "leave" | "retract";

interface LoungeChatOption {
  option: string;
  label: string;
  kind: LoungeChatOptionKind;
  durationMinutes?: LoungeChatDurationMinutes;
  messageId?: string;
}

type PendingLoungeChatOption = Pick<LoungeChatOption, "kind" | "messageId"> & {
  residentId: string;
  leaseRevision: number;
  durationMinutes?: LoungeChatDurationMinutes;
};

const OPTION_PATTERN = /^[A-Za-z0-9_-]{6}$/u;
const USED_OPTIONS = new Set<string>();

// These short labels are only the candidate adapter's readable receipt. They
// are intentionally not registered as model-visible descriptions here.
const ENTER_LABEL = "进入闲聊";
const LEAVE_LABEL = "退出闲聊";
const ENTER_DURATIONS: readonly LoungeChatDurationMinutes[] = [
  15,
  ...LOUNGE_CHAT_DURATION_MINUTES.filter((minutes) => minutes !== 15),
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionInvalid(): LoungeChatToolError {
  return new LoungeChatToolError(
    "option_invalid",
    "这个休息室 option 不存在、已失效，或不属于当前身份。",
  );
}

function invalidArgs(message: string): LoungeChatToolError {
  return new LoungeChatToolError("invalid_args", message);
}

function currentPresence(
  snapshot: LoungeSnapshot,
  residentId: string,
): LoungeSnapshot["presence"][number] | undefined {
  return snapshot.presence.find((entry) => entry.resident_id === residentId);
}

function messageLine(message: LoungeSnapshot["messages"][number]): string[] {
  const reply = message.reply_to_message_id
    ? `\n  回复消息编号：${message.reply_to_message_id}`
    : "";
  return [
    `- ${message.resident_name}：${message.text}`,
    `  消息编号：${message.message_id}　时间：${message.created_at}${reply}`,
  ];
}

export class LoungeChatTool {
  readonly #loungeService: LoungeChatToolService;
  readonly #runtime: LoungeChatRuntimePort | undefined;
  readonly #now: () => number;
  readonly #generateMessageId: () => string;
  readonly #canChat: (residentId: string) => boolean | Promise<boolean>;
  readonly #latestOptions = new Map<string, Map<string, PendingLoungeChatOption>>();

  constructor(options: LoungeChatToolOptions) {
    this.#loungeService = options.loungeService;
    this.#runtime = options.runtime;
    this.#now = options.now ?? Date.now;
    this.#generateMessageId = options.generateMessageId ?? randomUUID;
    this.#canChat =
      options.canChat ??
      (options.runtime ? options.runtime.canChat.bind(options.runtime) : () => false);
  }

  async execute(residentId: string, args: LoungeChatToolArgs): Promise<string>;
  async execute(residentId: string, op: string, args: LoungeChatToolArgs): Promise<string>;
  async execute(
    residentId: string,
    opOrArgs: string | LoungeChatToolArgs,
    suppliedArgs?: LoungeChatToolArgs,
  ): Promise<string> {
    if (typeof residentId !== "string" || residentId.trim().length === 0) {
      throw invalidArgs("当前调用身份不能为空。");
    }
    if (typeof opOrArgs === "string" && opOrArgs !== "go.lounge.say") {
      throw invalidArgs(`休息室聊天适配器不接受操作 ${opOrArgs}。`);
    }
    const args = typeof opOrArgs === "string" ? suppliedArgs : opOrArgs;
    if (args === undefined) throw invalidArgs("say 的参数必须是对象。");
    const normalized = this.#normalizeArgs(args);
    await this.#runtime?.expire(residentId);
    if (normalized.option !== undefined) {
      return this.#executeOption(residentId, normalized.option);
    }
    if (normalized.text !== undefined) {
      return this.#say(residentId, normalized.text, normalized.replyToMessageId);
    }
    return this.#render(
      this.#readSnapshot(residentId),
      residentId,
      await this.#chatAllowed(residentId),
    );
  }

  #normalizeArgs(args: LoungeChatToolArgs): LoungeChatToolArgs {
    if (!isRecord(args)) throw invalidArgs("say 的参数必须是对象。");
    const allowed = new Set(["option", "text", "replyToMessageId"]);
    const unknown = Object.keys(args).find((key) => !allowed.has(key));
    if (unknown) throw invalidArgs(`say 不接受参数 ${unknown}。`);

    const option = args.option;
    if (option !== undefined && (typeof option !== "string" || option.length === 0)) {
      throw invalidArgs("option 必须是非空字符串。");
    }
    const text = args.text;
    if (text !== undefined && (typeof text !== "string" || text.trim().length === 0)) {
      throw invalidArgs("text 必须是非空字符串。");
    }
    const replyToMessageId = args.replyToMessageId;
    if (
      replyToMessageId !== undefined &&
      (typeof replyToMessageId !== "string" || replyToMessageId.trim().length === 0)
    ) {
      throw invalidArgs("replyToMessageId 必须是非空字符串。");
    }
    if (option !== undefined && (text !== undefined || replyToMessageId !== undefined)) {
      throw invalidArgs("option 不能和 text 或 replyToMessageId 同时提交。");
    }
    return {
      ...(option === undefined ? {} : { option }),
      ...(text === undefined ? {} : { text }),
      ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
    };
  }

  #readSnapshot(residentId: string): LoungeSnapshot {
    return this.#loungeService.readSnapshotForResident(residentId);
  }

  #currentOptions(
    snapshot: LoungeSnapshot,
    residentId: string,
    canChat: boolean,
  ): LoungeChatOption[] {
    const options: LoungeChatOption[] = [];
    const group = new Map<string, PendingLoungeChatOption>();
    this.#latestOptions.set(residentId, group);
    const leaseRevision = this.#runtime?.getLeaseRevision(residentId) ?? 0;
    const presence = currentPresence(snapshot, residentId);
    if (canChat) {
      if (presence?.area_id === "conversation") {
        options.push(
          this.#newOption({ residentId, kind: "leave", leaseRevision }, LEAVE_LABEL, group),
        );
      } else {
        for (const durationMinutes of ENTER_DURATIONS) {
          options.push(
            this.#newOption(
              { residentId, kind: "enter", durationMinutes, leaseRevision },
              `${ENTER_LABEL}（${durationMinutes}分钟）`,
              group,
            ),
          );
        }
      }
    }
    for (const message of snapshot.messages) {
      if (message.resident_id !== residentId) continue;
      options.push(
        this.#newOption(
          { residentId, kind: "retract", messageId: message.message_id, leaseRevision },
          `撤回消息 ${message.message_id}`,
          group,
        ),
      );
    }
    return options;
  }

  #newOption(
    pending: PendingLoungeChatOption,
    label: string,
    group: Map<string, PendingLoungeChatOption>,
  ): LoungeChatOption {
    let option = "";
    do {
      option = randomBytes(4).toString("base64url");
    } while (USED_OPTIONS.has(option));
    USED_OPTIONS.add(option);
    group.set(option, pending);
    return {
      option,
      label,
      kind: pending.kind,
      ...(pending.durationMinutes === undefined
        ? {}
        : { durationMinutes: pending.durationMinutes }),
      ...(pending.messageId === undefined ? {} : { messageId: pending.messageId }),
    };
  }

  async #render(snapshot: LoungeSnapshot, residentId: string, canChat: boolean): Promise<string> {
    const present = currentPresence(snapshot, residentId);
    const lines = [
      "休息室闲聊",
      `状态：${present?.area_id === "conversation" ? "已进入闲聊" : "未进入闲聊"}`,
      "消息：",
    ];
    if (snapshot.messages.length === 0) {
      lines.push("暂无消息。");
    } else {
      for (const message of snapshot.messages) lines.push(...messageLine(message));
    }
    lines.push("选项：");
    for (const entry of this.#currentOptions(snapshot, residentId, canChat)) {
      lines.push(`- ${entry.label}（option：${entry.option}）`);
    }
    return lines.join("\n");
  }

  async #say(
    residentId: string,
    text: string,
    replyToMessageId: string | undefined,
  ): Promise<string> {
    const snapshot = this.#readSnapshot(residentId);
    if (this.#runtime) {
      if (!(await this.#runtime.activeForSay(residentId))) {
        throw new LoungeChatToolError("not_in_lounge", "请先进入休息室闲聊。");
      }
    } else if (currentPresence(snapshot, residentId)?.area_id !== "conversation") {
      throw new LoungeChatToolError("not_in_lounge", "请先进入休息室闲聊。");
    }
    await this.#assertCanChat(residentId);
    if (
      replyToMessageId !== undefined &&
      !snapshot.messages.some((message) => message.message_id === replyToMessageId)
    ) {
      throw new LoungeChatToolError(
        "reply_target_invalid",
        "回复目标不是当前休息室中可读的公开消息。",
      );
    }
    const input: LoungeSayInput = {
      residentId,
      messageId: this.#generateMessageId(),
      text,
      createdAt: this.#now(),
      ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
    };
    const message = this.#loungeService.say(input);
    return [
      `已发布休息室闲聊，消息编号：${message.messageId}。`,
      await this.#render(
        this.#readSnapshot(residentId),
        residentId,
        await this.#chatAllowed(residentId),
      ),
    ].join("\n\n");
  }

  async #executeOption(residentId: string, option: string): Promise<string> {
    const snapshot = this.#readSnapshot(residentId);
    const entry = this.#decodeOption(snapshot, residentId, option);
    if (entry.kind === "enter") {
      await this.#assertCanChat(residentId);
      if (this.#runtime) {
        if (!(await this.#runtime.enter(residentId, entry.durationMinutes))) {
          await this.#assertCanChat(residentId);
        }
      } else {
        if (!currentPresence(snapshot, residentId)) {
          this.#loungeService.enter({ residentId } satisfies LoungeEnterInput);
        }
        this.#loungeService.chooseArea({
          residentId,
          areaId: "conversation",
        } satisfies LoungeChooseAreaInput);
      }
    } else if (entry.kind === "leave") {
      await this.#assertCanChat(residentId);
      if (this.#runtime) {
        if (!(await this.#runtime.leave(residentId))) throw optionInvalid();
      } else {
        this.#loungeService.chooseArea({
          residentId,
          areaId: "idle",
        } satisfies LoungeChooseAreaInput);
      }
    } else {
      if (!entry.messageId) throw optionInvalid();
      const retracted = this.#loungeService.retract({
        residentId,
        messageId: entry.messageId,
        retractedAt: this.#now(),
      } satisfies LoungeRetractInput);
      if (!retracted) throw optionInvalid();
    }
    return this.#render(
      this.#readSnapshot(residentId),
      residentId,
      await this.#chatAllowed(residentId),
    );
  }

  async #chatAllowed(residentId: string): Promise<boolean> {
    return await this.#canChat(residentId);
  }

  async #assertCanChat(residentId: string): Promise<void> {
    if (!(await this.#chatAllowed(residentId))) {
      throw new LoungeChatToolError("chat_unavailable", "当前不能进行休息室闲聊。");
    }
  }

  #decodeOption(snapshot: LoungeSnapshot, residentId: string, option: string): LoungeChatOption {
    if (!OPTION_PATTERN.test(option)) throw optionInvalid();
    const pending = this.#latestOptions.get(residentId)?.get(option);
    if (!pending || pending.residentId !== residentId) throw optionInvalid();
    const leaseRevision = this.#runtime?.getLeaseRevision(residentId) ?? 0;
    if (pending.leaseRevision !== leaseRevision) throw optionInvalid();
    if (pending.kind === "enter") {
      if (currentPresence(snapshot, residentId)?.area_id === "conversation") {
        throw optionInvalid();
      }
      if (
        pending.durationMinutes === undefined ||
        !LOUNGE_CHAT_DURATION_MINUTES.includes(pending.durationMinutes)
      ) {
        throw optionInvalid();
      }
      return {
        option,
        label: `${ENTER_LABEL}（${pending.durationMinutes}分钟）`,
        kind: pending.kind,
        durationMinutes: pending.durationMinutes,
      };
    }
    if (pending.kind === "leave") {
      if (currentPresence(snapshot, residentId)?.area_id !== "conversation") {
        throw optionInvalid();
      }
      return { option, label: LEAVE_LABEL, kind: pending.kind };
    }
    if (
      !pending.messageId ||
      !snapshot.messages.some(
        (message) => message.resident_id === residentId && message.message_id === pending.messageId,
      )
    ) {
      throw optionInvalid();
    }
    return {
      option,
      label: `撤回消息 ${pending.messageId}`,
      kind: pending.kind,
      messageId: pending.messageId,
    };
  }
}

export default LoungeChatTool;
