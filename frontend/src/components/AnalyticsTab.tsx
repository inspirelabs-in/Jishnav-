import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { HANDLERS, type Merchant } from "../types";
import AnalyticsPanel from "./AnalyticsPanel";
import MonthYearPicker from "./MonthYearPicker";
import PortfolioOverview from "./PortfolioOverview";
import TokenAutocomplete from "./TokenAutocomplete";

const NOW = new Date();

type Mode = "brand" | "category";

export default function AnalyticsTab({ user }: { user: string }) {
  const [mode, setMode] = useState<Mode | null>(null);

  // Month-granular range (data is kept by month, so there is no day picker).
  const yearOptions = useMemo(() => {
    const y = NOW.getFullYear();
    return [y, y - 1, y - 2];
  }, []);
  const start = useMemo(() => new Date(NOW.getFullYear(), NOW.getMonth() - 2, 1), []);
  const [fromM, setFromM] = useState(start.getMonth() + 1);
  const [fromY, setFromY] = useState(start.getFullYear());
  const [toM, setToM] = useState(NOW.getMonth() + 1);
  const [toY, setToY] = useState(NOW.getFullYear());

  const dateFrom = `${fromY}-${String(fromM).padStart(2, "0")}-01`;
  const lastDay = new Date(toY, toM, 0).getDate();
  const dateTo = `${toY}-${String(toM).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [brandSel, setBrandSel] = useState<string[]>([]);
  const [brandCompare, setBrandCompare] = useState(false);
  const [catSel, setCatSel] = useState<string[]>([]);
  const [catCompare, setCatCompare] = useState(false);
  const [owner, setOwner] = useState("All");

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootKey, setBootKey] = useState(0);

  useEffect(() => {
    Promise.all([api.listMerchants(), api.listCategories()])
      .then(([m, c]) => {
        setMerchants(m);
        setCategoryOptions(c);
        setBootError(null);
      })
      .catch((e) => setBootError((e as Error).message));
  }, [bootKey]);

  const brandOptions = useMemo(() => merchants.map((m) => m.merchant_name), [merchants]);

  // The overview averages the acting handler's book; Manager and Founders
  // Office see the average across every brand.
  const isHandler = HANDLERS.includes(user);
  const overviewOwner = isHandler ? user : "All";

  // Single-category view = a ranking table of the brands inside it.
  const categoryBrands = useMemo(() => {
    if (!catSel[0]) return [];
    return merchants
      .filter((m) => m.breadcrumb1_name === catSel[0])
      .filter((m) => owner === "All" || m.owner === owner)
      .map((m) => m.merchant_name);
  }, [merchants, catSel, owner]);

  function pickMode(next: Mode) {
    setMode((cur) => (cur === next ? null : next));
  }

  function setCompare(kind: Mode, on: boolean) {
    if (kind === "brand") {
      setBrandCompare(on);
      if (!on && brandSel.length > 1) setBrandSel(brandSel.slice(0, 1));
    } else {
      setCatCompare(on);
      if (!on && catSel.length > 1) setCatSel(catSel.slice(0, 1));
    }
  }

  const dates = { dateFrom, dateTo };

  return (
    <>
      <div className="dash-controls">
        <span className="dash-label">View</span>
        {(["brand", "category"] as Mode[]).map((m) => (
          <button
            key={m}
            className={`view-chip ${mode === m ? "on" : ""}`}
            onClick={() => pickMode(m)}
            aria-pressed={mode === m}
          >
            <span className="vc-check">
              <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M1.5 5.5L4 8l4.5-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {m === "brand" ? "Brand" : "Category"}
          </button>
        ))}

        <span className="spacer" />

        {mode !== null && (
          <div className="mini-field">
            <label>Month range</label>
            <MonthYearPicker
              month={fromM}
              year={fromY}
              years={yearOptions}
              ariaLabel="From"
              onChange={(m, y) => {
                setFromM(m);
                setFromY(y);
              }}
            />
            <span className="muted">to</span>
            <MonthYearPicker
              month={toM}
              year={toY}
              years={yearOptions}
              ariaLabel="To"
              onChange={(m, y) => {
                setToM(m);
                setToY(y);
              }}
            />
          </div>
        )}
      </div>

      {bootError && (
        <div className="card">
          <div className="empty-state">
            Couldn't load brand and category lists: {bootError}{" "}
            <button className="btn btn-sm" onClick={() => setBootKey((k) => k + 1)}>
              Retry
            </button>
          </div>
        </div>
      )}

      {mode === "brand" && (
        <div className="card selector-card">
          <div className="selector-row">
            <TokenAutocomplete
              options={brandOptions}
              selected={brandSel}
              onChange={setBrandSel}
              placeholder={brandCompare ? "Enter brands to compare" : "Enter a brand name"}
              single={!brandCompare}
              multiHint="Turn on Compare brands to add more than one."
            />
          </div>
          <div className="compare-row">
            <button
              className={`toggle toggle-sm ${brandCompare ? "" : "off"}`}
              onClick={() => setCompare("brand", !brandCompare)}
              role="switch"
              aria-checked={brandCompare}
              aria-label="Compare brands"
            />
            <span className="compare-label">Compare brands</span>
          </div>
        </div>
      )}

      {mode === "category" && (
        <div className="card selector-card">
          <div className="selector-row">
            <TokenAutocomplete
              options={categoryOptions}
              selected={catSel}
              onChange={setCatSel}
              placeholder={catCompare ? "Enter categories to compare" : "Enter a category"}
              single={!catCompare}
              multiHint="Turn on Compare categories to add more than one."
            />
            <div className="mini-field">
              <label htmlFor="an-owner">Handler</label>
              <select id="an-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option>All</option>
                {HANDLERS.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="compare-row">
            <button
              className={`toggle toggle-sm ${catCompare ? "" : "off"}`}
              onClick={() => setCompare("category", !catCompare)}
              role="switch"
              aria-checked={catCompare}
              aria-label="Compare categories"
            />
            <span className="compare-label">Compare categories</span>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ rendered view --- */}

      {mode === null && (
        <PortfolioOverview
          owner={overviewOwner}
          subtitle={
            isHandler
              ? `Monthly totals across all brands handled by ${user}`
              : "Monthly totals across all brands"
          }
        />
      )}

      {mode === "brand" && !brandCompare && brandSel[0] && (
        <AnalyticsPanel
          title={brandSel[0]}
          subtitle="Performance trend"
          display="graph"
          params={{ mode: "brand", brands: brandSel, ...dates }}
        />
      )}

      {mode === "brand" && brandCompare && brandSel.length > 0 && (
        <AnalyticsPanel
          title="Brand comparison"
          subtitle={`${brandSel.length} brand${brandSel.length === 1 ? "" : "s"} in this range`}
          display="table"
          tableLabel="Brand"
          params={{ mode: "brand_comparison", brands: brandSel, ...dates }}
        />
      )}

      {mode === "category" && !catCompare && catSel[0] && categoryBrands.length > 0 && (
        <AnalyticsPanel
          title={catSel[0]}
          subtitle={`${categoryBrands.length} brand${categoryBrands.length === 1 ? "" : "s"}${
            owner !== "All" ? `, handled by ${owner}` : ""
          }`}
          display="table"
          tableLabel="Brand"
          params={{ mode: "brand_comparison", brands: categoryBrands, ...dates }}
        />
      )}

      {mode === "category" && !catCompare && catSel[0] && categoryBrands.length === 0 && (
        <div className="card">
          <div className="empty-state">
            No brands in {catSel[0]}
            {owner !== "All" ? ` handled by ${owner}` : ""}.
          </div>
        </div>
      )}

      {mode === "category" && catCompare && catSel.length > 0 && (
        <AnalyticsPanel
          title="Category comparison"
          subtitle={`${catSel.length} categor${catSel.length === 1 ? "y" : "ies"}${
            owner !== "All" ? `, handled by ${owner}` : ""
          }`}
          display="table"
          tableLabel="Category"
          params={{ mode: "category_comparison", categories: catSel, owner, ...dates }}
        />
      )}

      {mode !== null &&
        ((mode === "brand" && brandSel.length === 0) ||
          (mode === "category" && catSel.length === 0)) && (
          <div className="card">
            <div className="empty-state">
              {mode === "brand"
                ? brandCompare
                  ? "Add brands above to compare them."
                  : "Type a brand name above to see its trend."
                : catCompare
                  ? "Add categories above to compare them."
                  : "Type a category above to see its brands."}
            </div>
          </div>
        )}
    </>
  );
}
