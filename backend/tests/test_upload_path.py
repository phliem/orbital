"""Uploaded PDFs stay inside the upload directory."""

from __future__ import annotations

from pathlib import Path

from takehome.config import settings
from takehome.services.document import is_stored_upload, upload_destination


def test_a_parent_directory_in_the_filename_cannot_escape(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    path = Path(upload_destination("../../etc/cron.d/evil.pdf"))
    assert path.parent == tmp_path
    assert path.name.endswith("evil.pdf")
    assert ".." not in path.name
    assert is_stored_upload(str(path))
    assert not is_stored_upload(str(tmp_path.parent / "outside.pdf"))
