"""Text chunking for Knowledge Vault items (doc 08 §1).

Chunks ~400 tokens (~1600 characters) with 15% overlap (~240 chars),
preserving paragraph and sentence boundaries where possible.
Prefixes each chunk with metadata header:
[{source_type}] {title} — {date} — {category}/{project}
"""

import re
from typing import NamedTuple


class TextChunk(NamedTuple):
    chunk_index: int
    content: str
    char_start: int
    char_end: int


def chunk_text(
    text: str,
    title: str,
    source_type: str,
    occurred_on_str: str,
    category_name: str | None = None,
    project_name: str | None = None,
    target_chars: int = 1600,
    overlap_chars: int = 240,
) -> list[TextChunk]:
    """Split text into overlapping chunks prefixed with metadata context header."""
    header_parts = [f"[{source_type}]", title, "—", occurred_on_str]
    cat_proj = []
    if category_name:
        cat_proj.append(category_name)
    if project_name:
        cat_proj.append(project_name)
    if cat_proj:
        header_parts.extend(["—", "/".join(cat_proj)])

    header = " ".join(header_parts).strip() + "\n\n"

    clean_text = text.strip()
    if not clean_text:
        return [TextChunk(chunk_index=0, content=header.strip(), char_start=0, char_end=0)]

    # Short notes (under target_chars) stay as 1 chunk
    if len(clean_text) <= target_chars:
        return [
            TextChunk(
                chunk_index=0,
                content=header + clean_text,
                char_start=0,
                char_end=len(clean_text),
            )
        ]

    # Split into paragraphs or sentences
    paragraphs = re.split(r"(\n\s*\n)", clean_text)
    units: list[str] = []
    for p in paragraphs:
        if not p.strip():
            continue
        if len(p) > target_chars:
            # Further split by sentence
            sentences = re.split(r"(?<=[.!?])\s+", p)
            units.extend([s for s in sentences if s.strip()])
        else:
            units.append(p)

    chunks: list[TextChunk] = []
    current_unit_idx = 0
    chunk_idx = 0

    while current_unit_idx < len(units):
        current_chunk_parts: list[str] = []
        current_len = 0
        start_idx = current_unit_idx

        while current_unit_idx < len(units):
            unit = units[current_unit_idx]
            if current_len + len(unit) > target_chars and current_chunk_parts:
                break
            current_chunk_parts.append(unit)
            current_len += len(unit)
            current_unit_idx += 1

        chunk_body = "\n\n".join(current_chunk_parts).strip()
        chunks.append(
            TextChunk(
                chunk_index=chunk_idx,
                content=header + chunk_body,
                char_start=0,
                char_end=len(chunk_body),
            )
        )
        chunk_idx += 1

        # Step back for overlap
        if current_unit_idx < len(units):
            overlap_accum = 0
            while current_unit_idx > start_idx + 1:
                current_unit_idx -= 1
                overlap_accum += len(units[current_unit_idx])
                if overlap_accum >= overlap_chars:
                    break

    return chunks
