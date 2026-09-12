import { useId } from "react";

export type FruitAccent = "coral" | "gold" | "mint" | "sky";
export const FRUIT_SEAT_ACCENTS: readonly FruitAccent[] = ["mint", "coral", "gold", "sky"];

const FRUIT_PALETTES: Record<FruitAccent, [string, string]> = {
  coral: ["#f07670", "#a9323c"],
  gold: ["#fbd35c", "#be8415"],
  mint: ["#ae8153", "#644123"],
  sky: ["#65b0e1", "#216496"],
};

export function FruitGlyph({
  accent,
  sliced = false,
  size,
  x,
  y,
}: {
  accent: FruitAccent;
  sliced?: boolean;
  size?: number;
  x?: number;
  y?: number;
}) {
  const id = useId().replaceAll(":", "");
  const [light, dark] = FRUIT_PALETTES[accent];
  const gradient = `fruit-${id}`;
  const seedAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg
      className={`fc-fruit fc-fruit--${accent}`}
      viewBox="0 0 64 64"
      width={size ?? "100%"}
      height={size ?? "100%"}
      x={x}
      y={y}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={gradient} cx="30%" cy="25%" r="80%">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
      </defs>
      {accent === "coral" ? (
        <>
          <path
            className="fc-fruit__skin"
            d="M32 13C21 5 8 13 7 29C5 44 18 60 29 57C31 56 33 56 35 57C48 61 60 43 57 28C56 13 44 6 32 13Z"
            fill={sliced ? "#f6dda2" : `url(#${gradient})`}
            stroke={sliced ? "#df7972" : "none"}
            strokeWidth="4"
          />
          <path
            d="M32 14Q31 8 35 5"
            fill="none"
            stroke="#876943"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <ellipse cx="41" cy="10" rx="8" ry="3.5" fill="#b5c978" transform="rotate(-22 41 10)" />
          {sliced ? (
            <>
              <ellipse
                cx="26"
                cy="34"
                rx="2"
                ry="3.3"
                fill="#aa8b57"
                transform="rotate(-20 26 34)"
              />
              <ellipse
                cx="38"
                cy="34"
                rx="2"
                ry="3.3"
                fill="#aa8b57"
                transform="rotate(20 38 34)"
              />
            </>
          ) : (
            <ellipse
              cx="18"
              cy="24"
              rx="4"
              ry="7"
              fill="#fff1d3"
              opacity=".19"
              transform="rotate(25 18 24)"
            />
          )}
        </>
      ) : accent === "gold" ? (
        <>
          <path
            className="fc-fruit__skin"
            d="M12 15Q10 9 17 12C31 2 49 11 54 25Q61 29 56 35C55 49 41 59 26 57Q18 63 16 55C3 45 4 28 12 15Z"
            fill={`url(#${gradient})`}
          />
          {sliced ? (
            <g>
              <circle cx="32" cy="33" r="21" fill="#f7dc84" stroke="#fff3c3" strokeWidth="3" />
              {seedAngles.map((angle) => (
                <path
                  key={angle}
                  d="M32 30L32 14"
                  stroke="#fff3c3"
                  strokeWidth="1.5"
                  transform={`rotate(${angle} 32 33)`}
                />
              ))}
              <circle cx="32" cy="33" r="3" fill="#fff3c3" />
            </g>
          ) : (
            <>
              <ellipse
                cx="20"
                cy="22"
                rx="7"
                ry="4"
                fill="#fff6bb"
                opacity=".4"
                transform="rotate(-35 20 22)"
              />
              <circle cx="23" cy="35" r="1.2" fill="#c9a447" />
              <circle cx="37" cy="35" r="1.2" fill="#c9a447" />
            </>
          )}
        </>
      ) : accent === "mint" ? (
        <>
          <ellipse
            className="fc-fruit__skin"
            cx="32"
            cy="33"
            rx="26"
            ry="28"
            fill={`url(#${gradient})`}
          />
          <g
            transform={
              sliced ? "" : "translate(0 -4) translate(32 20) scale(.7 .48) translate(-32 -20)"
            }
          >
            <circle cx="32" cy={sliced ? 33 : 20} r="22" fill="#b3cf6c" />
            <circle cx="32" cy={sliced ? 33 : 20} r="8" fill="#e6edb2" />
            {seedAngles.map((angle) => (
              <ellipse
                key={angle}
                cx="32"
                cy={sliced ? 18 : 5}
                rx="1.3"
                ry="2.3"
                fill="#748443"
                transform={`rotate(${angle} 32 ${sliced ? 33 : 20})`}
              />
            ))}
          </g>
          {!sliced ? (
            <path
              d="M12 29Q6 45 22 53"
              stroke="#e6cf92"
              strokeWidth="2"
              opacity=".15"
              fill="none"
            />
          ) : null}
        </>
      ) : (
        <>
          <circle className="fc-fruit__skin" cx="32" cy="34" r="27" fill={`url(#${gradient})`} />
          {sliced ? (
            <>
              <circle cx="32" cy="34" r="22" fill="#c6dce9" />
              <path
                d="M32 18L37 28L49 29L40 37L43 49L32 42L21 49L24 37L15 29L27 28Z"
                fill="#9ac1d9"
              />
              <circle cx="32" cy="34" r="5" fill="#e2edf0" />
            </>
          ) : (
            <>
              <path
                d="M31 10L35 14L41 13L38 18L40 23L33 21L29 25L28 19L23 17L29 15Z"
                fill="#598dae"
              />
              <ellipse
                cx="18"
                cy="28"
                rx="4"
                ry="6"
                fill="#dfedf4"
                opacity=".25"
                transform="rotate(20 18 28)"
              />
            </>
          )}
        </>
      )}
    </svg>
  );
}
