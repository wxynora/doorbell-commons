export function SnowUnitSprite({ type, role, size }: { type: string; role: string; size: number }) {
  const color = role === "attack" ? "#c96549" : "#467ea6";
  const heavy = ["heavy_t", "heavy_guard", "hammer"].includes(type);
  const healer = ["march_medic", "medic"].includes(type);
  return (
    <g transform={`scale(${size / 48})`} stroke="#43586a" strokeWidth="1.8" strokeLinejoin="round">
      <ellipse cx="0" cy="19" rx="21" ry="5" fill="#698898" opacity=".2" stroke="none" />
      <path d="M-10 12l-4 8h8l4-8M7 12l1 8h8l-4-9" fill="#506779" />
      <path
        d={heavy ? "M-16-3Q0-12 16-3L19 14Q0 21-19 14Z" : "M-11-3Q0-10 11-3L14 14Q0 19-14 14Z"}
        fill={heavy ? "#a7c4d1" : "#fff7e5"}
      />
      <circle cy="-10" r="10" fill="#fff9ec" />
      <path d="M-11-12Q-11-25 1-23Q12-21 12-12Z" fill={color} />
      <circle cx="1" cy="-24" r="3" fill="#fff" />
      <path d="M-11-1Q0 4 11-1L10 4H-9ZM5 3l8 11-6 2L2 4" fill={color} stroke="none" />
      <path d="M-4-10v2M4-10v2" strokeWidth="2.5" strokeLinecap="round" />
      {type === "light_inf" && (
        <>
          <path d="M13 9L24-15" strokeWidth="3" />
          <circle cx="23" cy="-16" r="6" fill="#fff" />
        </>
      )}
      {["shield_guard", "heavy_guard", "heavy_t"].includes(type) && (
        <path
          d="M-22-3L-8-6 0-1-2 16-12 23-23 12Z"
          fill={type === "heavy_t" ? "#a0adb9" : color}
          strokeWidth="2.5"
        />
      )}
      {type === "heavy_guard" && <path d="M-16 0v15M-22 6h18" stroke="#e5f2f7" />}
      {type === "hammer" && (
        <>
          <path d="M10 15L20-21" stroke="#806142" strokeWidth="5" />
          <rect
            x="10"
            y="-24"
            width="24"
            height="13"
            rx="3"
            fill="#a7bed0"
            transform="rotate(15 20 -18)"
          />
        </>
      )}
      {type === "thrower" && (
        <>
          <path d="M10 3l11-12" strokeWidth="5" />
          <circle cx="22" cy="-12" r="7" fill="#fff" />
          <circle cx="-15" cy="8" r="6" fill="#fff" />
        </>
      )}
      {type === "scout" && (
        <>
          <path d="M-12-14Q-4-30 12-13L4-17-3-16Z" fill="#596878" />
          <path d="M-11-7h22v5h-22" fill={color} stroke="none" />
          <path d="M12 9l12-13-4 16Z" fill="#d4edf1" />
        </>
      )}
      {healer && (
        <>
          <rect x="-23" y="1" width="16" height="17" rx="4" fill="#779b80" />
          <path d="M-15 4v10M-20 9h10" stroke="#fff" strokeWidth="3" />
        </>
      )}
      {type === "crossbow" && (
        <>
          <path
            d="M4 8L25-5M12-9Q31-5 23 15M12-9L23 15"
            fill="none"
            stroke="#795d42"
            strokeWidth="3"
          />
          <path d="M7 8L27-7m-6 0h6v6" fill="none" />
        </>
      )}
      {type === "snow_mage" && (
        <>
          <path d="M-13-14L0-33 13-14Z" fill={color} />
          <path d="M19 17v-32" stroke="#827258" strokeWidth="3" />
          <path d="M19-26v16M11-18h16M13-24l12 12M13-12l12-12" stroke="#88cbd7" strokeWidth="2.5" />
        </>
      )}
      {type === "artillery" && (
        <>
          <circle cx="-12" cy="15" r="7" fill="#6b7e8c" />
          <circle cx="14" cy="15" r="7" fill="#6b7e8c" />
          <path d="M-13 12L-9-3 24-9 27 1 3 11Z" fill="#90b6c9" strokeWidth="2.5" />
          <ellipse cx="25" cy="-4" rx="4" ry="6" fill="#3e5969" />
        </>
      )}
    </g>
  );
}
