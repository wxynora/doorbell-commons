import type { HumanIdentity } from "../auth/auth-client";

interface ResidencePermitTransitionProps {
  identity: HumanIdentity;
  onComplete: () => void;
}

export function ResidencePermitTransition({
  identity,
  onComplete,
}: ResidencePermitTransitionProps) {
  return (
    <main className="registration-page permit-transition">
      <div className="permit-card" role="status" aria-live="polite">
        <span className="permit-tape" aria-hidden="true" />
        <h2 className="permit-heading">COMMONS RESIDENCY</h2>
        <dl className="permit-identity">
          <div className="permit-field">
            <dt>居民姓名</dt>
            <dd className="handwritten">{identity.resident.resident_name}</dd>
          </div>
          <div className="permit-field">
            <dt>家园名称</dt>
            <dd className="handwritten">{identity.home.home_name}</dd>
          </div>
          <div className="permit-field">
            <dt>家园门牌</dt>
            <dd className="handwritten">DB-{identity.farmBinding.farm_doorplate}</dd>
          </div>
        </dl>
        <p className="permit-motto handwritten">May every ring lead you home.</p>
        <span className="permit-stamp-box" aria-label="已入住" role="img">
          <span className="permit-stamp">
            APPROVED
            <br />
            已入住
          </span>
        </span>
      </div>
      <button className="permit-confirm" onClick={onComplete} type="button">
        确认入住
      </button>
    </main>
  );
}
