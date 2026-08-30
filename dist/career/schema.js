export const CAREER_SCHEMA_VERSION = 8;
export function installCareerSchema(database) {
    database.exec(`
    CREATE TABLE IF NOT EXISTS career_tracks (
      resident_id TEXT NOT NULL,
      career TEXT NOT NULL CHECK (career IN ('chef', 'agronomist', 'veterinarian', 'reporter', 'constable')),
      track_order INTEGER NOT NULL CHECK (track_order IN (1, 2)),
      selected_at INTEGER NOT NULL,
      PRIMARY KEY (resident_id, career),
      UNIQUE (resident_id, track_order)
    );

    CREATE TABLE IF NOT EXISTS career_financial_receipts (
      receipt_id TEXT PRIMARY KEY REFERENCES economy_financial_receipts(receipt_id) ON DELETE RESTRICT,
      resident_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN (
        'system_gold_charge',
        'system_gold_reserve',
        'system_gold_settle',
        'system_gold_release',
        'system_gold_credit',
        'player_silver_settle'
      )),
      currency TEXT NOT NULL CHECK (currency IN ('gold', 'silver')),
      amount INTEGER NOT NULL CHECK (amount >= 0),
      business_reference TEXT NOT NULL,
      recorded_at INTEGER NOT NULL,
      UNIQUE (business_reference, kind)
    );

    CREATE TABLE IF NOT EXISTS career_courses (
      resident_id TEXT NOT NULL,
      career TEXT NOT NULL,
      qualification_level INTEGER NOT NULL CHECK (qualification_level BETWEEN 1 AND 4),
      course_index INTEGER NOT NULL CHECK (course_index BETWEEN 1 AND 3),
      tuition_receipt_id TEXT NOT NULL UNIQUE REFERENCES career_financial_receipts(receipt_id),
      enrolled_at INTEGER NOT NULL,
      content_bank_version TEXT,
      content_snapshot_json TEXT,
      content_delivery_id TEXT,
      content_delivered_at INTEGER,
      content_read_at INTEGER,
      completed_at INTEGER,
      best_correct_answers INTEGER NOT NULL DEFAULT 0 CHECK (best_correct_answers BETWEEN 0 AND 5),
      PRIMARY KEY (resident_id, career, qualification_level, course_index),
      FOREIGN KEY (resident_id, career) REFERENCES career_tracks(resident_id, career)
    );

    CREATE TABLE IF NOT EXISTS career_certificates (
      resident_id TEXT NOT NULL,
      career TEXT NOT NULL,
      qualification_level INTEGER NOT NULL CHECK (qualification_level BETWEEN 1 AND 4),
      status TEXT NOT NULL CHECK (status IN ('active', 'pending_public_notice', 'pending_review_configuration', 'review_required')),
      source_attempt_id TEXT NOT NULL UNIQUE,
      issued_at INTEGER NOT NULL,
      effective_at INTEGER,
      PRIMARY KEY (resident_id, career, qualification_level),
      FOREIGN KEY (resident_id, career) REFERENCES career_tracks(resident_id, career)
    );

    CREATE TABLE IF NOT EXISTS career_exam_attempts (
      attempt_id TEXT PRIMARY KEY,
      resident_id TEXT NOT NULL,
      career TEXT NOT NULL,
      qualification_level INTEGER NOT NULL CHECK (qualification_level BETWEEN 1 AND 4),
      scheduled_at INTEGER NOT NULL,
      registration_status TEXT NOT NULL CHECK (registration_status IN (
        'registered', 'active', 'failed', 'written_passed', 'passed', 'released', 'postponed'
      )),
      reservation_receipt_id TEXT NOT NULL UNIQUE REFERENCES career_financial_receipts(receipt_id),
      settlement_receipt_id TEXT UNIQUE REFERENCES career_financial_receipts(receipt_id),
      release_receipt_id TEXT UNIQUE REFERENCES career_financial_receipts(receipt_id),
      correct_answers INTEGER CHECK (correct_answers BETWEEN 0 AND 20),
      registered_at INTEGER NOT NULL,
      started_at INTEGER,
      ended_at INTEGER,
      missed_session_at INTEGER,
      FOREIGN KEY (resident_id, career) REFERENCES career_tracks(resident_id, career)
    );
    CREATE INDEX IF NOT EXISTS career_exam_attempts_resident_index
      ON career_exam_attempts(resident_id, career, qualification_level, registered_at);

    CREATE TABLE IF NOT EXISTS career_assessment_papers (
      paper_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('course_practice', 'written_exam')),
      target_key TEXT NOT NULL UNIQUE,
      resident_id TEXT NOT NULL,
      career TEXT NOT NULL CHECK (career IN ('chef', 'agronomist', 'veterinarian', 'reporter', 'constable')),
      qualification_level INTEGER NOT NULL CHECK (qualification_level BETWEEN 1 AND 4),
      course_index INTEGER CHECK (course_index BETWEEN 1 AND 3),
      exam_attempt_id TEXT UNIQUE REFERENCES career_exam_attempts(attempt_id),
      bank_version TEXT NOT NULL,
      public_paper_json TEXT NOT NULL,
      answer_key_json TEXT NOT NULL,
      paper_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (resident_id, career, qualification_level, course_index)
        REFERENCES career_courses(resident_id, career, qualification_level, course_index),
      CHECK (
        (kind = 'course_practice' AND course_index IS NOT NULL AND exam_attempt_id IS NULL)
        OR
        (kind = 'written_exam' AND course_index IS NULL AND exam_attempt_id IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS career_assessment_submissions (
      submission_id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES career_assessment_papers(paper_id),
      kind TEXT NOT NULL CHECK (kind IN ('course_practice', 'written_exam')),
      resident_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      correct_answers INTEGER NOT NULL CHECK (correct_answers BETWEEN 0 AND 20),
      passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
      result_status TEXT NOT NULL,
      result_json TEXT NOT NULL,
      submitted_at INTEGER NOT NULL,
      UNIQUE (resident_id, idempotency_key)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS career_one_written_submission_per_paper
      ON career_assessment_submissions(paper_id)
      WHERE kind = 'written_exam';

    CREATE TABLE IF NOT EXISTS career_constable_interviews (
      interview_id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL UNIQUE REFERENCES career_exam_attempts(attempt_id),
      candidate_resident_id TEXT NOT NULL,
      scheduled_at INTEGER NOT NULL,
      interview_bank_version TEXT,
      interview_paper_snapshot_json TEXT,
      interview_fact_material_snapshot_json TEXT,
      interview_scoring_standard_snapshot_json TEXT,
      last_postponed_at INTEGER,
      postponed_count INTEGER NOT NULL DEFAULT 0 CHECK (postponed_count >= 0),
      status TEXT NOT NULL CHECK (status IN (
        'signup_open', 'panel_ready', 'postponed', 'scoring', 'failed', 'public_notice',
        'pending_review_configuration', 'review_required', 'certificate_activated'
      )),
      created_at INTEGER NOT NULL,
      finalized_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS career_constable_examiner_signups (
      interview_id TEXT NOT NULL REFERENCES career_constable_interviews(interview_id),
      examiner_account_id TEXT NOT NULL,
      examiner_resident_id TEXT NOT NULL,
      eligibility_reference TEXT NOT NULL,
      signup_order INTEGER NOT NULL,
      signed_up_at INTEGER NOT NULL,
      attendance_confirmed_at INTEGER,
      attendance_eligibility_reference TEXT,
      selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
      PRIMARY KEY (interview_id, examiner_account_id),
      UNIQUE (interview_id, examiner_resident_id),
      UNIQUE (interview_id, signup_order)
    );

    CREATE TABLE IF NOT EXISTS career_constable_scores (
      interview_id TEXT NOT NULL REFERENCES career_constable_interviews(interview_id),
      examiner_account_id TEXT NOT NULL,
      facts_score INTEGER NOT NULL CHECK (facts_score BETWEEN 0 AND 5),
      restraint_score INTEGER NOT NULL CHECK (restraint_score BETWEEN 0 AND 5),
      procedure_score INTEGER NOT NULL CHECK (procedure_score BETWEEN 0 AND 5),
      explanation_score INTEGER NOT NULL CHECK (explanation_score BETWEEN 0 AND 5),
      scored_at INTEGER NOT NULL,
      PRIMARY KEY (interview_id, examiner_account_id)
    );

    CREATE TABLE IF NOT EXISTS career_constable_public_notices (
      notice_id TEXT PRIMARY KEY,
      interview_id TEXT NOT NULL UNIQUE REFERENCES career_constable_interviews(interview_id),
      candidate_resident_id TEXT NOT NULL,
      candidate_resident_name TEXT NOT NULL,
      opened_at INTEGER NOT NULL,
      closes_at INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN (
        'open', 'pending_review_configuration', 'review_required', 'certificate_activated'
      )),
      eligible_voter_count INTEGER NOT NULL CHECK (eligible_voter_count >= 0),
      finalized_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS career_constable_notice_voters (
      notice_id TEXT NOT NULL REFERENCES career_constable_public_notices(notice_id),
      resident_id TEXT NOT NULL,
      choice TEXT CHECK (choice IN ('no_objection', 'review_request')),
      voted_at INTEGER,
      PRIMARY KEY (notice_id, resident_id)
    );

    CREATE TABLE IF NOT EXISTS career_employments (
      employment_id TEXT PRIMARY KEY,
      resident_id TEXT NOT NULL,
      career TEXT NOT NULL CHECK (career IN ('reporter', 'veterinarian', 'constable')),
      institution TEXT NOT NULL CHECK (institution IN ('lingye_daily', 'animal_hospital', 'public_security')),
      seat_number INTEGER NOT NULL CHECK (seat_number BETWEEN 1 AND 2),
      employment_class TEXT NOT NULL DEFAULT 'staff' CHECK (employment_class IN ('staff', 'external')),
      status TEXT NOT NULL CHECK (status IN ('active', 'ended')),
      availability TEXT NOT NULL CHECK (availability IN ('available', 'leave', 'suspended')),
      hired_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS career_one_active_employment_per_resident
      ON career_employments(resident_id) WHERE status = 'active';
    CREATE UNIQUE INDEX IF NOT EXISTS career_one_active_institution_seat
      ON career_employments(institution, seat_number)
      WHERE status = 'active' AND employment_class = 'staff';

    CREATE TABLE IF NOT EXISTS career_duty_days (
      duty_id TEXT PRIMARY KEY,
      employment_id TEXT NOT NULL REFERENCES career_employments(employment_id),
      resident_id TEXT NOT NULL,
      career TEXT NOT NULL,
      institution TEXT NOT NULL,
      duty_date TEXT NOT NULL,
      qualification_level INTEGER NOT NULL CHECK (qualification_level BETWEEN 1 AND 4),
      base_wage_gold INTEGER NOT NULL CHECK (base_wage_gold >= 0),
      performance_rate_bps INTEGER NOT NULL DEFAULT 10000 CHECK (performance_rate_bps IN (5000, 10000)),
      status TEXT NOT NULL CHECK (status IN ('scheduled', 'invalidated', 'settled')),
      generated_at INTEGER NOT NULL,
      invalidated_at INTEGER,
      settled_at INTEGER,
      performance_units INTEGER NOT NULL DEFAULT 0 CHECK (performance_units >= 0),
      performance_gold INTEGER NOT NULL DEFAULT 0 CHECK (performance_gold >= 0),
      wage_receipt_id TEXT UNIQUE REFERENCES career_financial_receipts(receipt_id),
      UNIQUE (employment_id, duty_date)
    );

    CREATE TABLE IF NOT EXISTS career_jobs (
      job_id TEXT PRIMARY KEY,
      parent_job_id TEXT REFERENCES career_jobs(job_id),
      career TEXT NOT NULL CHECK (career IN ('chef', 'agronomist', 'veterinarian', 'reporter', 'constable')),
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      owner_resident_id TEXT,
      required_level INTEGER NOT NULL CHECK (required_level BETWEEN 1 AND 4),
      difficulty_level INTEGER NOT NULL CHECK (difficulty_level BETWEEN 1 AND 4),
      assignment_mode TEXT NOT NULL CHECK (assignment_mode IN ('accepted', 'assigned', 'self')),
      status TEXT NOT NULL CHECK (status IN (
        'available', 'accepted', 'assigned', 'active', 'completed', 'cancelled', 'transferred', 'expired'
      )),
      worker_resident_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      ended_at INTEGER,
      decision_count INTEGER NOT NULL DEFAULT 0 CHECK (decision_count BETWEEN 0 AND 4),
      has_irreversible_action INTEGER NOT NULL DEFAULT 0 CHECK (has_irreversible_action IN (0, 1)),
      world_result_reference TEXT,
      payment_reference TEXT,
      UNIQUE (source_type, source_id)
    );
    CREATE INDEX IF NOT EXISTS career_jobs_worker_index
      ON career_jobs(worker_resident_id, status, updated_at);

    CREATE TABLE IF NOT EXISTS career_job_assignment_exclusions (
      job_id TEXT NOT NULL REFERENCES career_jobs(job_id),
      resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
      relation_kind TEXT NOT NULL CHECK (relation_kind = 'source_party'),
      source_reference TEXT NOT NULL,
      recorded_at INTEGER NOT NULL,
      PRIMARY KEY (job_id, resident_id)
    );
    CREATE INDEX IF NOT EXISTS career_job_assignment_exclusions_resident
      ON career_job_assignment_exclusions(resident_id, job_id);

    CREATE TABLE IF NOT EXISTS career_job_object_locks (
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      job_id TEXT NOT NULL UNIQUE REFERENCES career_jobs(job_id),
      locked_at INTEGER NOT NULL,
      PRIMARY KEY (object_type, object_id)
    );

    CREATE TABLE IF NOT EXISTS career_job_decisions (
      decision_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES career_jobs(job_id),
      sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 4),
      idempotency_key TEXT NOT NULL,
      decision_kind TEXT NOT NULL CHECK (decision_kind IN ('check', 'question', 'treatment')),
      option_reference TEXT NOT NULL,
      result_reference TEXT NOT NULL,
      consumes_resources INTEGER NOT NULL CHECK (consumes_resources IN (0, 1)),
      changes_world INTEGER NOT NULL CHECK (changes_world IN (0, 1)),
      recorded_at INTEGER NOT NULL,
      UNIQUE (job_id, sequence),
      UNIQUE (job_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS career_work_records (
      work_record_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      resident_id TEXT NOT NULL,
      career TEXT NOT NULL,
      qualification_level INTEGER NOT NULL CHECK (qualification_level BETWEEN 1 AND 4),
      difficulty_level INTEGER NOT NULL CHECK (difficulty_level BETWEEN 1 AND 4),
      record_kind TEXT NOT NULL CHECK (record_kind IN ('completed', 'qualified_transfer')),
      performance_units INTEGER NOT NULL CHECK (performance_units >= 0),
      performance_rate_bps INTEGER NOT NULL DEFAULT 10000 CHECK (performance_rate_bps IN (5000, 10000)),
      recorded_at INTEGER NOT NULL,
      UNIQUE (job_id, resident_id, record_kind)
    );

    CREATE TABLE IF NOT EXISTS career_performance_adjustments (
      adjustment_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES career_jobs(job_id),
      resident_id TEXT NOT NULL,
      units INTEGER NOT NULL CHECK (units BETWEEN 1 AND 3),
      performance_gold INTEGER NOT NULL CHECK (performance_gold > 0),
      receipt_id TEXT NOT NULL UNIQUE REFERENCES career_financial_receipts(receipt_id),
      source_reference TEXT NOT NULL UNIQUE,
      recorded_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS career_reporter_evaluation_settlements (
      settlement_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL UNIQUE REFERENCES career_jobs(job_id),
      resident_id TEXT NOT NULL,
      source_reference TEXT NOT NULL UNIQUE,
      idempotency_key TEXT NOT NULL UNIQUE,
      valid_likes INTEGER NOT NULL CHECK (valid_likes >= 0),
      units INTEGER NOT NULL CHECK (units BETWEEN 0 AND 3),
      performance_gold INTEGER NOT NULL CHECK (performance_gold >= 0),
      receipt_id TEXT UNIQUE REFERENCES career_financial_receipts(receipt_id),
      settled_at INTEGER NOT NULL,
      CHECK (
        (units = 0 AND performance_gold = 0 AND receipt_id IS NULL)
        OR
        (units BETWEEN 1 AND 3 AND performance_gold > 0 AND receipt_id IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS career_commission_payments (
      job_id TEXT PRIMARY KEY REFERENCES career_jobs(job_id),
      trade_id TEXT UNIQUE,
      silver_amount INTEGER NOT NULL CHECK (silver_amount > 0),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS career_commission_source_facts (
      source_id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      fact_json TEXT NOT NULL,
      recorded_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS career_npc_service_settlements (
      settlement_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL UNIQUE,
      source_type TEXT NOT NULL,
      career TEXT NOT NULL CHECK (career IN ('agronomist', 'veterinarian')),
      owner_resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
      difficulty_level INTEGER NOT NULL CHECK (difficulty_level BETWEEN 1 AND 4),
      base_fee_gold INTEGER NOT NULL CHECK (base_fee_gold > 0),
      material_fee_gold INTEGER NOT NULL CHECK (material_fee_gold > 0),
      total_fee_gold INTEGER NOT NULL CHECK (total_fee_gold = base_fee_gold + material_fee_gold),
      charge_receipt_id TEXT NOT NULL UNIQUE REFERENCES economy_financial_receipts(receipt_id) ON DELETE RESTRICT,
      idempotency_key TEXT NOT NULL UNIQUE,
      payload_hash TEXT NOT NULL,
      result_json TEXT NOT NULL,
      completed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS career_reporter_submissions (
      submission_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL UNIQUE REFERENCES career_jobs(job_id),
      resident_id TEXT NOT NULL,
      source_reference TEXT NOT NULL,
      article_text TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending_review', 'published', 'rejected')),
      submitted_at INTEGER NOT NULL,
      reviewed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS career_reporter_source_facts (
      source_id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      producer_reference TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      public_subject TEXT NOT NULL,
      fact_json TEXT NOT NULL,
      allowed_numbers_json TEXT NOT NULL,
      privacy_scope TEXT NOT NULL CHECK (privacy_scope = 'public'),
      revision_reference TEXT,
      fact_digest TEXT NOT NULL,
      recorded_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS career_reporter_material_packs (
      pack_id TEXT PRIMARY KEY,
      issue_reference TEXT,
      required_level INTEGER NOT NULL CHECK (required_level BETWEEN 1 AND 4),
      difficulty_level INTEGER NOT NULL CHECK (difficulty_level BETWEEN 1 AND 4),
      source_ids_json TEXT NOT NULL,
      source_snapshot_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('available', 'claimed', 'returned', 'consumed')),
      job_id TEXT UNIQUE REFERENCES career_jobs(job_id),
      claimed_by_resident_id TEXT REFERENCES residents(resident_id),
      claim_idempotency_key TEXT UNIQUE,
      return_idempotency_key TEXT UNIQUE,
      created_at INTEGER NOT NULL,
      claimed_at INTEGER,
      returned_at INTEGER,
      consumed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS career_reporter_material_packs_status_index
      ON career_reporter_material_packs(status, created_at, pack_id);

    CREATE TABLE IF NOT EXISTS career_reporter_sections (
      section_id TEXT PRIMARY KEY,
      resident_id TEXT NOT NULL REFERENCES residents(resident_id),
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status = 'active'),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS career_reporter_sections_owner_index
      ON career_reporter_sections(resident_id, created_at, section_id);

    CREATE TABLE IF NOT EXISTS career_reporter_articles (
      article_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES career_jobs(job_id),
      resident_id TEXT NOT NULL REFERENCES residents(resident_id),
      pack_id TEXT NOT NULL REFERENCES career_reporter_material_packs(pack_id),
      version INTEGER NOT NULL CHECK (version >= 1),
      revision_kind TEXT NOT NULL CHECK (revision_kind IN ('initial', 'supplement', 'correction')),
      parent_article_id TEXT REFERENCES career_reporter_articles(article_id),
      section_id TEXT REFERENCES career_reporter_sections(section_id),
      article_text TEXT NOT NULL,
      numeric_claims_json TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('pending_review', 'needs_supplement', 'rejected', 'approved', 'published')),
      review_decision TEXT,
      review_reason_code TEXT,
      reviewer_reference TEXT,
      submitted_at INTEGER NOT NULL,
      reviewed_at INTEGER,
      published_at INTEGER,
      UNIQUE (job_id, version)
    );
    CREATE INDEX IF NOT EXISTS career_reporter_articles_job_index
      ON career_reporter_articles(job_id, version);

    CREATE TABLE IF NOT EXISTS career_reporter_article_citations (
      article_id TEXT NOT NULL REFERENCES career_reporter_articles(article_id),
      source_id TEXT NOT NULL REFERENCES career_reporter_source_facts(source_id),
      citation_index INTEGER NOT NULL CHECK (citation_index >= 0),
      fact_digest TEXT NOT NULL,
      PRIMARY KEY (article_id, source_id),
      UNIQUE (article_id, citation_index)
    );

    CREATE TABLE IF NOT EXISTS career_reporter_publications (
      publication_id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL UNIQUE REFERENCES career_reporter_articles(article_id),
      job_id TEXT NOT NULL REFERENCES career_jobs(job_id),
      resident_id TEXT NOT NULL REFERENCES residents(resident_id),
      article_version INTEGER NOT NULL CHECK (article_version >= 1),
      published_at INTEGER NOT NULL,
      evaluation_opens_at INTEGER NOT NULL,
      evaluation_closes_at INTEGER NOT NULL CHECK (evaluation_closes_at > evaluation_opens_at),
      status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'superseded')),
      valid_likes INTEGER NOT NULL DEFAULT 0 CHECK (valid_likes >= 0),
      performance_units INTEGER NOT NULL DEFAULT 0 CHECK (performance_units BETWEEN 0 AND 3),
      performance_gold INTEGER NOT NULL DEFAULT 0 CHECK (performance_gold >= 0),
      settlement_receipt_id TEXT UNIQUE REFERENCES career_financial_receipts(receipt_id),
      settled_at INTEGER,
      UNIQUE (job_id, article_version)
    );
    CREATE INDEX IF NOT EXISTS career_reporter_publications_job_index
      ON career_reporter_publications(job_id, article_version);

    CREATE TABLE IF NOT EXISTS career_reporter_publication_likes (
      job_id TEXT NOT NULL REFERENCES career_jobs(job_id),
      publication_id TEXT NOT NULL REFERENCES career_reporter_publications(publication_id),
      resident_id TEXT NOT NULL REFERENCES residents(resident_id),
      actor_kind TEXT NOT NULL CHECK (actor_kind = 'resident'),
      liked_at INTEGER NOT NULL,
      PRIMARY KEY (job_id, resident_id),
      UNIQUE (publication_id, resident_id)
    );
    CREATE INDEX IF NOT EXISTS career_reporter_publication_likes_publication_index
      ON career_reporter_publication_likes(publication_id, liked_at);

    CREATE TABLE IF NOT EXISTS career_reporter_human_likes (
      job_id TEXT NOT NULL REFERENCES career_jobs(job_id),
      publication_id TEXT NOT NULL REFERENCES career_reporter_publications(publication_id),
      human_actor_key TEXT NOT NULL,
      via_resident_id TEXT NOT NULL REFERENCES residents(resident_id),
      liked_at INTEGER NOT NULL,
      PRIMARY KEY (job_id, human_actor_key),
      UNIQUE (publication_id, human_actor_key)
    );
    CREATE INDEX IF NOT EXISTS career_reporter_human_likes_publication_index
      ON career_reporter_human_likes(publication_id, liked_at);

    CREATE TABLE IF NOT EXISTS career_reporter_evaluation_quotes (
      quote_id TEXT PRIMARY KEY,
      publication_id TEXT NOT NULL REFERENCES career_reporter_publications(publication_id),
      job_id TEXT NOT NULL UNIQUE REFERENCES career_jobs(job_id),
      resident_id TEXT NOT NULL REFERENCES residents(resident_id),
      source_reference TEXT NOT NULL UNIQUE,
      idempotency_key TEXT NOT NULL UNIQUE,
      valid_likes INTEGER NOT NULL CHECK (valid_likes >= 0),
      performance_units INTEGER NOT NULL CHECK (performance_units BETWEEN 0 AND 3),
      performance_gold INTEGER NOT NULL CHECK (performance_gold >= 0),
      qualification_level INTEGER NOT NULL CHECK (qualification_level BETWEEN 1 AND 4),
      evaluation_closes_at INTEGER NOT NULL,
      quote_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('quoted', 'settled')),
      receipt_id TEXT UNIQUE REFERENCES career_financial_receipts(receipt_id),
      quoted_at INTEGER NOT NULL,
      settled_at INTEGER,
      CHECK (
        (status = 'quoted' AND receipt_id IS NULL AND settled_at IS NULL)
        OR
        (status = 'settled' AND receipt_id IS NULL AND performance_units = 0 AND performance_gold = 0 AND settled_at IS NOT NULL)
        OR
        (status = 'settled' AND receipt_id IS NOT NULL AND performance_units BETWEEN 1 AND 3 AND performance_gold > 0 AND settled_at IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS career_security_resolutions (
      resolution_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL UNIQUE REFERENCES career_jobs(job_id),
      resident_id TEXT NOT NULL,
      result_kind TEXT NOT NULL CHECK (result_kind IN ('rules_explained', 'voluntary_mediation', 'bank_notice', 'review_upheld')),
      note TEXT,
      resolved_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS career_job_messages (
      message_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES career_jobs(job_id),
      sender_resident_id TEXT NOT NULL REFERENCES residents(resident_id),
      recipient_resident_id TEXT NOT NULL REFERENCES residents(resident_id),
      body TEXT NOT NULL CHECK (length(body) > 0),
      created_at INTEGER NOT NULL,
      CHECK (sender_resident_id != recipient_resident_id)
    );
    CREATE INDEX IF NOT EXISTS career_job_messages_job_index
      ON career_job_messages(job_id, created_at, message_id);
  `);
    const courseColumns = new Set(database
        .prepare("PRAGMA table_info(career_courses)")
        .all()
        .map((column) => column.name));
    for (const [name, definition] of [
        ["content_bank_version", "TEXT"],
        ["content_snapshot_json", "TEXT"],
        ["content_delivery_id", "TEXT"],
        ["content_delivered_at", "INTEGER"],
    ]) {
        if (!courseColumns.has(name))
            database.exec(`ALTER TABLE career_courses ADD COLUMN ${name} ${definition}`);
    }
    const examColumns = new Set(database
        .prepare("PRAGMA table_info(career_exam_attempts)")
        .all()
        .map((column) => column.name));
    if (!examColumns.has("missed_session_at"))
        database.exec("ALTER TABLE career_exam_attempts ADD COLUMN missed_session_at INTEGER");
    const employmentColumns = new Set(database
        .prepare("PRAGMA table_info(career_employments)")
        .all()
        .map((column) => column.name));
    if (!employmentColumns.has("employment_class"))
        database.exec("ALTER TABLE career_employments ADD COLUMN employment_class TEXT NOT NULL DEFAULT 'staff' CHECK (employment_class IN ('staff', 'external'))");
    database.exec("DROP INDEX IF EXISTS career_one_active_institution_seat");
    database.exec(`CREATE UNIQUE INDEX career_one_active_institution_seat
      ON career_employments(institution, seat_number)
      WHERE status = 'active' AND employment_class = 'staff'`);
    const dutyColumns = new Set(database
        .prepare("PRAGMA table_info(career_duty_days)")
        .all()
        .map((column) => column.name));
    if (!dutyColumns.has("performance_rate_bps"))
        database.exec("ALTER TABLE career_duty_days ADD COLUMN performance_rate_bps INTEGER NOT NULL DEFAULT 10000 CHECK (performance_rate_bps IN (5000, 10000))");
    const workRecordColumns = new Set(database
        .prepare("PRAGMA table_info(career_work_records)")
        .all()
        .map((column) => column.name));
    if (!workRecordColumns.has("performance_rate_bps"))
        database.exec("ALTER TABLE career_work_records ADD COLUMN performance_rate_bps INTEGER NOT NULL DEFAULT 10000 CHECK (performance_rate_bps IN (5000, 10000))");
    const interviewColumns = new Set(database
        .prepare("PRAGMA table_info(career_constable_interviews)")
        .all()
        .map((column) => column.name));
    for (const [name, definition] of [
        ["interview_bank_version", "TEXT"],
        ["interview_paper_snapshot_json", "TEXT"],
        ["interview_fact_material_snapshot_json", "TEXT"],
        ["interview_scoring_standard_snapshot_json", "TEXT"],
        ["last_postponed_at", "INTEGER"],
        ["postponed_count", "INTEGER NOT NULL DEFAULT 0"],
    ]) {
        if (!interviewColumns.has(name))
            database.exec(`ALTER TABLE career_constable_interviews ADD COLUMN ${name} ${definition}`);
    }
    const constableNoticeColumns = new Set(database
        .prepare("PRAGMA table_info(career_constable_public_notices)")
        .all()
        .map((column) => column.name));
    if (!constableNoticeColumns.has("candidate_resident_name"))
        database.exec("ALTER TABLE career_constable_public_notices ADD COLUMN candidate_resident_name TEXT");
    const reporterMaterialPackColumns = new Set(database
        .prepare("PRAGMA table_info(career_reporter_material_packs)")
        .all()
        .map((column) => column.name));
    if (!reporterMaterialPackColumns.has("issue_reference"))
        database.exec("ALTER TABLE career_reporter_material_packs ADD COLUMN issue_reference TEXT");
    const reporterArticleColumns = new Set(database
        .prepare("PRAGMA table_info(career_reporter_articles)")
        .all()
        .map((column) => column.name));
    if (!reporterArticleColumns.has("section_id"))
        database.exec("ALTER TABLE career_reporter_articles ADD COLUMN section_id TEXT");
    database.exec(`
      CREATE INDEX IF NOT EXISTS career_reporter_material_packs_issue_index
        ON career_reporter_material_packs(issue_reference, pack_id);
    `);
}
