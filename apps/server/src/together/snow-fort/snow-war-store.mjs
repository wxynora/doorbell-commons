// 雪堡战持久化存档域（候选）。
// 实现审阅稿第十四节首版"持久化局／场结果、重启恢复"与第十二节 12.2 的恢复候选：
// 每个战斗 tick 落一份完整状态快照（单条 UPSERT，原子提交），重启后从最后完整持久 tick 继续，
// 不重演命令、不后台补演无人在场的战斗时间。开局与终局使用联合事务（saveSeriesAndBattle），
// 保证"已开局必有战场、终局必带比分"同生同灭；未持久结算的战斗快照不可清理。
// 驱动与农场正式线一致：node:sqlite DatabaseSync，无外部依赖。存档域独立建表，不复用农场其他表。

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SNOW_WAR_SCHEMA_SQL } from "../../database/community-migrations.ts";
import {
  readSnowProcessIdentity,
  sameSnowProcessIdentity,
  validSnowProcessIdentity,
} from "./snow-war-process-identity.mjs";

const SCHEMA_VERSION = 1;

export function openSnowWarStore(connection) {
  const ownsConnection = typeof connection === "string";
  const dbPath = ownsConnection ? connection : undefined;
  if (ownsConnection && dbPath.length === 0) {
    throw new Error("雪堡战存档必须给出数据库路径");
  }
  if (ownsConnection && dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = ownsConnection ? new DatabaseSync(dbPath) : connection;
  // 先验版本再建表：库比代码新时必须原样拒绝，不能先写当前版本的表留下半套 schema。
  const metaTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'snow_war_meta'")
    .get();
  if (metaTable) {
    const versionRow = db
      .prepare("SELECT value FROM snow_war_meta WHERE key = 'schema_version'")
      .get();
    if (versionRow) {
      const existing = Number(versionRow.value);
      if (!Number.isInteger(existing) || existing > SCHEMA_VERSION) {
        if (ownsConnection) db.close();
        throw new Error(
          `雪堡战存档 schema 版本过新（${versionRow.value}），当前代码只认 ≤ ${SCHEMA_VERSION}`,
        );
      }
    }
  }
  if (ownsConnection) db.exec(SNOW_WAR_SCHEMA_SQL);
  // 版本门槛落地：缺失则写入当前版本；代码比库新则升级版本号（schema 均为幂等 CREATE IF NOT EXISTS）。
  const versionRow = db
    .prepare("SELECT value FROM snow_war_meta WHERE key = 'schema_version'")
    .get();
  if (!versionRow) {
    db.prepare("INSERT INTO snow_war_meta (key, value) VALUES ('schema_version', ?)").run(
      String(SCHEMA_VERSION),
    );
  } else if (Number(versionRow.value) < SCHEMA_VERSION) {
    db.prepare("UPDATE snow_war_meta SET value = ? WHERE key = 'schema_version'").run(
      String(SCHEMA_VERSION),
    );
  }

  const now = () => new Date().toISOString();
  const upsertSeries = db.prepare(
    "INSERT INTO snow_war_series (series_id, tick, status, state_json, updated_at) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(series_id) DO UPDATE SET tick = excluded.tick, status = excluded.status, state_json = excluded.state_json, updated_at = excluded.updated_at",
  );
  const upsertBattle = db.prepare(
    "INSERT INTO snow_war_battle (battle_id, round_id, tick, status, state_json, updated_at) VALUES (?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(battle_id) DO UPDATE SET round_id = excluded.round_id, tick = excluded.tick, status = excluded.status, state_json = excluded.state_json, updated_at = excluded.updated_at",
  );

  const requireSeriesId = (state) => {
    if (!state?.seriesId) throw new Error("系列赛状态缺少 seriesId");
    return String(state.seriesId);
  };
  const requireBattleKeys = (state) => {
    if (!state?.battleId) throw new Error("战斗状态缺少 battleId");
    if (!Number.isInteger(state.tick)) throw new Error("战斗状态缺少 tick");
    return {
      battleId: String(state.battleId),
      roundId: String(state.roundId ?? ""),
      tick: state.tick,
    };
  };
  // 联合事务：两写同生同灭；任一失败全部回滚，不留半套持久状态。
  let transactionSequence = 0;
  const transactional = (fn) => {
    const nested = db.isTransaction ?? db.inTransaction;
    const savepoint = `snow_war_${++transactionSequence}`;
    db.exec(nested ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
    try {
      const out = fn();
      db.exec(nested ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
      return out;
    } catch (err) {
      try {
        if (nested) {
          db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          db.exec(`RELEASE SAVEPOINT ${savepoint}`);
        } else if (db.isTransaction ?? db.inTransaction) db.exec("ROLLBACK");
      } catch {
        // 回滚失败不再遮掩原始错误
      }
      throw err;
    }
  };

  return {
    transaction: transactional,
    // Candidate Together metadata shares this connection and its transactions.
    readActivity() {
      const row = db
        .prepare("SELECT value FROM snow_war_meta WHERE key = 'together_activity'")
        .get();
      if (!row) return undefined;
      const state = JSON.parse(row.value);
      for (const key of [
        "registrations",
        "registrationPayments",
        "drafts",
        "serials",
        "options",
        "receipts",
      ])
        state[key] = Object.assign(Object.create(null), state[key]);
      for (const draft of Object.values(state.drafts))
        draft.skills = Object.assign(Object.create(null), draft.skills);
      return state;
    },
    saveActivity(value) {
      db.prepare(
        "INSERT INTO snow_war_meta(key,value) VALUES ('together_activity',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run(JSON.stringify(value));
    },
    claimRuntime(owner) {
      return transactional(() => {
        const row = db.prepare("SELECT value FROM snow_war_meta WHERE key = 'runtime_owner'").get();
        if (row) {
          const prior = JSON.parse(row.value);
          if (!Number.isSafeInteger(prior.pid) || prior.pid <= 0)
            throw new Error("runtime_owner_invalid");
          const currentIdentity = readSnowProcessIdentity(prior.pid);
          if (currentIdentity) {
            // Old PID-only records cannot prove whether the live process is
            // their original owner. Do not silently steal an unverifiable lock.
            if (!validSnowProcessIdentity(prior.processIdentity))
              throw new Error("runtime_owner_unverifiable");
            if (sameSnowProcessIdentity(prior.processIdentity, currentIdentity))
              throw new Error("runtime_already_owned");
          }
        }
        db.prepare(
          "INSERT INTO snow_war_meta(key,value) VALUES ('runtime_owner',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        ).run(JSON.stringify(owner));
      });
    },
    releaseRuntime(owner) {
      db.prepare("DELETE FROM snow_war_meta WHERE key='runtime_owner' AND value=?").run(
        JSON.stringify(owner),
      );
    },
    // 系列赛状态整体快照（排阵锁定、逐局报告等不含战斗快照的变更用此入口）。
    saveSeries(state) {
      const seriesId = requireSeriesId(state);
      upsertSeries.run(seriesId, 0, String(state.status ?? ""), JSON.stringify(state), now());
      return { ok: true, seriesId };
    },
    loadSeries(seriesId) {
      const row = db
        .prepare("SELECT state_json FROM snow_war_series WHERE series_id = ?")
        .get(String(seriesId));
      return row ? JSON.parse(row.state_json) : undefined;
    },
    // 战斗逐 tick 快照（战斗推进中途用此入口）。
    saveBattle(state) {
      const keys = requireBattleKeys(state);
      upsertBattle.run(
        keys.battleId,
        keys.roundId,
        keys.tick,
        String(state.status ?? "running"),
        JSON.stringify(state),
        now(),
      );
      return { ok: true, ...keys };
    },
    // 开局／终局联合落库：系列赛状态与战斗快照同一事务提交。
    // 开局：startedRounds 标记与初始战场同生同灭，不会出现"已开局但没有战场"；
    // 终局：先 settleRoundFromBattle 再用本入口，终局快照与比分同生同灭，不会出现"终局没有比分"。
    saveSeriesAndBattle(seriesState, battleState) {
      const seriesId = requireSeriesId(seriesState);
      const keys = requireBattleKeys(battleState);
      return transactional(() => {
        upsertSeries.run(
          seriesId,
          0,
          String(seriesState.status ?? ""),
          JSON.stringify(seriesState),
          now(),
        );
        upsertBattle.run(
          keys.battleId,
          keys.roundId,
          keys.tick,
          String(battleState.status ?? "running"),
          JSON.stringify(battleState),
          now(),
        );
        return { ok: true, ...keys, seriesId };
      });
    },
    loadBattle(battleId) {
      const row = db
        .prepare("SELECT state_json FROM snow_war_battle WHERE battle_id = ?")
        .get(String(battleId));
      return row ? JSON.parse(row.state_json) : undefined;
    },
    // 重启恢复清单：列出全部战斗快照（含终局未结算者）；调用方按 status 与系列赛 reportedRounds
    // 决定恢复进行局还是补结算终局（settleRoundFromBattle）。
    listBattles() {
      return db
        .prepare("SELECT battle_id, round_id, tick, status FROM snow_war_battle ORDER BY battle_id")
        .all()
        .map((r) => ({
          battleId: r.battle_id,
          roundId: r.round_id,
          tick: r.tick,
          status: r.status,
        }));
    },
    // 只有数据库中的系列赛记录已持久记录该局结果后才可清理战斗快照；
    // 核验与删除在同一事务内，且核验的是落库事实——内存里结算过但未保存比分不构成持久结算。
    deleteBattle(battleId, seriesId) {
      const id = String(battleId);
      return transactional(() => {
        const row = db
          .prepare("SELECT state_json FROM snow_war_series WHERE series_id = ?")
          .get(String(seriesId));
        if (!row) throw new Error("系列赛存档不存在，不能清理战斗快照");
        const series = JSON.parse(row.state_json);
        const reported = series?.reportedRounds;
        if (!reported || typeof reported !== "object" || !Object.hasOwn(reported, id)) {
          throw new Error("该局尚未在系列赛存档中持久结算，不能清理战斗快照");
        }
        db.prepare("DELETE FROM snow_war_battle WHERE battle_id = ?").run(id);
        return { ok: true };
      });
    },
    close() {
      if (ownsConnection) db.close();
    },
  };
}
