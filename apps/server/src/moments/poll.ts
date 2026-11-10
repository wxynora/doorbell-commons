import { z } from "zod";
import type { HomeMomentRecords, HomeRecord } from "./home-records.js";
import { MomentsError } from "./types.js";

export const pollInputSchema = z.object({
  options: z.array(z.string()),
  max: z.number().int().safe(),
  at: z.iso.datetime({ offset: true }),
}).strict();
export type PollInput = z.infer<typeof pollInputSchema>;
export const pollChoicesSchema = z.array(z.number().int().positive().safe()).min(1);

export type PollView = {
  at: number;
  max: number;
  closed: boolean;
  options: { number: number; text: string; votes?: number }[];
  choices: number[];
};

export type PollPost = {
  home_id: string;
  moment_id: string;
  poll_ends_at: number | null;
  poll_max_choices: number | null;
};
type PollDefinition = { at: number; max: number; options: string[] };
type PollOption = { position: number; text: string };
type BallotChoice = HomeRecord & { position: number };

export function pollDefinition(input: PollInput, question: string): PollDefinition {
  const options = input.options.map(option => option.trim());
  const at = Date.parse(input.at);
  if (!question.trim() || options.length < 2 || options.some(option => !option) ||
      new Set(options).size !== options.length || input.max < 1 || input.max > options.length ||
      !Number.isSafeInteger(at)) throw new MomentsError("invalid_poll");
  return { options, at, max: input.max };
}

export class MomentsPolls {
  constructor(private readonly records: HomeMomentRecords) {}

  private options(post: PollPost): PollOption[] {
    return this.records.all<PollOption>("poll_option", "moment_id=?", [post.moment_id], post.home_id)
      .sort((left, right) => left.position - right.position);
  }

  matches(post: PollPost, definition: PollDefinition | undefined): boolean {
    if (!definition) return post.poll_ends_at === null;
    if (post.poll_ends_at !== definition.at || post.poll_max_choices !== definition.max) return false;
    const options = this.options(post);
    return options.length === definition.options.length &&
      options.every((option, index) => option.text === definition.options[index]);
  }

  addOptions(homeId: string, postId: string, definition: PollDefinition): void {
    for (const [index, text] of definition.options.entries()) {
      this.records.insert(homeId, "poll_option", { moment_id: postId, position: index + 1, text });
    }
  }

  private ballot(post: PollPost, actorKey: string): BallotChoice[] {
    return this.records.all<BallotChoice>("poll_vote", "moment_id=? AND actor_key=?",
      [post.moment_id, actorKey], post.home_id).sort((left, right) => left.position - right.position);
  }

  view(post: PollPost, actorKey: string, now: number): PollView | undefined {
    const { poll_ends_at: at, poll_max_choices: max } = post;
    if (at === null || max === null) return undefined;
    const closed = now >= at;
    const totals = closed ? this.records.countByPosition("poll_vote", post.moment_id, post.home_id) : undefined;
    return { at, max, closed,
      options: this.options(post).map(option => ({ number: option.position, text: option.text,
        ...(totals ? { votes: totals.get(option.position) ?? 0 } : {}) })),
      choices: this.ballot(post, actorKey).map(choice => choice.position),
    };
  }

  vote(post: PollPost, actorKey: string, choices: unknown, now: number): void {
    const { poll_ends_at: at, poll_max_choices: max } = post;
    if (at === null || max === null) throw new MomentsError("poll_not_found");
    if (now >= at) throw new MomentsError("poll_closed");
    const parsed = pollChoicesSchema.safeParse(choices);
    const numbers = new Set(this.options(post).map(option => option.position));
    if (!parsed.success || parsed.data.length > max || new Set(parsed.data).size !== parsed.data.length ||
        parsed.data.some(choice => !numbers.has(choice))) throw new MomentsError("invalid_vote");
    const ordered = parsed.data.sort((a, b) => a - b);
    const previous = this.ballot(post, actorKey);
    if (previous.length === ordered.length && previous.every((row, index) => row.position === ordered[index])) return;
    for (const choice of previous) this.records.delete(post.home_id, choice.record_id);
    for (const position of ordered) {
      this.records.insert(post.home_id, "poll_vote", { moment_id: post.moment_id, actor_key: actorKey, position });
    }
  }
}
