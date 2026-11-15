"""Unit tests for Knowledge Vault chunking (doc 08 §1)."""

from app.vault.chunking import chunk_text


def test_short_note_produces_single_chunk_with_header() -> None:
    text = "Implemented the database schema and created the initial migration."
    chunks = chunk_text(
        text=text,
        title="DB Migration Done",
        source_type="task_description",
        occurred_on_str="2026-11-16",
        category_name="Engineering",
        project_name="ALIBI",
    )

    assert len(chunks) == 1
    chunk = chunks[0]
    assert chunk.chunk_index == 0
    assert "[task_description] DB Migration Done — 2026-11-16 — Engineering/ALIBI" in chunk.content
    assert text in chunk.content


def test_long_note_splits_with_overlap() -> None:
    # 2500 character text
    paragraph_1 = "Alpha sentence one. Alpha sentence two. Alpha sentence three. " * 15
    paragraph_2 = "Beta sentence one. Beta sentence two. Beta sentence three. " * 15
    text = f"{paragraph_1}\n\n{paragraph_2}"

    chunks = chunk_text(
        text=text,
        title="Long Architecture Document",
        source_type="document",
        occurred_on_str="2026-11-16",
        target_chars=500,
        overlap_chars=100,
    )

    assert len(chunks) >= 2
    for i, c in enumerate(chunks):
        assert c.chunk_index == i
        assert "[document] Long Architecture Document — 2026-11-16" in c.content
