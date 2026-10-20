import type Database from "better-sqlite3";

/** Same mailbox content/read facts and same connection; no notification copy. */
export function takeResidentMailboxNotifications(
  database: Database.Database,
  homeId: string,
  now: number,
  excludedLetterIds: readonly string[] = [],
): string[] {
  const excluded = new Set(excludedLetterIds);
  const transaction = database.transaction(() => {
    const unread = (
      database
        .prepare(
          `SELECT l.letter_id, l.body
           FROM mailbox_letters AS l
           LEFT JOIN mailbox_read_states AS r
             ON r.letter_id = l.letter_id AND r.audience = 'resident'
           WHERE l.home_id = ? AND r.letter_id IS NULL
           ORDER BY l.created_at ASC, l.letter_id ASC`,
        )
        .all(homeId) as Array<{ letter_id: string; body: string }>
    ).filter((letter) => !excluded.has(letter.letter_id));
    const markRead = database.prepare(
      `INSERT INTO mailbox_read_states (letter_id, audience, read_at)
       VALUES (?, 'resident', ?)
       ON CONFLICT(letter_id, audience) DO NOTHING`,
    );
    for (const letter of unread) markRead.run(letter.letter_id, now);
    return unread.map((letter) => letter.body);
  });
  return transaction.immediate();
}
