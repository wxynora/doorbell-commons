interface ResidentPlaceholderProps {
  label: string;
}

export function ResidentPlaceholder({ label }: ResidentPlaceholderProps) {
  return (
    <div className="resident-placeholder">
      <span className="resident-placeholder__avatar" aria-hidden="true">
        <svg viewBox="0 0 120 120">
          <title>居民形象占位</title>
          <path d="M30 98V46l30-20 30 20v52Z" />
          <path d="M47 98V69h26v29M47 52h26" />
        </svg>
      </span>
      {label ? <span className="resident-placeholder__label">{label}</span> : null}
    </div>
  );
}
