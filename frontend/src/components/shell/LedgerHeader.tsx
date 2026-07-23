import type { ReactNode } from "react";

export type LedgerFigure = {
  label: string;
  value: string;
  delta?: string;
  deltaDir?: "up" | "down";
  sub?: string;
};

/**
 * The signature "ledger header" — the head of a ledger page. Title + one-line
 * description on the left, a rail of live mono figures on the right, and a
 * ruled orange underline that draws itself in on entry (the "posted" mark).
 */
export default function LedgerHeader({
  title,
  figures = [],
  actions,
}: {
  title: string;
  /** Deprecated: page headers show the title alone now; kept so existing call
   *  sites still type-check. Not rendered. */
  description?: string;
  figures?: LedgerFigure[];
  actions?: ReactNode;
}) {
  return (
    <header className="ledger-head">
      <div className="lh-row">
        <div className="lh-titles">
          <h1 className="lh-title">{title}</h1>
        </div>
        {(figures.length > 0 || actions) && (
          <div className="lh-right">
            {figures.length > 0 && (
              <div className="lh-figs">
                {figures.map((f, i) => (
                  <div className="lh-fig" key={i}>
                    <span className="lh-fig-k">{f.label}</span>
                    <span className="lh-fig-v mono">{f.value}</span>
                    {f.delta && (
                      <span className={`lh-fig-d ${f.deltaDir === "down" ? "is-down" : "is-up"}`}>
                        {f.delta}
                      </span>
                    )}
                    {f.sub && <span className="lh-fig-sub">{f.sub}</span>}
                  </div>
                ))}
              </div>
            )}
            {actions && <div className="lh-actions">{actions}</div>}
          </div>
        )}
      </div>
    </header>
  );
}
