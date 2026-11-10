from __future__ import annotations

import re
from typing import Any

import fitz  # type: ignore[import-untyped]  # PyMuPDF ships without type stubs.

_WHITESPACE = re.compile(r"\s+")
_QUOTE_MAP = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2014": "-",
        "\u2013": "-",
        "\u00a0": " ",
    }
)


def normalize_text(value: str) -> str:
    """Lowercase and collapse whitespace so a citation can be matched to a page."""
    cleaned = value.translate(_QUOTE_MAP)
    return _WHITESPACE.sub(" ", cleaned).strip().lower()


def excerpt_on_page(page_text: str, excerpt: str) -> bool:
    """True when the excerpt is a contiguous span of the page after normalization."""
    needle = normalize_text(excerpt)
    haystack = normalize_text(page_text)
    if not needle or not haystack:
        return False
    return needle in haystack


def read_pages(file_path: str) -> list[str]:
    """Extract text per page. Index 0 is page 1."""
    document: Any = fitz.open(file_path)
    try:
        pages: list[str] = []
        for index in range(len(document)):
            page: Any = document[index]
            raw: Any = page.get_text()
            pages.append(raw if isinstance(raw, str) else "")
        return pages
    finally:
        close = getattr(document, "close", None)
        if callable(close):
            close()


# A one- or two-word span such as "the Land" is too easy to find by accident.
MIN_EXCERPT_CHARS = 20
MIN_EXCERPT_WORDS = 4


def excerpt_is_substantive(excerpt: str) -> bool:
    """True when the quote is long enough to identify a passage."""
    needle = normalize_text(excerpt)
    if len(needle) < MIN_EXCERPT_CHARS:
        return False
    return len(needle.split()) >= MIN_EXCERPT_WORDS


def locate_excerpt(pages: list[str], excerpt: str, cited_page: int | None) -> int | None:
    """Return the 1-based page that contains the excerpt.

    Prefer the cited page. If the quote is real but the page number is wrong,
    return the page that actually contains it. A quote shorter than a few words
    does not count.
    """
    if not excerpt_is_substantive(excerpt):
        return None
    if cited_page is not None and 1 <= cited_page <= len(pages):
        if excerpt_on_page(pages[cited_page - 1], excerpt):
            return cited_page
    for index, page_text in enumerate(pages):
        if excerpt_on_page(page_text, excerpt):
            return index + 1
    return None
