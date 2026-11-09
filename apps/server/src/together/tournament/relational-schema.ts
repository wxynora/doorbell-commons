/*
 * Snow tournament domain tables. The existing editions and match-runtime
 * tables remain the foreign-key identities; their state documents are removed
 * only after the existing rows have been migrated in the same transaction.
 */
export const SNOW_TOURNAMENT_RELATIONAL_SCHEMA = `
  CREATE TABLE snow_tournament_edition_details (
    edition_id TEXT PRIMARY KEY REFERENCES snow_tournament_editions(edition_id) ON DELETE CASCADE,
    title TEXT, rules_version TEXT, phase TEXT, registration_close_at TEXT,
    team_formation_close_at TEXT, revision INTEGER, battle_started INTEGER,
    deadline_confirmation_at INTEGER, semifinal_at TEXT, final_at TEXT,
    final_match_id TEXT, champion_team_id TEXT, field_presence TEXT NOT NULL
  );
  CREATE TABLE snow_tournament_calendar_rounds (
    edition_id TEXT NOT NULL REFERENCES snow_tournament_editions(edition_id) ON DELETE CASCADE,
    position INTEGER NOT NULL, round_at TEXT NOT NULL, PRIMARY KEY(edition_id,position)
  );
  CREATE TABLE snow_tournament_enrollments (
    edition_id TEXT NOT NULL REFERENCES snow_tournament_editions(edition_id) ON DELETE CASCADE,
    position INTEGER NOT NULL, resident_id TEXT NOT NULL, name TEXT, registered_at TEXT,
    field_presence TEXT NOT NULL, PRIMARY KEY(edition_id,position)
  );
  CREATE TABLE snow_tournament_teams (
    edition_id TEXT NOT NULL REFERENCES snow_tournament_editions(edition_id) ON DELETE CASCADE,
    position INTEGER NOT NULL, team_id TEXT NOT NULL, name TEXT, captain_id TEXT,
    status TEXT, draw_order INTEGER, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,team_id)
  );
  CREATE TABLE snow_tournament_team_members (
    edition_id TEXT NOT NULL, team_id TEXT NOT NULL, position INTEGER NOT NULL,
    resident_id TEXT NOT NULL, name TEXT, npc INTEGER, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,team_id,position),
    FOREIGN KEY(edition_id,team_id) REFERENCES snow_tournament_teams(edition_id,team_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_team_ineligible_members (
    edition_id TEXT NOT NULL, team_id TEXT NOT NULL, position INTEGER NOT NULL,
    resident_id TEXT NOT NULL, PRIMARY KEY(edition_id,team_id,position),
    FOREIGN KEY(edition_id,team_id) REFERENCES snow_tournament_teams(edition_id,team_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_team_offers (
    edition_id TEXT NOT NULL REFERENCES snow_tournament_editions(edition_id) ON DELETE CASCADE,
    position INTEGER NOT NULL, offer_id TEXT NOT NULL, team_id TEXT, resident_id TEXT,
    kind TEXT, from_captain_id TEXT, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,position)
  );
  CREATE TABLE snow_tournament_registration_rounds (
    edition_id TEXT NOT NULL REFERENCES snow_tournament_editions(edition_id) ON DELETE CASCADE,
    position INTEGER NOT NULL, round_id TEXT NOT NULL, team_id TEXT, status TEXT,
    deadline_confirmed_at INTEGER, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,round_id)
  );
  CREATE TABLE snow_tournament_registration_members (
    edition_id TEXT NOT NULL, round_id TEXT NOT NULL, kind TEXT NOT NULL,
    position INTEGER NOT NULL, resident_id TEXT NOT NULL,
    PRIMARY KEY(edition_id,round_id,kind,position),
    FOREIGN KEY(edition_id,round_id) REFERENCES snow_tournament_registration_rounds(edition_id,round_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_payments (
    edition_id TEXT NOT NULL, round_id TEXT NOT NULL, position INTEGER NOT NULL,
    payment_id TEXT NOT NULL, resident_id TEXT, charge TEXT, refund TEXT,
    attempt_revision INTEGER, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,round_id,position),
    FOREIGN KEY(edition_id,round_id) REFERENCES snow_tournament_registration_rounds(edition_id,round_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_match_records (
    edition_id TEXT NOT NULL REFERENCES snow_tournament_editions(edition_id) ON DELETE CASCADE,
    position INTEGER NOT NULL, match_id TEXT NOT NULL, stage TEXT, round_number INTEGER,
    team_a_id TEXT, team_b_id TEXT, attacker_team_id TEXT, defender_team_id TEXT,
    status TEXT, scheduled_at TEXT, original_scheduled_at TEXT, winner_team_id TEXT,
    score_a INTEGER, score_b INTEGER, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id)
  );
  CREATE TABLE snow_tournament_match_game_results (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, position INTEGER NOT NULL,
    battle_id TEXT, attacker_team_id TEXT, defender_team_id TEXT, winner_team_id TEXT,
    core_damage REAL, break_time_remaining INTEGER, end_tick INTEGER, end_reason TEXT,
    finished_at INTEGER, attack_resident_id TEXT, attack_human INTEGER,
    defend_resident_id TEXT, defend_human INTEGER, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,position),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_records(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_match_planned_attackers (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, position INTEGER NOT NULL,
    team_id TEXT NOT NULL, PRIMARY KEY(edition_id,match_id,position),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_records(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_match_replays (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, position INTEGER NOT NULL,
    game_index INTEGER, voided_battle_id TEXT, replay_battle_id TEXT, random_seed INTEGER,
    reason TEXT, at TEXT, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,position),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_records(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_standings (
    edition_id TEXT NOT NULL REFERENCES snow_tournament_editions(edition_id) ON DELETE CASCADE,
    position INTEGER NOT NULL, team_id TEXT, rank INTEGER, points INTEGER, wins INTEGER,
    losses INTEGER, game_difference INTEGER, average_core_damage REAL,
    average_break_time_remaining REAL, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,position)
  );
  CREATE TABLE snow_tournament_semifinals (
    edition_id TEXT NOT NULL REFERENCES snow_tournament_editions(edition_id) ON DELETE CASCADE,
    position INTEGER NOT NULL, match_id TEXT NOT NULL, PRIMARY KEY(edition_id,position)
  );
  CREATE TABLE snow_tournament_battle_state (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, battle_id TEXT, round_id TEXT,
    rules_version TEXT, attack_side_id TEXT, defend_side_id TEXT, status TEXT, end_reason TEXT,
    tick INTEGER, core_hp REAL, attack_cost INTEGER, defend_cost INTEGER, cost_accum INTEGER,
    random_state INTEGER, defender_decay_ticks INTEGER, tank_target_weight REAL,
    next_unit_id INTEGER, next_effect_id INTEGER, started INTEGER, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_units (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, unit_id TEXT NOT NULL, side TEXT,
    type_key TEXT, lane INTEGER, position REAL, ground INTEGER, hp REAL, max_hp REAL,
    armor REAL, spell_resist REAL, attack_interval REAL, attack REAL, damage_type TEXT,
    heal REAL, heal_radius REAL, range REAL, splash REAL, block_capacity INTEGER,
    attack_timer REAL, alive INTEGER, move_progress REAL, move_seconds REAL,
    breakthrough REAL, stealth INTEGER, sprint_until_tick INTEGER, sprint_mult REAL,
    unit_skill_ready_tick INTEGER, blocked_by TEXT, decay_start_tick INTEGER,
    fire_focus_until_tick INTEGER, silenced_until_tick INTEGER, system_wave INTEGER,
    shield_amount REAL, shield_until_tick INTEGER, skill_kind TEXT, skill_name TEXT,
    skill_speed_mult REAL, skill_duration_ticks INTEGER, skill_cooldown_ticks INTEGER,
    skill_silence_ticks INTEGER, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,unit_id),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_unit_blocking (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, unit_id TEXT NOT NULL,
    position INTEGER NOT NULL, blocked_unit_id TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,unit_id,position),
    FOREIGN KEY(edition_id,match_id,unit_id) REFERENCES snow_tournament_battle_units(edition_id,match_id,unit_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_effects (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, position INTEGER NOT NULL,
    effect_id INTEGER, kind TEXT, side TEXT, lane INTEGER, value REAL, until_tick INTEGER,
    field_presence TEXT NOT NULL, PRIMARY KEY(edition_id,match_id,position),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_cooldowns (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, cooldown_key TEXT NOT NULL, ready_tick INTEGER NOT NULL,
    PRIMARY KEY(edition_id,match_id,cooldown_key),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_participants (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, side TEXT NOT NULL,
    position INTEGER NOT NULL, resident_id TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,side,position),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_assignments (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, side TEXT NOT NULL, resident_id TEXT NOT NULL,
    position INTEGER NOT NULL, skill TEXT NOT NULL, PRIMARY KEY(edition_id,match_id,side,resident_id,position),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_receipts (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, receipt_id TEXT NOT NULL,
    request_id TEXT, ok INTEGER, error TEXT, message TEXT, member TEXT, skill TEXT, lane INTEGER,
    until_tick INTEGER, healed REAL, unit_id TEXT, blocker_id TEXT, cost REAL,
    remaining_cost REAL, refund REAL, silenced_until_tick INTEGER,
    effect_speed_mult REAL, effect_interval_mult REAL, effect_armor_mult REAL,
    field_presence TEXT NOT NULL, PRIMARY KEY(edition_id,match_id,receipt_id),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_receipt_targets (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, receipt_id TEXT NOT NULL,
    kind TEXT NOT NULL, position INTEGER NOT NULL, unit_id TEXT, amount REAL, until_tick INTEGER,
    field_presence TEXT NOT NULL, PRIMARY KEY(edition_id,match_id,receipt_id,kind,position),
    FOREIGN KEY(edition_id,match_id,receipt_id) REFERENCES snow_tournament_battle_receipts(edition_id,match_id,receipt_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_receipt_history (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, position INTEGER NOT NULL, receipt_id TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,position),
    FOREIGN KEY(edition_id,match_id,receipt_id) REFERENCES snow_tournament_battle_receipts(edition_id,match_id,receipt_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_receipt_index (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, request_id TEXT NOT NULL, receipt_id TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,request_id),
    FOREIGN KEY(edition_id,match_id,receipt_id) REFERENCES snow_tournament_battle_receipts(edition_id,match_id,receipt_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_runtime_details (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, owner TEXT, last_seen_at INTEGER,
    match_at INTEGER, choice_team_id TEXT, suspended_until INTEGER, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_runtime_teams (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, position INTEGER NOT NULL, team_id TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,position),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_runtime_attackers (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, position INTEGER NOT NULL, team_id TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,position),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_lineups (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, team_slot TEXT NOT NULL, confirmed INTEGER,
    revision INTEGER, field_presence TEXT NOT NULL, PRIMARY KEY(edition_id,match_id,team_slot),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_lineup_entries (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, team_slot TEXT NOT NULL,
    position INTEGER NOT NULL, resident_id TEXT, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,team_slot,position),
    FOREIGN KEY(edition_id,match_id,team_slot) REFERENCES snow_tournament_lineups(edition_id,match_id,team_slot) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_lineup_skills (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, team_slot TEXT NOT NULL,
    entry_position INTEGER NOT NULL, position INTEGER NOT NULL, skill TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,team_slot,entry_position,position),
    FOREIGN KEY(edition_id,match_id,team_slot,entry_position)
      REFERENCES snow_tournament_lineup_entries(edition_id,match_id,team_slot,position) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_team_chats (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, team_slot TEXT NOT NULL,
    turn INTEGER, until_at INTEGER, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,team_slot),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_chat_order (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, team_slot TEXT NOT NULL,
    position INTEGER NOT NULL, resident_id TEXT NOT NULL, PRIMARY KEY(edition_id,match_id,team_slot,position),
    FOREIGN KEY(edition_id,match_id,team_slot) REFERENCES snow_tournament_team_chats(edition_id,match_id,team_slot) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_chat_messages (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, team_slot TEXT NOT NULL,
    position INTEGER NOT NULL, resident_id TEXT, text TEXT, at INTEGER, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,team_slot,position),
    FOREIGN KEY(edition_id,match_id,team_slot) REFERENCES snow_tournament_team_chats(edition_id,match_id,team_slot) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_chat_receipts (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, team_slot TEXT NOT NULL,
    receipt_key TEXT NOT NULL, text TEXT, text_is_null INTEGER NOT NULL,
    PRIMARY KEY(edition_id,match_id,team_slot,receipt_key),
    FOREIGN KEY(edition_id,match_id,team_slot) REFERENCES snow_tournament_team_chats(edition_id,match_id,team_slot) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_chat_read_positions (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, team_slot TEXT NOT NULL,
    resident_id TEXT NOT NULL, read_through INTEGER NOT NULL,
    PRIMARY KEY(edition_id,match_id,team_slot,resident_id),
    FOREIGN KEY(edition_id,match_id,team_slot) REFERENCES snow_tournament_team_chats(edition_id,match_id,team_slot) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_runtime_rounds (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, position INTEGER NOT NULL, is_null INTEGER NOT NULL,
    battle_id TEXT, rules_version TEXT, attack_side_id TEXT, defend_side_id TEXT, status TEXT,
    end_reason TEXT, tick INTEGER, core_hp REAL, surrendered_by TEXT, finished_at INTEGER,
    attack_resident_id TEXT, attack_human INTEGER, defend_resident_id TEXT, defend_human INTEGER,
    field_presence TEXT NOT NULL, PRIMARY KEY(edition_id,match_id,position),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_active_rounds (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, game_index INTEGER,
    attack_resident_id TEXT, defend_resident_id TEXT, prepare_until INTEGER,
    next_tick_at INTEGER, last_ready_at INTEGER, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_active_participants (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, kind TEXT NOT NULL,
    position INTEGER NOT NULL, resident_id TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,kind,position),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_active_side_state (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, side TEXT NOT NULL, wait_at INTEGER,
    wait_id TEXT, commanded INTEGER, command_revision INTEGER, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,side),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_waves (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, next_wave INTEGER, unit_count INTEGER,
    hp REAL, blocked_attack REAL, blocked_attack_interval REAL, move_seconds REAL, breakthrough REAL,
    field_presence TEXT NOT NULL, PRIMARY KEY(edition_id,match_id),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_wave_ticks (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, position INTEGER NOT NULL, tick INTEGER NOT NULL,
    PRIMARY KEY(edition_id,match_id,position),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_wave_releases (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, position INTEGER NOT NULL,
    tick INTEGER, lane INTEGER, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,position),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_wave_units (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, release_position INTEGER NOT NULL,
    position INTEGER NOT NULL, unit_id TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,release_position,position),
    FOREIGN KEY(edition_id,match_id,release_position)
      REFERENCES snow_tournament_battle_wave_releases(edition_id,match_id,position) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_visual_frames (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, tick INTEGER,
    PRIMARY KEY(edition_id,match_id),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_visual_events (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, position INTEGER NOT NULL,
    event_id TEXT, tick INTEGER, kind TEXT, source_id TEXT, source_type TEXT,
    source_role TEXT, source_lane INTEGER, source_position REAL, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,position),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_visual_targets (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, event_position INTEGER NOT NULL, position INTEGER NOT NULL,
    unit_id TEXT, unit_type TEXT, role TEXT, lane INTEGER, unit_position REAL, field_presence TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,event_position,position),
    FOREIGN KEY(edition_id,match_id,event_position) REFERENCES snow_tournament_visual_events(edition_id,match_id,position) ON DELETE CASCADE
  );
`;
