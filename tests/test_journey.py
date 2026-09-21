import json
import os
import re
import shutil
from pathlib import Path

import pytest

from adventure import journey, theme
from adventure.__main__ import ENGINE

TEMPLATE = os.path.join(os.path.dirname(__file__), "..", "templates", "journey")
EXAMPLE = os.path.join(os.path.dirname(__file__), "..", "templates", "trip.example.json")

MIDNIGHT = {"at": "2027-04-04T00:00:00+09:00", "title": "Happy birthday, Ren",
            "dayLabel": "Sunday 4 April · Kyoto", "closes": "2027-04-03T23:59:00+09:00"}
LETTERBOX = {"title": "A letterbox for Ren", "intro": "Leave a letter.",
             "placeholder": "Dear Ren", "sealed": "It opens at midnight in Kyoto"}


def a_journey(journey_over=None, stops=None):
    data = {
        "journey": {
            "title": "The Paper Road", "for": "Ren", "from": "Kai", "tz": "Asia/Tokyo",
            "tzCity": "Kyoto", "subtitle": "Japan · 2 to 5 April",
            "opening": "Ten sealed envelopes between Osaka and Kyoto.",
        },
        "stops": stops if stops is not None else [
            {"id": "kix", "n": 1, "day": 1, "opensAt": "2027-04-02T09:40:00+08:00",
             "place": "Changi Airport", "city": "Singapore",
             "geo": {"lat": 1.3592, "lng": 103.9894, "r": 400},
             "lede": "Three lines about the place.", "question": "What did you pack last?",
             "caption": "One line about the poster.", "poster": "kix"},
            {"id": "gion", "n": 2, "day": 2, "opensAt": "2027-04-03T18:00:00+09:00",
             "place": "Gion", "city": "Kyoto",
             "geo": {"lat": 35.0037, "lng": 135.7788, "r": 300},
             "lede": "Three lines about the place.", "caption": "One line.", "poster": "gion"},
            {"id": "book", "n": 3, "day": 4, "opensAt": "2027-04-05T11:00:00+09:00",
             "place": "The way home", "city": "Kyoto", "kind": "book"},
        ],
    }
    data["journey"].update(journey_over or {})
    return data


def a_dir(tmp_path, data, posters=("kix", "gion")):
    """The smallest thing check will look at: a trip file, the posters it names, and a theme.

    A journey app with no theme has no pictures and no words, so check calls that an error. The
    fixture dresses it in the default one rather than asking check to overlook it."""
    app = tmp_path / "app"
    (app / "public" / "data").mkdir(parents=True, exist_ok=True)
    (app / "public" / "img" / "posters").mkdir(parents=True, exist_ok=True)
    (app / "public" / "data" / "trip.json").write_text(json.dumps(data), "utf-8")
    for name in posters:
        (app / "public" / "img" / "posters" / f"{name}.jpg").write_bytes(b"jpg")
    theme.apply_to(app, "lantern-night")
    return app


def an_app(tmp_path, data, posters=("kix", "gion")):
    """A copy of the real engine, for the parts of build that touch the pages it ships."""
    app = tmp_path / "app"
    shutil.copytree(TEMPLATE, app, ignore=shutil.ignore_patterns("node_modules", ".vercel", "data"))
    (app / "public" / "data").mkdir(parents=True, exist_ok=True)
    (app / "public" / "img" / "posters").mkdir(parents=True, exist_ok=True)
    (app / "public" / "data" / "trip.json").write_text(json.dumps(data), "utf-8")
    for name in posters:
        (app / "public" / "img" / "posters" / f"{name}.jpg").write_bytes(b"jpg")
    theme.apply_to(app, "lantern-night")
    return app


def test_check_passes_on_a_good_journey(tmp_path):
    report = journey.check(a_dir(tmp_path, a_journey()))
    assert report["errors"] == []


def test_check_names_the_stop_with_no_time(tmp_path):
    data = a_journey()
    del data["stops"][1]["opensAt"]
    errors = journey.check(a_dir(tmp_path, data))["errors"]
    assert any("gion" in e and "opensAt" in e for e in errors)


def test_check_rejects_a_letterbox_with_no_midnight(tmp_path):
    data = a_journey({"letterbox": LETTERBOX})
    errors = journey.check(a_dir(tmp_path, data))["errors"]
    assert any("letterbox" in e and "midnight" in e for e in errors)
    assert journey.check(a_dir(tmp_path, a_journey({"letterbox": LETTERBOX, "midnight": MIDNIGHT})))["errors"] == []


def test_check_rejects_duplicate_ids(tmp_path):
    data = a_journey()
    data["stops"][1]["id"] = "kix"
    errors = journey.check(a_dir(tmp_path, data))["errors"]
    assert any("kix" in e and "twice" in e for e in errors)


def test_check_rejects_stops_out_of_order(tmp_path):
    data = a_journey()
    data["stops"][0], data["stops"][1] = data["stops"][1], data["stops"][0]
    errors = journey.check(a_dir(tmp_path, data))["errors"]
    assert any("kix" in e and "before" in e for e in errors)


def test_check_rejects_an_id_the_api_would_refuse(tmp_path):
    data = a_journey()
    data["stops"][1]["id"] = "Gion-2"
    errors = journey.check(a_dir(tmp_path, data))["errors"]
    assert any("Gion-2" in e for e in errors)


def test_check_rejects_a_missing_poster_file(tmp_path):
    errors = journey.check(a_dir(tmp_path, a_journey(), posters=("kix",)))["errors"]
    assert any("gion" in e and "posters" in e for e in errors)


def test_check_rejects_a_time_with_no_offset(tmp_path):
    data = a_journey()
    data["stops"][1]["opensAt"] = "2027-04-03T18:00:00"
    errors = journey.check(a_dir(tmp_path, data))["errors"]
    assert any("gion" in e and "offset" in e for e in errors)


def test_check_warns_about_a_stop_with_no_poster(tmp_path):
    data = a_journey()
    del data["stops"][1]["poster"]
    report = journey.check(a_dir(tmp_path, data), )
    assert report["errors"] == []
    assert any("gion" in w and "poster" in w for w in report["warnings"])


def test_check_warns_about_a_thin_journey(tmp_path):
    data = a_journey(stops=[{"id": "kix", "n": 1, "day": 1, "place": "Changi Airport",
                             "opensAt": "2027-04-02T09:40:00+08:00"}])
    report = journey.check(a_dir(tmp_path, data))
    assert report["errors"] == []
    joined = " ".join(report["warnings"])
    assert "question" in joined and "geo" in joined and "3 stops" in joined


def test_build_writes_the_api_config_with_epoch_milliseconds(tmp_path):
    app = an_app(tmp_path, a_journey({"midnight": MIDNIGHT, "letterbox": LETTERBOX}))
    journey.build(app)
    written = (app / "api" / "_journey.js").read_text("utf-8")
    assert "export const MIDNIGHT_MS = 1806764400000;" in written
    assert "export const LETTERS_CLOSE_MS = 1806764340000;" in written
    assert "export const HAS_LETTERBOX = true;" in written


def test_build_writes_null_when_there_is_no_midnight(tmp_path):
    app = an_app(tmp_path, a_journey())
    journey.build(app)
    written = (app / "api" / "_journey.js").read_text("utf-8")
    assert "export const MIDNIGHT_MS = null;" in written
    assert "export const LETTERS_CLOSE_MS = null;" in written
    assert "export const HAS_LETTERBOX = false;" in written


def test_build_writes_the_meta_block_and_repeats_byte_for_byte(tmp_path):
    app = an_app(tmp_path, a_journey({"midnight": MIDNIGHT, "letterbox": LETTERBOX}))
    journey.build(app)
    index = app / "public" / "index.html"
    page = index.read_text("utf-8")
    assert "<!-- ga:meta -->" in page and "<!-- /ga:meta -->" in page
    block = page.split("<!-- ga:meta -->")[1].split("<!-- /ga:meta -->")[0]
    assert "<title>The Paper Road</title>" in block
    assert 'content="noindex, nofollow"' in block
    assert "Ten sealed envelopes between Osaka and Kyoto." in block
    letters = (app / "public" / "letterbox.html").read_text("utf-8")
    assert "A letterbox for Ren" in letters.split("<!-- ga:meta -->")[1]

    before = {p: (app / p).read_bytes() for p in
              ("api/_journey.js", "public/index.html", "public/letterbox.html", "public/precache.json")}
    journey.build(app)
    assert {p: (app / p).read_bytes() for p in before} == before


def test_build_keeps_hand_edits_outside_the_markers(tmp_path):
    app = an_app(tmp_path, a_journey())
    journey.build(app)
    index = app / "public" / "index.html"
    index.write_text(index.read_text("utf-8").replace("</head>", '<meta name="by-hand" content="1">\n</head>'), "utf-8")
    journey.build(app)
    page = index.read_text("utf-8")
    assert 'name="by-hand"' in page
    assert page.count("<!-- ga:meta -->") == 1


def test_build_refuses_a_journey_with_errors(tmp_path):
    data = a_journey()
    data["stops"][1]["id"] = "kix"
    app = an_app(tmp_path, data)
    untouched = {p: (app / p).read_bytes() for p in ("api/_journey.js", "public/index.html", "public/precache.json")}
    with pytest.raises(ValueError) as caught:
        journey.build(app)
    assert "kix" in str(caught.value)
    assert {p: (app / p).read_bytes() for p in untouched} == untouched


def test_build_precache_lists_the_app_and_leaves_out_the_service_worker(tmp_path):
    app = an_app(tmp_path, a_journey())
    journey.build(app)
    listed = json.loads((app / "public" / "precache.json").read_text("utf-8"))
    assert "index.html" in listed
    assert "js/app.js" in listed
    assert "data/trip.json" in listed
    assert "sw.js" not in listed
    assert "precache.json" not in listed
    assert listed == sorted(listed)


def test_build_writes_the_app_label_back_into_the_journey(tmp_path):
    app = an_app(tmp_path, a_journey())
    journey.build(app)
    data = json.loads((app / "public" / "data" / "trip.json").read_text("utf-8"))
    assert data["journey"]["appLabel"] == "Ren's app"


def test_new_refuses_a_destination_that_is_not_empty(tmp_path):
    dest = tmp_path / "taken"
    dest.mkdir()
    (dest / "something.txt").write_text("mine", "utf-8")
    with pytest.raises(FileExistsError):
        journey.new(TEMPLATE, dest)


def test_new_copies_the_engine_without_its_workings(tmp_path):
    dest = tmp_path / "fresh"
    assert journey.new(TEMPLATE, dest) == dest
    assert (dest / "public" / "js" / "app.js").exists()
    assert (dest / ".gitignore").exists()
    assert not (dest / "node_modules").exists()
    assert not (dest / ".vercel").exists()


def test_new_drafts_a_stop_for_every_activity(tmp_path):
    dest = tmp_path / "drafted"
    journey.new(TEMPLATE, dest, EXAMPLE)
    data = json.loads((dest / "public" / "data" / "trip.json").read_text("utf-8"))
    ids = [s["id"] for s in data["stops"]]
    assert ids == ["xx100", "fushimiinari", "kaisekidinner", "book"]
    inari = data["stops"][1]
    assert inari["opensAt"] == "2027-04-03T06:30:00+09:00"
    assert inari["place"] == "Fushimi Inari before the crowds"
    assert inari["city"] == "Kyoto"
    assert inari["day"] == 2
    assert inari["lede"] == "" and inari["question"] == "" and inari["poster"] == ""
    assert data["stops"][-1]["kind"] == "book"
    assert data["journey"]["for"] == "Traveller One"


def test_build_names_the_cache_after_its_contents(tmp_path):
    app = an_app(tmp_path, a_journey())
    journey.build(app)
    first = (app / "public" / "sw.js").read_text("utf-8")
    assert re.search(r"const V = 'ga-[0-9a-f]{12}';", first)

    journey.build(app)
    assert (app / "public" / "sw.js").read_text("utf-8") == first, "a second build must not move it"

    poster = app / "public" / "img" / "posters" / "changed.jpg"
    poster.parent.mkdir(parents=True, exist_ok=True)
    poster.write_bytes(b"a different poster")
    journey.build(app)
    assert (app / "public" / "sw.js").read_text("utf-8") != first, "a changed file must move it"


def test_check_warns_loudly_about_demo_mode(tmp_path):
    app = a_dir(tmp_path, a_journey({"demo": True}))
    report = journey.check(app)
    assert report["errors"] == []
    assert any("demo" in w for w in report["warnings"])


def test_build_writes_the_demo_flag(tmp_path):
    off = journey.build(an_app(tmp_path / "off", a_journey()))
    assert "export const DEMO = false;" in Path(off["api"]).read_text("utf-8")

    on = journey.build(an_app(tmp_path / "on", a_journey({"demo": True})))
    assert "export const DEMO = true;" in Path(on["api"]).read_text("utf-8")


def test_build_carries_a_demo_journeys_own_letters(tmp_path):
    letters = [{"from": "Mina", "text": "Have a wonderful one."},
               {"from": "Kai", "text": "The eleventh envelope.", "last": True}]
    app = an_app(tmp_path, a_journey({"demo": True, "demoLetters": letters}))
    api = Path(journey.build(app)["api"]).read_text("utf-8")
    assert '"from": "Mina"' in api
    assert '"last": true' in api and '"last": false' in api


def test_a_journey_that_is_not_a_demo_carries_no_letters(tmp_path):
    letters = [{"from": "Mina", "text": "Have a wonderful one."}]
    app = an_app(tmp_path, a_journey({"demoLetters": letters}))
    api = Path(journey.build(app)["api"]).read_text("utf-8")
    assert "export const DEMO_LETTERS = [];" in api
    assert "Mina" not in api


def test_build_names_the_home_screen_icon(tmp_path):
    app = an_app(tmp_path, a_journey({"title": "The Paper Road"}))
    journey.build(app)
    m = json.loads((app / "public" / "manifest.webmanifest").read_text("utf-8"))
    assert m["name"] == "The Paper Road"
    assert len(m["short_name"]) <= 12


def test_the_short_name_drops_the_article_and_cuts_on_a_word(tmp_path):
    for title, want in [("The Paper Road", "Paper Road"),
                        ("Road", "Road"),
                        ("The Long Way Round Again", "Long Way")]:
        app = an_app(tmp_path / title.replace(" ", "_"), a_journey({"title": title}))
        journey.build(app)
        m = json.loads((app / "public" / "manifest.webmanifest").read_text("utf-8"))
        assert m["short_name"] == want, f"{title} became {m['short_name']}"


def test_new_copies_the_theme_art_and_writes_the_generated_files(tmp_path):
    app = journey.new(ENGINE, tmp_path / "app", theme_name="kyoto-woodblock")
    art = app / "public" / "img" / "art"
    assert (art / "rise.png").exists()
    assert not (art / "crane.png").exists()
    assert (app / "public" / "css" / "theme.css").read_text().count("--night:") == 1
    words = json.loads((app / "public" / "data" / "theme.json").read_text())
    assert words["copy"]["send"] == "Send it up as a crane"
    assert words["rise"]["many"] == "cranes"


def test_retheme_swaps_the_art_and_the_words(tmp_path):
    app = journey.new(ENGINE, tmp_path / "app", theme_name="kyoto-woodblock")
    journey.retheme(app, "canyon-ember")
    words = json.loads((app / "public" / "data" / "theme.json").read_text())
    assert words["copy"]["send"] == "Send it up as an ember"


def test_retheme_refuses_a_journey_that_has_been_opened(tmp_path):
    """The evidence is the rehearsal server's own log, which is the only record of a journey
    having begun that lives on disk rather than on the traveller's phone."""
    app = journey.new(ENGINE, tmp_path / "app", theme_name="kyoto-woodblock")
    log = app / "data" / "events.json"
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(json.dumps([{"id": "inari", "type": "opened", "at": 1}]), encoding="utf-8")
    with pytest.raises(ValueError, match="opened"):
        journey.retheme(app, "canyon-ember")


def test_retheme_goes_ahead_when_forced_and_still_says_why_not_to(tmp_path):
    app = journey.new(ENGINE, tmp_path / "app", theme_name="kyoto-woodblock")
    log = app / "data" / "events.json"
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(json.dumps([{"id": "inari", "type": "answered", "at": 1}]), encoding="utf-8")
    out = journey.retheme(app, "canyon-ember", force=True)
    assert out["opened"] == 1
    assert "cannot see" in out["caution"]
    words = json.loads((app / "public" / "data" / "theme.json").read_text(encoding="utf-8"))
    assert words["copy"]["send"] == "Send it up as an ember"


def test_retheme_cautions_even_when_nothing_looks_travelled(tmp_path):
    """The log only records what the rehearsal server saw. A deployed journey's events live in a
    file store this command cannot read, so the warning goes out every time."""
    app = journey.new(ENGINE, tmp_path / "app", theme_name="kyoto-woodblock")
    out = journey.retheme(app, "canyon-ember")
    assert out["opened"] == 0
    assert "cannot see" in out["caution"]


def test_check_fails_on_a_missing_art_file(tmp_path):
    app = journey.new(ENGINE, tmp_path / "app", theme_name="kyoto-woodblock")
    (app / "public" / "img" / "art" / "moon.jpg").unlink()
    assert any("moon.jpg" in e for e in journey.check(app)["errors"])


def test_check_fails_on_art_of_the_wrong_size(tmp_path):
    from PIL import Image
    app = journey.new(ENGINE, tmp_path / "app", theme_name="kyoto-woodblock")
    Image.new("RGB", (10, 10)).save(app / "public" / "img" / "art" / "sky.jpg")
    assert any("sky.jpg" in e and "768" in e for e in journey.check(app)["errors"])


def test_check_fails_on_a_missing_word(tmp_path):
    app = journey.new(ENGINE, tmp_path / "app", theme_name="kyoto-woodblock")
    path = app / "public" / "data" / "theme.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["copy"].pop("send")
    path.write_text(json.dumps(data), encoding="utf-8")
    assert any("send" in e for e in journey.check(app)["errors"])


def test_check_fails_on_unreadable_contrast(tmp_path):
    app = journey.new(ENGINE, tmp_path / "app", theme_name="kyoto-woodblock")
    css = app / "public" / "css" / "theme.css"
    css.write_text(css.read_text(encoding="utf-8").replace("--ivory: #efe8d2;", "--ivory: #1a2740;"),
                   encoding="utf-8")
    assert any("contrast" in e for e in journey.check(app)["errors"])


def test_a_freshly_themed_app_passes_the_theme_checks(tmp_path):
    """The three shipped themes have to survive their own checks, or nobody can ship one."""
    for name in ("lantern-night", "kyoto-woodblock", "canyon-ember"):
        app = journey.new(ENGINE, tmp_path / name, theme_name=name)
        assert journey.check(app)["errors"] == [], name


def test_check_fails_when_the_stylesheet_is_missing(tmp_path):
    app = journey.new(ENGINE, tmp_path / "app", theme_name="kyoto-woodblock")
    (app / "public" / "css" / "theme.css").unlink()
    assert any("theme.css" in e for e in journey.check(app)["errors"])


def test_new_refuses_a_theme_that_has_not_been_drawn_yet_and_leaves_nothing_behind(tmp_path):
    half = theme.new("harbour-dusk", tmp_path / "harbour-dusk")
    dest = tmp_path / "app"
    with pytest.raises(FileNotFoundError, match="sky.jpg"):
        journey.new(ENGINE, dest, theme_name=half)
    assert not dest.exists(), "a refused scaffold must not leave a directory it cannot reuse"
