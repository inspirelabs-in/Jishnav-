/**
 * The Inspirelabs mark: three placed blocks and one still to be placed.
 * Drawn as SVG rather than shipped as a bitmap so it stays crisp at any size
 * and inherits no colour — the brand hues are fixed, by definition.
 *
 * Geometry traced from `Inspirelabs Logo/symbol-light.png`, including the
 * dashed block being larger and offset from the 2×2 grid (that asymmetry is
 * the point of the mark, so it is preserved rather than tidied away).
 */
export default function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 802 788"
      fill="none"
      role="img"
      aria-label="Inspirelabs"
    >
      <rect x="0" y="0" width="325" height="328" rx="56" fill="#FF7F45" />
      <rect x="380" y="0" width="327" height="328" rx="56" fill="#0F0F0D" />
      <rect x="0" y="358" width="325" height="328" rx="56" fill="#7C7C7C" />
      <rect
        x="391" y="374" width="394" height="397" rx="46"
        stroke="#7C7C7C" strokeWidth="33" strokeDasharray="62 42" strokeLinecap="round"
      />
    </svg>
  );
}
