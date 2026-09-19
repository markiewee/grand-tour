from PIL import Image

from grandtour import qa


def test_text_found_keeps_real_words_only(tmp_path):
    img = tmp_path / "p.jpg"
    Image.new("RGB", (30, 40), "white").save(img)
    words = qa.text_found(str(img), ocr=lambda image: "HOTEL x 12 Métropole ~~")
    assert words == ["HOTEL", "Métropole"]


def test_text_found_returns_none_without_ocr(tmp_path, monkeypatch):
    img = tmp_path / "p.jpg"
    Image.new("RGB", (30, 40), "white").save(img)
    monkeypatch.setattr(qa, "_default_ocr", lambda: None)
    assert qa.text_found(str(img)) is None


def test_contact_sheet_size(tmp_path):
    paths = []
    for i in range(5):
        p = tmp_path / f"{i}.jpg"
        Image.new("RGB", (300, 400), "red").save(p)
        paths.append(str(p))
    out = qa.contact_sheet(paths, str(tmp_path / "sheet.jpg"), cell=(150, 200), columns=4)
    assert Image.open(out).size == (600, 448)
