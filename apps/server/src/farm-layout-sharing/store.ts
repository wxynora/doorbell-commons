import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { farmDecorationLayoutSchema, farmLayoutShareSchema, type FarmDecorationLayout } from "@doorbell/protocol";

export class FarmLayoutShareStore {
  constructor(private readonly database: Database.Database) {}

  create(accountId: string, layout: FarmDecorationLayout) {
    const json = JSON.stringify(farmDecorationLayoutSchema.parse(layout));
    const existing = this.database.prepare("SELECT code FROM farm_layout_shares WHERE account_id = ? AND layout_json = ?")
      .get(accountId, json) as { code: string } | undefined;
    if (existing) return farmLayoutShareSchema.parse({ code: existing.code, layout: JSON.parse(json), version: 1 });
    for (;;) {
      const code = `LY-${randomBytes(4).toString("hex").toUpperCase()}`;
      const inserted = this.database.prepare("INSERT INTO farm_layout_shares (code, account_id, layout_json, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(code) DO NOTHING")
        .run(code, accountId, json, Date.now());
      if (inserted.changes) return farmLayoutShareSchema.parse({ code, layout: JSON.parse(json), version: 1 });
    }
  }

  read(code: string) {
    const row = this.database.prepare("SELECT layout_json FROM farm_layout_shares WHERE code = ?")
      .get(code) as { layout_json: string } | undefined;
    return row ? farmLayoutShareSchema.parse({ code, layout: JSON.parse(row.layout_json), version: 1 }) : undefined;
  }
}
