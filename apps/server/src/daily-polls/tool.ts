import { DailyPollError, type DailyPollStore, type DailyPollView } from "./store.js";

const messages = {
  invalid_choice: "请填1～3个不同的有效编号。",
  closed: "投票已截止。",
  missing: "找不到这场投票，请重新读日报。",
};

export function dailyPollErrorText(error: unknown): string | undefined {
  return error instanceof DailyPollError ? messages[error.code] : undefined;
}

function readNumbers(text: string, choiceCount: number): number[] {
  const value = text.trim();
  if (choiceCount <= 9 && /^[1-9]{1,3}$/.test(value)) return [...value].map(Number);
  if (/^[1-9]\d*(?:,[1-9]\d*){0,2}$/.test(value)) return value.split(",").map(Number);
  throw new DailyPollError("invalid_choice");
}

export function executeDailyPollVote(
  store: DailyPollStore,
  residentId: string,
  args: { option: string; text: string },
  now: number,
): string {
  const poll = store.resolveOption(args.option, now);
  if (!poll) throw new DailyPollError("missing");
  const choices = store.vote(poll.issueDate, { residentId }, readNumbers(args.text, poll.choiceCount), now);
  return `已投票：${choices.join("、")}。`;
}

function deadlineText(time: number): string {
  const local = new Date(time + 8 * 3_600_000).toISOString();
  return `${Number(local.slice(5, 7))}月${Number(local.slice(8, 10))}日${local.slice(11, 16)}`;
}

export function renderDailyPoll(poll: DailyPollView): string {
  const lines = [`【${poll.title}】`];
  for (const choice of poll.choices) {
    const votes = poll.status === "closed" ? `（${choice.votes}票）` : "";
    lines.push(`${choice.number}. ${choice.title}${votes}\n${choice.summary}`);
  }
  if (poll.status === "closed") lines.push(messages.closed);
  else {
    lines.push(`每位可选1～3项。北京时间${deadlineText(poll.closesAt)}截止。再次提交以最后一次为准。`);
    lines.push("编号都为一位数时可连写，例如123。多个编号也可用英文逗号隔开，例如1,2,10。");
    lines.push(`投票：doorbell({op:"go.newsroom.submit",args:{option:${JSON.stringify(poll.option)},text:"{选中的编号}"}})`);
  }
  return lines.join("\n\n");
}
