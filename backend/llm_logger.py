"""
LLM Call Logger — appends every LLM call to backend/logs/llm_calls.xlsx.
Thread-safe. Never crashes the main flow (all exceptions are swallowed and logged).
"""

import threading
import logging
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

log = logging.getLogger(__name__)

IST      = ZoneInfo("Asia/Kolkata")
LOG_DIR  = Path(__file__).parent / "logs"
LOG_FILE = LOG_DIR / "llm_calls.xlsx"

# ── Pricing (USD per 1M tokens) ────────────────────────────────────────────────
# Update these if OpenAI changes pricing.
PRICING: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 0.150,  "output": 0.600},
    "gpt-4o":      {"input": 5.000,  "output": 15.000},
    "gpt-4.1-mini":{"input": 0.400,  "output": 1.600},
    "qwen2.5:3b":  {"input": 0.000,  "output": 0.000},   # local — free
    "qwen2.5:7b":  {"input": 0.000,  "output": 0.000},
}

USD_TO_INR = 87.0   # rough conversion; update as needed

HEADERS = [
    "Sr", "Date & Time (IST)", "Model", "Prompt File / Reason",
    "Called By (Function)", "Input Tokens", "Output Tokens", "Total Tokens",
    "Cost (USD)", "Cost (INR)", "Session ID",
]

# Column widths matching each header
_COL_WIDTHS = [5, 22, 16, 30, 30, 14, 14, 13, 13, 13, 22]

_lock = threading.Lock()


def _create_workbook() -> openpyxl.Workbook:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "LLM Calls"
    ws.append(HEADERS)

    header_fill = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    for cell in ws[1]:
        cell.fill      = header_fill
        cell.font      = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    for i, w in enumerate(_COL_WIDTHS, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.row_dimensions[1].height = 30
    ws.freeze_panes = "A2"   # freeze header so it stays visible while scrolling
    return wb


def _ensure_file() -> None:
    LOG_DIR.mkdir(exist_ok=True)
    if not LOG_FILE.exists():
        wb = _create_workbook()
        wb.save(LOG_FILE)


def log_call(
    model: str,
    prompt_file: str,
    function_name: str,
    input_tokens: int,
    output_tokens: int,
    session_id: str = "",
) -> None:
    """
    Append one LLM call row to llm_calls.xlsx.

    Args:
        model:         Model name e.g. "gpt-4o-mini", "qwen2.5:3b"
        prompt_file:   Prompt file used e.g. "intent_classify.txt", or a short reason
        function_name: Python function that triggered this call e.g. "classify"
        input_tokens:  Prompt/input token count
        output_tokens: Completion/output token count
        session_id:    Optional session ID for traceability
    """
    try:
        pricing   = PRICING.get(model, {"input": 0.0, "output": 0.0})
        cost_usd  = (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000
        cost_inr  = cost_usd * USD_TO_INR
        now_ist   = datetime.now(IST).strftime("%d-%m-%Y %H:%M:%S")
        total     = input_tokens + output_tokens

        with _lock:
            _ensure_file()
            wb = openpyxl.load_workbook(LOG_FILE)
            ws = wb.active
            sr = ws.max_row   # row 1 = header → max_row is the last data row; new Sr = max_row

            # Alternate row background for readability
            even = (sr % 2 == 0)
            row_fill = PatternFill(
                start_color="EBF2FB" if even else "FFFFFF",
                end_color  ="EBF2FB" if even else "FFFFFF",
                fill_type  ="solid",
            )

            ws.append([
                sr, now_ist, model, prompt_file, function_name,
                input_tokens, output_tokens, total,
                round(cost_usd, 8), round(cost_inr, 4),
                session_id or "",
            ])

            new_row = ws.max_row
            for col_idx, cell in enumerate(ws[new_row], 1):
                cell.fill      = row_fill
                cell.alignment = Alignment(horizontal="center", vertical="center")
                if col_idx == 9:   # Cost USD — 8 decimal places
                    cell.number_format = "#,##0.00000000"
                elif col_idx == 10:  # Cost INR — 4 decimal places
                    cell.number_format = "#,##0.0000"

            wb.save(LOG_FILE)

        log.info(
            "LLM LOG | %-16s | %-30s | in=%-5d out=%-5d | $%.6f | ₹%.4f",
            model, function_name, input_tokens, output_tokens, cost_usd, cost_inr,
        )

    except Exception as exc:
        log.warning("LLM logger failed (non-fatal): %s", exc)
