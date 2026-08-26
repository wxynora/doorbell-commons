export const CAREER_SCHEMA_VERSION = 1;
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
      FOREIGN KEY (resident_id, career) REFERENCES career_tracks(resident_id, career)
    );
    CREATE INDEX IF NOT EXISTS career_exam_attempts_resident_index
      ON career_exam_attempts(resident_id, career, qualification_level, registered_at);

    CREATE TABLE IF NOT EXISTS career_constable_interviews (
      interview_id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL UNIQUE REFERENCES career_exam_attempts(attempt_id),
      candidate_resident_id TEXT NOT NULL,
      scheduled_at INTEGER NOT NULL,
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
      status TEXT NOT NULL CHECK (status IN ('active', 'ended')),
      availability TEXT NOT NULL CHECK (availability IN ('available', 'leave', 'suspended')),
      hired_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS career_one_active_employment_per_resident
      ON career_employments(resident_id) WHERE status = 'active';
    CREATE UNIQUE INDEX IF NOT EXISTS career_one_active_institution_seat
      ON career_employments(institution, seat_number) WHERE status = 'active';

    CREATE TABLE IF NOT EXISTS career_duty_days (
      duty_id TEXT PRIMARY KEY,
      employment_id TEXT NOT NULL REFERENCES career_employments(employment_id),
      resident_id TEXT NOT NULL,
      career TEXT NOT NULL,
      institution TEXT NOT NULL,
      duty_date TEXT NOT NULL,
      qualification_level INTEGER NOT NULL CHECK (qualification_level BETWEEN 1 AND 4),
      base_wage_gold INTEGER NOT NULL CHECK (base_wage_gold >= 0),
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
  `);
}
