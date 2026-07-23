/** One coherent icon set for the app shell (18px, 1.8 stroke, currentColor). */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function NavIcon({ name }: { name: string }) {
  switch (name) {
    case "home":
      return <svg viewBox="0 0 24 24" {...P}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
    case "entry":
      return <svg viewBox="0 0 24 24" {...P}><path d="M12 5v14M5 12h14" /></svg>;
    case "analytics": // Data View
      return <svg viewBox="0 0 24 24" {...P}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
    case "dashboard": // Merchant Info
      return <svg viewBox="0 0 24 24" {...P}><path d="M3 7h18M3 12h18M3 17h18" /></svg>;
    case "transfer": // Brand Transfer
      return <svg viewBox="0 0 24 24" {...P}><path d="M7 8l-4 4 4 4M17 16l4-4-4-4M3 12h18" /></svg>;
    case "delivery":
      return <svg viewBox="0 0 24 24" {...P}><path d="M4 4h16v6a8 8 0 0 1-16 0z" /><path d="M8 20h8" /></svg>;
    case "saleshome":
      return <svg viewBox="0 0 24 24" {...P}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
    case "sales": // Sales Pipeline
      return <svg viewBox="0 0 24 24" {...P}><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
    default:
      return <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="8" /></svg>;
  }
}
