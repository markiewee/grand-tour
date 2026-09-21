"""Fill the day-page template and print pages to PDF with headless Chrome."""
import html
import os
import shutil
import string
import subprocess

CHROME_CANDIDATES = (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
)


def find_chrome():
    for candidate in CHROME_CANDIDATES:
        if os.path.isabs(candidate):
            if os.path.exists(candidate):
                return candidate
            continue
        found = shutil.which(candidate)
        if found:
            return found
    raise FileNotFoundError("Google Chrome or Chromium is needed to print PDFs")


def row_html(row):
    if row.get("tag"):
        tag = f'<span class="tag {html.escape(row["tag"])}">{html.escape(row.get("tag_label", row["tag"]))}</span>'
    else:
        tag = "<span></span>"
    return ('<div class="row"><span class="t">{t}</span><div><div class="what">{what}</div>'
            '<div class="det">{det}</div></div>{tag}</div>').format(
        t=html.escape(row.get("time", "")), what=html.escape(row["what"]),
        det=html.escape(row.get("detail", "")), tag=tag)


def render_day(day, template_path, out_path, theme=None):
    """Fill one day's page. The theme is written into the page rather than linked, so a guide
    printed to PDF carries its own colours and does not depend on a stylesheet beside it."""
    from . import theme as theme_mod
    loaded = theme if theme is not None else theme_mod.load("lantern-night")
    with open(template_path, encoding="utf-8") as fh:
        template = string.Template(fh.read())
    page = template.substitute(
        theme_css=theme_mod.css(loaded),
        title=html.escape(day["title"]), day_number=str(day["number"]), date=html.escape(day["date"]),
        poster=html.escape(day["poster"]), poster_alt=html.escape(day.get("poster_alt", "")),
        caption=html.escape(day.get("caption", "")), history=html.escape(day.get("history", "")),
        rows="\n".join(row_html(row) for row in day.get("rows", [])))
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(page)
    return out_path


def to_pdf(html_path, pdf_path, chrome=None, run=subprocess.run):
    chrome = chrome or find_chrome()
    cmd = [chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
           "--virtual-time-budget=20000", f"--print-to-pdf={os.path.abspath(pdf_path)}",
           "file://" + os.path.abspath(html_path)]
    run(cmd, check=True, capture_output=True)
    return pdf_path
