type Cell = string | number | null | undefined;

/**
 * Build a CSV client-side and trigger a download.
 * Values are written raw (no ₹ / K / Cr formatting) so Excel treats them as numbers.
 */
export function downloadCsv(filename: string, rows: Cell[][]) {
  const esc = (v: Cell) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  // BOM so Excel opens it as UTF-8 (brand names, ₹ in headers).
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
