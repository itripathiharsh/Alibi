"""Reports and Sharing package (doc 10 §5–6)."""

from app.reports.facts import ReportFactBuilder, compute_facts_hash
from app.reports.renderers import render_csv, render_html_viewer, render_xlsx
from app.reports.share_service import ReportShareService

__all__ = [
    "ReportFactBuilder",
    "compute_facts_hash",
    "render_csv",
    "render_xlsx",
    "render_html_viewer",
    "ReportShareService",
]
