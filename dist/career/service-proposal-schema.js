export function installServiceProposalSchema(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS career_service_proposals (
        proposal_id TEXT PRIMARY KEY,
        owner_farm_id TEXT NOT NULL REFERENCES farm_states(farm_id),
        actor_farm_id TEXT NOT NULL REFERENCES farm_states(farm_id),
        owner_resident_id TEXT NOT NULL REFERENCES residents(resident_id),
        actor_resident_id TEXT NOT NULL REFERENCES residents(resident_id),
        career TEXT NOT NULL CHECK (career IN ('agronomist','veterinarian')),
        source_id TEXT NOT NULL,
        currency TEXT NOT NULL CHECK (currency IN ('gold','silver')),
        amount INTEGER NOT NULL CHECK (amount > 0),
        subject_text TEXT NOT NULL,
        observation_text TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','expired')),
        status_reason TEXT,
        job_id TEXT REFERENCES career_jobs(job_id),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS career_service_proposals_owner
        ON career_service_proposals(owner_resident_id,status,created_at);
      CREATE INDEX IF NOT EXISTS career_service_proposals_visit
        ON career_service_proposals(actor_resident_id,owner_resident_id,source_id,created_at);
      CREATE INDEX IF NOT EXISTS career_service_jobs_source_lookup
        ON career_jobs(source_id,career,created_at);
      CREATE TABLE IF NOT EXISTS career_service_proposal_observations (
        proposal_id TEXT NOT NULL REFERENCES career_service_proposals(proposal_id),
        observation TEXT NOT NULL,
        PRIMARY KEY (proposal_id, observation)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS career_service_proposal_notification_facts (
        notification_id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL REFERENCES career_service_proposals(proposal_id),
        recipient_resident_id TEXT NOT NULL REFERENCES residents(resident_id),
        kind TEXT NOT NULL CHECK (kind IN ('offer','accepted','rejected')),
        occurred_at INTEGER NOT NULL
      );
    `);
}
