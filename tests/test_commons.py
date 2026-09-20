import json

from adventure import commons

SEARCH_PAYLOAD = {"query": {"pages": {
    "2": {"index": 2, "title": "File:B.jpg", "imageinfo": [{"width": 800, "height": 600, "mime": "image/jpeg",
          "url": "https://u/B.jpg", "extmetadata": {"LicenseShortName": {"value": "CC BY-SA 4.0"}}}]},
    "1": {"index": 1, "title": "File:A.jpg", "imageinfo": [{"width": 3000, "height": 2000, "mime": "image/jpeg",
          "url": "https://u/A.jpg", "extmetadata": {"Artist": {"value": "<a href='x'>Léon Busy</a>"},
          "LicenseShortName": {"value": "Public domain"}, "DateTimeOriginal": {"value": "1915"}}}]},
}}}


def test_search_orders_by_rank_and_cleans_metadata():
    results = commons.search("hanoi 1915", get_json=lambda url, params: SEARCH_PAYLOAD)
    assert [r["title"] for r in results] == ["File:A.jpg", "File:B.jpg"]
    assert results[0]["artist"] == "Léon Busy"
    assert results[0]["licence"] == "Public domain"


def test_fetch_uses_thumbnail_when_wider_than_max_and_records_credit(tmp_path):
    payload = {"query": {"pages": {"1": {"title": "File:A.jpg", "imageinfo": [{
        "width": 3000, "height": 2000, "mime": "image/jpeg", "url": "https://u/A.jpg",
        "thumburl": "https://u/thumb/A.jpg", "extmetadata": {"LicenseShortName": {"value": "Public domain"}}}]}}}}
    fetched = []

    def get_bytes(url):
        fetched.append(url)
        return b"JPEGDATA"

    credit = commons.fetch("File:A.jpg", str(tmp_path), "thehuc_1915",
                           get_json=lambda url, params: payload, get_bytes=get_bytes)
    assert fetched == ["https://u/thumb/A.jpg"]
    assert (tmp_path / "thehuc_1915.jpg").read_bytes() == b"JPEGDATA"
    saved = json.loads((tmp_path / "credits.json").read_text(encoding="utf-8"))
    assert saved["thehuc_1915"]["licence"] == "Public domain"
    assert saved["thehuc_1915"]["open_licence"] is True
    assert credit["source"] == "https://commons.wikimedia.org/wiki/File:A.jpg"


def test_licence_ok():
    assert commons.licence_ok("Public domain")
    assert commons.licence_ok("CC BY-SA 4.0")
    assert commons.licence_ok("CC0")
    assert not commons.licence_ok("CC BY-NC 2.0")
    assert not commons.licence_ok("All rights reserved")


def test_clean_drops_hidden_wikidata_markup():
    raw = 'between 1 July 1915 and 31 August 1915<div style="display: none;">date QS:P571,+1915</div>'
    assert commons._clean(raw) == "between 1 July 1915 and 31 August 1915"
