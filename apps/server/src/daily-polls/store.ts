import type Database from "better-sqlite3";

export type PollActor =
  | { humanAccountId: string; residentId?: never }
  | { residentId: string; humanAccountId?: never };

interface PollChoice {
  title: string;
  summary: string;
}

export interface DailyPollDefinition {
  issueDate: string;
  title: string;
  option: string;
  closesAt: number;
  choices: readonly PollChoice[];
}

export type DailyPollView = {
  title: string;
  closesAt: number;
  choices: (PollChoice & { number: number; votes?: number })[];
  ownChoices: number[];
} & ({ status: "open"; option: string } | { status: "closed"; option?: never });

interface PollRow {
  title: string;
  short_option: string;
  closes_at: number;
}

export class DailyPollError extends Error {
  constructor(readonly code: "missing" | "closed" | "invalid_choice") {
    super(code);
    this.name = "DailyPollError";
  }
}

export class DailyPollStore {
  constructor(private readonly database: Database.Database) {}

  schedule(input: DailyPollDefinition): void {
    if (!input.title.trim() || !/^[A-Z0-9]{6}$/.test(input.option) ||
      !Number.isSafeInteger(input.closesAt) || input.closesAt <= 0 || input.choices.length < 2 ||
      input.choices.some(choice => !choice.title.trim() || !choice.summary.trim())) {
      throw new Error("Invalid daily poll definition");
    }
    this.database.transaction(() => {
      this.database.prepare(`INSERT INTO lingye_daily_polls (issue_date,title,short_option,closes_at)
        VALUES (?,?,?,?)`).run(input.issueDate, input.title.trim(), input.option, input.closesAt);
      const insert = this.database.prepare(`INSERT INTO lingye_daily_poll_choices (issue_date,number,title,summary)
        VALUES (?,?,?,?)`);
      input.choices.forEach((choice, index) => {
        insert.run(input.issueDate, index + 1, choice.title.trim(), choice.summary.trim());
      });
    }).immediate();
  }

  read(issueDate: string, actor: PollActor, now: number): DailyPollView | undefined {
    const poll = this.published(issueDate, now);
    if (!poll) return undefined;
    const choices = this.database.prepare(`SELECT number,title,summary FROM lingye_daily_poll_choices
      WHERE issue_date=? ORDER BY number`).all(issueDate) as DailyPollView["choices"];
    const ballot = this.database.prepare(`SELECT first_choice,second_choice,third_choice FROM lingye_daily_poll_ballots
      WHERE issue_date=? AND (human_account_id=? OR resident_id=?)`)
      .get(issueDate, actor.humanAccountId ?? null, actor.residentId ?? null) as
      { first_choice: number; second_choice: number | null; third_choice: number | null } | undefined;
    const ownChoices = ballot ? [ballot.first_choice, ballot.second_choice, ballot.third_choice]
      .filter((number): number is number => number !== null) : [];
    if (now < poll.closes_at) {
      return { title: poll.title, closesAt: poll.closes_at, option: poll.short_option, status: "open", choices, ownChoices };
    }
    const counts = this.database.prepare(`SELECT number,COUNT(*) AS votes FROM (
      SELECT first_choice AS number FROM lingye_daily_poll_ballots WHERE issue_date=?
      UNION ALL SELECT second_choice FROM lingye_daily_poll_ballots WHERE issue_date=?
      UNION ALL SELECT third_choice FROM lingye_daily_poll_ballots WHERE issue_date=?
    ) WHERE number IS NOT NULL GROUP BY number`).all(issueDate, issueDate, issueDate) as { number: number; votes: number }[];
    const votes = new Map(counts.map(row => [row.number, row.votes]));
    return { title: poll.title, closesAt: poll.closes_at, status: "closed", ownChoices,
      choices: choices.map(choice => ({ ...choice, votes: votes.get(choice.number) ?? 0 })) };
  }

  resolveOption(option: string, now: number): { issueDate: string; choiceCount: number } | undefined {
    return this.database.prepare(`SELECT p.issue_date AS issueDate,
      (SELECT COUNT(*) FROM lingye_daily_poll_choices c WHERE c.issue_date=p.issue_date) AS choiceCount
      FROM lingye_daily_polls p JOIN lingye_daily_issues i ON i.issue_date=p.issue_date
      WHERE p.short_option=? AND i.published_at<=?`).get(option, now) as
      { issueDate: string; choiceCount: number } | undefined;
  }

  vote(issueDate: string, actor: PollActor, numbers: readonly number[], now: number): number[] {
    return this.database.transaction(() => {
      const poll = this.published(issueDate, now);
      if (!poll) throw new DailyPollError("missing");
      if (now >= poll.closes_at) throw new DailyPollError("closed");
      const unique = new Set(numbers);
      if (numbers.length < 1 || numbers.length > 3 || unique.size !== numbers.length ||
        numbers.some(number => !Number.isSafeInteger(number) || number < 1)) {
        throw new DailyPollError("invalid_choice");
      }
      const chosen = [...numbers].sort((a, b) => a - b);
      const [first, second = null, third = null] = chosen;
      const { count } = this.database.prepare(`SELECT COUNT(*) AS count FROM lingye_daily_poll_choices
        WHERE issue_date=? AND number IN (?,?,?)`).get(issueDate, first, second, third) as { count: number };
      if (count !== chosen.length) throw new DailyPollError("invalid_choice");
      this.database.prepare(`INSERT INTO lingye_daily_poll_ballots
        (issue_date,human_account_id,resident_id,first_choice,second_choice,third_choice) VALUES (?,?,?,?,?,?)
        ON CONFLICT(issue_date,human_account_id) DO UPDATE SET first_choice=excluded.first_choice,
          second_choice=excluded.second_choice,third_choice=excluded.third_choice
        ON CONFLICT(issue_date,resident_id) DO UPDATE SET first_choice=excluded.first_choice,
          second_choice=excluded.second_choice,third_choice=excluded.third_choice`)
        .run(issueDate, actor.humanAccountId ?? null, actor.residentId ?? null, first, second, third);
      return chosen;
    }).immediate();
  }

  private published(issueDate: string, now: number): PollRow | undefined {
    return this.database.prepare(`SELECT p.title,p.short_option,p.closes_at FROM lingye_daily_polls p
      JOIN lingye_daily_issues i ON i.issue_date=p.issue_date
      WHERE p.issue_date=? AND i.published_at<=?`).get(issueDate, now) as PollRow | undefined;
  }
}
