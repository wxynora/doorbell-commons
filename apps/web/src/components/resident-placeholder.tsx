interface ResidentPlaceholderProps {
  label: string;
}

export function ResidentPlaceholder({ label }: ResidentPlaceholderProps) {
  return (
    <div className="resident-placeholder">
      <span className="resident-placeholder__figure" aria-hidden="true">
        <span className="resident-placeholder__head" />
        <span className="resident-placeholder__body" />
      </span>
      <span className="resident-placeholder__label">{label}</span>
    </div>
  );
}
