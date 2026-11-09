import "./production.css";

export function validProductionQuantity(raw: string, maximum: number): boolean {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isSafeInteger(value) && value > 0 && value <= maximum;
}

export function ProductionQuantity({ value, onChange, maximum, unit, disabled = false, label }: {
  value: string; onChange: (value: string) => void; maximum: number; unit: string;
  disabled?: boolean; label: string;
}) {
  const quantity = Number(value);
  return <span className="farm-production-quantity">
    <span className="farm-production-stepper">
      <button type="button" aria-label={`减少${label}`} disabled={disabled || quantity <= 1} onClick={() => onChange(String(quantity - 1))}>−</button>
      <output aria-label={label}>{quantity}<small>{unit}</small></output>
      <button type="button" aria-label={`增加${label}`} disabled={disabled || quantity >= maximum} onClick={() => onChange(String(quantity + 1))}>＋</button>
    </span>
    <button className="farm-production-maximum" type="button" disabled={disabled || maximum < 1} onClick={() => onChange(String(maximum))}>最多</button>
  </span>;
}
