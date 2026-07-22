import BrandBreakdown from "./BrandBreakdown";

/** Data View: the per-brand breakdown table with brand / category / handler
 *  filters. (Charts and comparison tables were removed in favour of this.) */
export default function AnalyticsTab({ user }: { user: string }) {
  return <BrandBreakdown user={user} />;
}
