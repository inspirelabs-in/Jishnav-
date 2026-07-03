interface Props {
  size?: number;
  spinning?: boolean;
}

export function CouponIcon({ size = 24, spinning = false }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={spinning ? { animation: "spin 2s linear infinite" } : undefined}
    >
      {/* ── Back ticket (rotated ~32° behind front) ── */}
      <g transform="rotate(32, 45, 52)">
        <path
          d="M 10 38
             L 24 38 A 7 7 0 0 0 38 38
             L 74 38
             L 77 41 L 74 44 L 77 47 L 74 50 L 77 53 L 74 56 L 77 59 L 74 62 L 77 65 L 74 68
             L 38 68 A 7 7 0 0 0 24 68
             L 10 68 Z"
          fill="black"
        />
      </g>

      {/* ── Front ticket body ── */}
      <path
        d="M 8 36
           L 22 36 A 8 8 0 0 0 38 36
           L 80 36
           L 83 39 L 80 42
           L 83 45 L 80 48
           L 83 51 L 80 54
           L 83 57 L 80 60
           L 83 63 L 80 66
           L 83 69 L 80 72
           L 38 72 A 8 8 0 0 0 22 72
           L 8 72 Z"
        fill="black"
      />

      {/* Dashed separator */}
      <line
        x1="30" y1="39"
        x2="30" y2="69"
        stroke="white"
        strokeWidth="3.5"
        strokeDasharray="5.5 4"
        strokeLinecap="round"
      />

      {/* % symbol — drawn as paths for crispness at all sizes */}
      {/* top-left circle */}
      <circle cx="51" cy="46" r="5" stroke="white" strokeWidth="3.5" />
      {/* bottom-right circle */}
      <circle cx="66" cy="61" r="5" stroke="white" strokeWidth="3.5" />
      {/* diagonal slash */}
      <line
        x1="68" y1="43"
        x2="49" y2="64"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
