"""Report Renderers: CSV (formula-injection protected), XLSX, and HTML (doc 10 §5.3, AC-M9-4).

Supports on-demand streaming of reports in standard business formats.
"""

import csv
import io
from typing import Any

import openpyxl  # type: ignore[import-untyped]
from openpyxl.styles import Font, PatternFill  # type: ignore[import-untyped]


def sanitize_csv_cell(val: Any) -> str:
    """Neutralize formula injection by prepending apostrophe if cell starts with =, +, -, @ (AC-M9-4)."""
    text = str(val if val is not None else "")
    if text and text[0] in ("=", "+", "-", "@"):
        return f"'{text}"
    return text


def render_csv(facts: dict[str, Any]) -> str:
    """Render completed tasks section as UTF-8 CSV with BOM and formula injection protection."""
    output = io.StringIO()
    # Write UTF-8 BOM
    output.write("\ufeff")

    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    writer.writerow(["Title", "Category", "Completed At", "Duration (min)", "Priority"])

    completed = facts.get("completed_tasks", [])
    for t in completed:
        writer.writerow(
            [
                sanitize_csv_cell(t.get("title")),
                sanitize_csv_cell(t.get("category")),
                sanitize_csv_cell(t.get("completed_at")),
                sanitize_csv_cell(t.get("duration_min")),
                sanitize_csv_cell(t.get("priority")),
            ]
        )

    return output.getvalue()


def render_xlsx(facts: dict[str, Any]) -> bytes:
    """Render full multi-tab Excel spreadsheet with typed cells and frozen headers."""
    wb = openpyxl.Workbook()

    # 1. Summary Sheet
    ws_summary = wb.active
    assert ws_summary is not None
    ws_summary.title = "Summary"
    ws_summary.freeze_panes = "A2"

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")

    ws_summary.append(["Metric", "Value"])
    for cell in ws_summary[1]:
        cell.font = header_font
        cell.fill = header_fill

    summary = facts.get("summary", {})
    ws_summary.append(["Period Start", facts.get("period_start")])
    ws_summary.append(["Period End", facts.get("period_end")])
    ws_summary.append(["Completed Tasks", summary.get("completed_count", 0)])
    ws_summary.append(["Pending Tasks", summary.get("pending_count", 0)])
    ws_summary.append(["Overdue Tasks", summary.get("overdue_count", 0)])
    ws_summary.append(["Total Minutes Spent", summary.get("total_time_minutes", 0)])
    ws_summary.append(["Total Hours Spent", summary.get("total_time_hours", 0.0)])

    # 2. Completed Sheet
    ws_completed = wb.create_sheet(title="Completed Tasks")
    ws_completed.freeze_panes = "A2"
    ws_completed.append(["Title", "Category", "Completed At", "Duration (min)", "Priority"])
    for cell in ws_completed[1]:
        cell.font = header_font
        cell.fill = header_fill

    for t in facts.get("completed_tasks", []):
        ws_completed.append(
            [
                t.get("title"),
                t.get("category"),
                t.get("completed_at"),
                t.get("duration_min", 0),
                t.get("priority"),
            ]
        )

    # 3. Pending Sheet
    ws_pending = wb.create_sheet(title="Pending Tasks")
    ws_pending.freeze_panes = "A2"
    ws_pending.append(["Title", "Category", "Deadline", "Priority"])
    for cell in ws_pending[1]:
        cell.font = header_font
        cell.fill = header_fill

    for t in facts.get("pending_tasks", []):
        ws_pending.append(
            [
                t.get("title"),
                t.get("category"),
                t.get("deadline_at"),
                t.get("priority"),
            ]
        )

    # 4. Time by Category Sheet
    ws_cat = wb.create_sheet(title="Time by Category")
    ws_cat.freeze_panes = "A2"
    ws_cat.append(["Category", "Total Minutes"])
    for cell in ws_cat[1]:
        cell.font = header_font
        cell.fill = header_fill

    for cat, mins in facts.get("time_by_category", {}).items():
        ws_cat.append([cat, mins])

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def render_html_viewer(
    facts: dict[str, Any],
    recipient_label: str = "Client",
    expires_at_str: str = "",
    scope: list[str] | None = None,
) -> str:
    """Render responsive, accessible server-side HTML report for public links (doc 10 §6)."""
    scope_display = "Professional Only" if scope and "personal" not in scope else "Full Scope"
    summary = facts.get("summary", {})

    rows_html = ""
    for t in facts.get("completed_tasks", []):
        rows_html += f"""
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{t.get("title")}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{t.get("category")}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{t.get("duration_min", 0)} min</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{t.get("priority")}</td>
        </tr>
        """

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ALIBI Verified Report — {recipient_label}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }}
        .card {{ background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 800px; margin: 0 auto; overflow: hidden; }}
        .header {{ background: #0f172a; color: #ffffff; padding: 24px; }}
        .badge {{ background: #2563eb; color: #ffffff; padding: 4px 8px; border-radius: 6px; font-size: 12px; text-transform: uppercase; font-weight: bold; }}
        .content {{ padding: 24px; }}
        .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin: 20px 0; }}
        .tile {{ background: #f1f5f9; padding: 16px; border-radius: 8px; text-align: center; }}
        .tile-value {{ font-size: 24px; font-weight: bold; color: #0f172a; }}
        .tile-label {{ font-size: 12px; color: #64748b; margin-top: 4px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 16px; text-align: left; }}
        th {{ background: #f8fafc; padding: 10px; border-bottom: 2px solid #cbd5e1; font-size: 13px; color: #475569; }}
        .footer {{ padding: 16px 24px; background: #f1f5f9; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <span class="badge">{scope_display}</span>
            <h1 style="margin: 12px 0 4px 0; font-size: 24px;">ALIBI Activity Report</h1>
            <p style="margin: 0; color: #94a3b8; font-size: 14px;">Prepared for: <strong>{recipient_label}</strong> · {facts.get("period_start")} to {facts.get("period_end")}</p>
        </div>
        <div class="content">
            <div class="grid">
                <div class="tile">
                    <div class="tile-value">{summary.get("completed_count", 0)}</div>
                    <div class="tile-label">Completed Tasks</div>
                </div>
                <div class="tile">
                    <div class="tile-value">{summary.get("total_time_hours", 0.0)}h</div>
                    <div class="tile-label">Time Logged</div>
                </div>
                <div class="tile">
                    <div class="tile-value">{summary.get("pending_count", 0)}</div>
                    <div class="tile-label">Pending Tasks</div>
                </div>
            </div>

            <h2 style="font-size: 18px; margin-top: 28px;">Completed Accomplishments</h2>
            <table>
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Category</th>
                        <th>Duration</th>
                        <th>Priority</th>
                    </tr>
                </thead>
                <tbody>
                    {rows_html if rows_html else '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #64748b;">No completed tasks in this period.</td></tr>'}
                </tbody>
            </table>
        </div>
        <div class="footer">
            Verified report snapshot generated by ALIBI · Expires: {expires_at_str or "Never"}
        </div>
    </div>
</body>
</html>
"""
    return html
