"""Search and download Wikimedia Commons files, recording licence and credit."""
import html
import json
import os
import re

from . import http

API = "https://commons.wikimedia.org/w/api.php"
OPEN_LICENCES = ("public domain", "pd-", "cc0", "cc by", "cc-by", "no restrictions")


HIDDEN = re.compile(r"<(\w+)[^>]*display:\s*none[^>]*>.*?</\1>", re.S)


def _clean(value, limit=120):
    text = HIDDEN.sub("", value or "")
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text).strip()[:limit]


def _meta(imageinfo):
    meta = imageinfo.get("extmetadata", {})
    return {
        "artist": _clean(meta.get("Artist", {}).get("value")),
        "licence": _clean(meta.get("LicenseShortName", {}).get("value"), 60),
        "date": _clean(meta.get("DateTimeOriginal", {}).get("value"), 40),
    }


def licence_ok(licence):
    low = (licence or "").lower()
    if "nc" in re.split(r"[\s-]+", low):
        return False
    return any(tag in low for tag in OPEN_LICENCES)


def search(query, limit=10, get_json=http.get_json):
    data = get_json(API, {
        "action": "query", "format": "json", "generator": "search",
        "gsrnamespace": "6", "gsrsearch": query, "gsrlimit": str(limit),
        "prop": "imageinfo", "iiprop": "url|extmetadata|size|mime",
    })
    pages = sorted(data.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    results = []
    for page in pages:
        info = page["imageinfo"][0]
        results.append({"title": page["title"], "width": info.get("width"), "height": info.get("height"),
                        "mime": info.get("mime"), "url": info.get("url"), **_meta(info)})
    return results


def record_credit(dest_dir, key, credit):
    path = os.path.join(dest_dir, "credits.json")
    credits = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            credits = json.load(fh)
    credits[key] = credit
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(credits, fh, ensure_ascii=False, indent=1)


def fetch(title, dest_dir, key, max_width=1600, get_json=http.get_json, get_bytes=http.get_bytes):
    data = get_json(API, {"action": "query", "format": "json", "titles": title, "prop": "imageinfo",
                          "iiprop": "url|extmetadata|size|mime", "iiurlwidth": str(max_width)})
    page = next(iter(data["query"]["pages"].values()))
    if "imageinfo" not in page:
        raise FileNotFoundError(title)
    info = page["imageinfo"][0]
    mime = info.get("mime", "")
    if mime == "image/svg+xml":
        url, ext = info["url"], ".svg"
    else:
        url = info["url"] if info.get("width", 0) <= max_width else info.get("thumburl", info["url"])
        ext = ".png" if "png" in mime else ".jpg"
    os.makedirs(dest_dir, exist_ok=True)
    filename = key + ext
    with open(os.path.join(dest_dir, filename), "wb") as fh:
        fh.write(get_bytes(url))
    credit = {"file": filename, "title": title,
              "source": "https://commons.wikimedia.org/wiki/" + title.replace(" ", "_"), **_meta(info)}
    credit["open_licence"] = licence_ok(credit["licence"])
    record_credit(dest_dir, key, credit)
    return credit
