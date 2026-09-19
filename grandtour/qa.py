"""Checks for generated art: stray lettering and contact sheets for a quick look."""
import os
import re

from PIL import Image, ImageDraw


def _default_ocr():
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
    except Exception:
        return None
    return pytesseract.image_to_string


def text_found(image_path, min_letters=3, ocr=None):
    """Words OCR can read in the image, or None when OCR is not installed.

    OCR misreads textures as letters now and then, so a hit means look closer, not reject.
    """
    ocr = ocr or _default_ocr()
    if ocr is None:
        return None
    raw = ocr(Image.open(image_path))
    return [word for word in re.findall(r"[^\W\d_]+", raw) if len(word) >= min_letters]


def contact_sheet(paths, out_path, cell=(300, 400), columns=4):
    rows = (len(paths) + columns - 1) // columns
    sheet = Image.new("RGB", (cell[0] * columns, (cell[1] + 24) * rows), "white")
    draw = ImageDraw.Draw(sheet)
    for i, path in enumerate(paths):
        img = Image.open(path).convert("RGB")
        img.thumbnail(cell)
        x, y = (i % columns) * cell[0], (i // columns) * (cell[1] + 24)
        sheet.paste(img, (x, y))
        draw.text((x + 4, y + cell[1] + 4), os.path.basename(path)[:40], fill="black")
    sheet.save(out_path, quality=85)
    return out_path
