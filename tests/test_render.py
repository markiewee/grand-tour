import os

import pytest

from grandtour import render

TEMPLATE = os.path.join(os.path.dirname(__file__), "..", "templates", "day.html")
DAY = {"number": 2, "title": "Hà Nội", "date": "Saturday 26 September", "poster": "art/day2/hoankiem.jpg",
       "poster_alt": "The bridge and the turtle", "caption": "The returned sword",
       "history": "Lê Lợi gave the sword back.",
       "rows": [{"time": "12:00", "what": "Bún chả & beer", "detail": "Cash <only>", "tag": "ok", "tag_label": "Booked"}]}


def test_row_html_escapes_text():
    row = render.row_html(DAY["rows"][0])
    assert "Bún chả &amp; beer" in row and "Cash &lt;only&gt;" in row
    assert '<span class="tag ok">Booked</span>' in row


def test_render_day_fills_every_placeholder(tmp_path):
    out = render.render_day(DAY, TEMPLATE, str(tmp_path / "day2.html"))
    page = open(out, encoding="utf-8").read()
    assert "Hà Nội" in page and "art/day2/hoankiem.jpg" in page and "Lê Lợi gave the sword back." in page
    assert "$" not in page


def test_to_pdf_calls_headless_chrome(tmp_path):
    calls = []
    render.to_pdf(str(tmp_path / "d.html"), str(tmp_path / "d.pdf"), chrome="/bin/chrome",
                  run=lambda cmd, **kw: calls.append(cmd))
    cmd = calls[0]
    assert cmd[0] == "/bin/chrome" and "--headless=new" in cmd and "--no-pdf-header-footer" in cmd
    assert cmd[-1].startswith("file://") and any(a.startswith("--print-to-pdf=") for a in cmd)


def test_find_chrome_raises_when_missing(monkeypatch):
    monkeypatch.setattr(render.os.path, "exists", lambda p: False)
    monkeypatch.setattr(render.shutil, "which", lambda name: None)
    with pytest.raises(FileNotFoundError):
        render.find_chrome()
