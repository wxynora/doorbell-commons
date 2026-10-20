import type Database from "better-sqlite3";

export interface HumanBulletinNotice { id: string; title: string; text: string; at: string; }

// Publication is itself the durable event. Revisions/retries cannot create a
// second notice for an issue; no publisher timer or AI/Bell delivery is involved.
export class HumanBulletinStore {
  constructor(private readonly database: Database.Database) {}

  unread(accountId: string, now = Date.now(), homeId?: string): HumanBulletinNotice[] {
    const rows = this.database.prepare(`
      SELECT notice.id, notice.title, notice.body, notice.published_at FROM (
        SELECT 'daily:' || issue_date AS id,
          CASE WHEN issue_number = 1 THEN '铃野日报第一期出版了' ELSE '铃野日报第 ' || issue_number || ' 期出版了' END AS title,
          '在铃野地图右上角，点击纪念册下方的「铃野日报」即可阅读。' AS body,
          published_at FROM lingye_daily_issues WHERE published_at <= ?
        UNION ALL
        SELECT 'announcement:' || announcement_id, title, body, published_at
          FROM human_bulletin_announcements WHERE published_at <= ?
        UNION ALL
        SELECT 'constable-interview:' || letter.letter_id, letter.title, letter.body, letter.created_at
          FROM mailbox_letters letter
          JOIN homes home ON home.home_id = letter.home_id
          JOIN residents owner ON owner.resident_id = home.resident_id
          LEFT JOIN mailbox_read_states read ON read.letter_id = letter.letter_id AND read.audience = 'human'
          WHERE letter.home_id = ? AND owner.account_id = ? AND letter.category = 'lingye'
            AND letter.idempotency_key GLOB 'lingye:constable-interview:*'
            AND letter.created_at <= ? AND read.read_at IS NULL
      ) notice LEFT JOIN human_bulletin_reads seen
        ON seen.account_id = ? AND seen.notice_id = notice.id
      WHERE seen.notice_id IS NULL ORDER BY notice.published_at DESC, notice.id
    `).all(now, now, homeId ?? null, accountId, now, accountId) as {id:string;title:string;body:string;published_at:number}[];
    return rows.map(row => ({ id:row.id, title:row.title, text:row.body, at:new Date(row.published_at).toISOString() }));
  }

  acknowledge(accountId: string, ids: readonly string[], now = Date.now(), homeId?: string): void {
    this.database.transaction(() => {
      const visible = new Set(this.unread(accountId, now, homeId).map(notice => notice.id));
      const insert = this.database.prepare(`INSERT INTO human_bulletin_reads(account_id,notice_id,read_at)
        VALUES(?,?,?) ON CONFLICT(account_id,notice_id) DO NOTHING`);
      const readLetter = this.database.prepare(`INSERT INTO mailbox_read_states(letter_id,audience,read_at)
        VALUES(?,'human',?) ON CONFLICT(letter_id,audience) DO NOTHING`);
      for(const id of new Set(ids)) if(visible.has(id)) {
        if(id.startsWith('constable-interview:')) readLetter.run(id.slice('constable-interview:'.length),now);
        else insert.run(accountId,id,now);
      }
    })();
  }

  announce(id: string, title: string, text: string, now = Date.now()): void {
    this.database.prepare(`INSERT INTO human_bulletin_announcements(announcement_id,title,body,published_at)
      VALUES(?,?,?,?) ON CONFLICT(announcement_id) DO NOTHING`).run(id,title,text,now);
  }
}
