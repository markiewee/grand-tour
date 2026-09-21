"""Build an interactive journey: check the file, scaffold the app, write what the browser cannot.

A journey is one JSON file at public/data/trip.json inside an app directory. Three things have
to be decided before the browser starts, so they are generated here and committed:

    api/_journey.js      the midnight moment, which the API gates the letters on
    public/*.html        the social tags, which a link preview reads before any script runs
    public/precache.json the offline list, which the service worker installs from
"""
import datetime as dt
import hashlib
import html
import json
import re
import shutil
import unicodedata
import zoneinfo
from pathlib import Path

# api/events.js turns away any other shape of id, so a stop it cannot post is a stop that opens
# without the sender ever knowing it did.
ID = re.compile(r"^[a-z0-9]{1,24}$")
OPEN, CLOSE = "<!-- ga:meta -->", "<!-- /ga:meta -->"
BLOCK = re.compile(re.escape(OPEN) + ".*?" + re.escape(CLOSE), re.S)
HEAD = re.compile(r"</head>", re.I)

API = """\
// Written by `python3 -m adventure journey build`. Do not edit by hand: any change here is
// overwritten the next time the journey is built.
//
// The browser reads the journey file, but a server function cannot: it has to know the midnight
// moment before it decides whether to hand over a single letter, and it must not take that moment
// from anything the caller sends.
export const MIDNIGHT_MS = {at};
export const LETTERS_CLOSE_MS = {closes};
export const HAS_LETTERBOX = {letterbox};

// A demo journey lets anyone move its clock, so a stranger can walk the whole thing in a minute
// instead of waiting a week for it. Never set this on a journey somebody is actually travelling.
export const DEMO = {demo};

// A demo with no file store of its own shows these instead of real letters, so the whole thing can
// be deployed and walked through without anybody opening an account first.
export const DEMO_LETTERS = {letters};
"""

# What the phone has to hold to work with no signal. Everything else under public/ is either
# generated here or is not the app.
CACHE_DIRS = ("css", "js", "vendor", "img", "data")
CACHE_FILES = ("index.html", "letterbox.html", "key.html", "manifest.webmanifest", "favicon.ico")
NEVER_CACHED = ("precache.json", "sw.js")
SW_VERSION = re.compile(r"const V = '[^']*';")

# new() leaves these behind. They are a running app's workings, not the engine. The paths are
# read from the top of the template on purpose: a bare "data" also matches public/data, and the
# whole trip then goes missing from the copy with nothing to say so.
NOT_THE_ENGINE = ("data", "qa/out", ".vercel", "tls")
NEVER_COPIED = ("node_modules", "__pycache__")
KEEP_DOTFILES = (".gitignore", ".vercelignore")


def _read(app):
    with open(Path(app) / "public" / "data" / "trip.json", encoding="utf-8") as fh:
        return json.load(fh)


def _write(app, data):
    path = Path(app) / "public" / "data" / "trip.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")


def _moment(value):
    """An ISO 8601 time that carries its own offset, or None. A time without one opens at the
    wrong hour for everyone who is not standing where it was written."""
    try:
        when = dt.datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None
    return when if when.tzinfo else None


def _ms(value):
    return int(_moment(value).timestamp() * 1000)


def _js(value):
    if value is None:
        return "null"
    return "true" if value is True else "false" if value is False else str(value)


def check(app):
    """Everything wrong with a journey, in the order a person would fix it."""
    app = Path(app)
    data = _read(app)
    j = data.get("journey", {})
    stops = data.get("stops", [])
    errors, warnings = [], []

    # tz is never guessed. A journey in the wrong zone unlocks every envelope at the wrong hour
    # and says nothing about it, so it is better to stop and ask.
    hint = {"tz": ', the journey\'s own zone, such as "Asia/Tokyo"',
            "for": ", the name of whoever is travelling",
            "from": ", the name of whoever made the journey"}
    for field in ("title", "for", "from", "tz"):
        if not j.get(field):
            errors.append(f"journey.{field} is missing{hint.get(field, '')}")
    for name in ("midnight", "callback"):
        moment = j.get(name) or {}
        for key in ("at", "closes"):
            if moment.get(key) and not _moment(moment[key]):
                errors.append(f"journey.{name}.{key} is not an ISO 8601 time with an offset: {moment[key]}")
    if j.get("letterbox") and not j.get("midnight"):
        errors.append("journey.letterbox is set but journey.midnight is not, "
                      "so a letter would have nowhere to land")
    if j.get("demo"):
        warnings.append("journey.demo is on, so anyone with the address can move this journey's "
                        "clock and read its letters before their time. Right for a demo, wrong "
                        "for a journey somebody is travelling")

    seen, last = set(), None
    for n, stop in enumerate(stops, start=1):
        sid = stop.get("id")
        where = f"stop {sid}" if sid else f"stop number {n}"
        for field in ("id", "opensAt", "place", "day"):
            if not stop.get(field):
                errors.append(f"{where} has no {field}")
        if sid and not ID.match(str(sid)):
            errors.append(f"{where} has an id the API will turn away, "
                          "it takes 1 to 24 characters of a to z and 0 to 9")
        if sid and sid in seen:
            errors.append(f"stop {sid} appears twice")
        seen.add(sid)

        when = None
        if stop.get("opensAt"):
            when = _moment(stop["opensAt"])
            if when is None:
                errors.append(f"{where} has an opensAt that is not an ISO 8601 time "
                              f"with an offset: {stop['opensAt']}")
        if when and last and when < last:
            errors.append(f"{where} opens before the stop before it")
        last = when or last

        poster = stop.get("poster")
        if poster and not (app / "public" / "img" / "posters" / f"{poster}.jpg").is_file():
            errors.append(f"{where} names a poster that is not at public/img/posters/{poster}.jpg")
        elif not poster and stop.get("kind") != "book":
            warnings.append(f"{where} has no poster")
        if not stop.get("geo") and not stop.get("kind"):
            warnings.append(f"{where} has no geo, so its point is interpolated between its neighbours")
        radius = (stop.get("geo") or {}).get("r")
        if radius is not None and not 50 <= radius <= 2000:
            warnings.append(f"{where} has a geo radius of {radius} metres, "
                            "outside the 50 to 2000 a phone can hold to")

    if stops and not any(stop.get("question") for stop in stops):
        warnings.append("no stop asks a question, so the sky stays empty")
    if len(stops) < 3:
        warnings.append("fewer than 3 stops, which is thin for a journey")
    times = sorted(filter(None, (_moment(stop.get("opensAt")) for stop in stops)))
    if times and (times[-1] - times[0]).days > 30:
        warnings.append("more than 30 days between the first and last stop")
    return {"errors": errors, "warnings": warnings}


def build(app):
    """Write the three artefacts the browser cannot work out for itself. Twice over the same
    journey writes the same bytes, so a build is safe to run on every commit."""
    app = Path(app)
    report = check(app)
    if report["errors"]:
        raise ValueError("; ".join(report["errors"]))
    data = _read(app)
    j = data["journey"]

    midnight = j.get("midnight") or {}
    at = _ms(midnight["at"]) if midnight.get("at") else None
    # Letters close before the moment they are read at, not after it. With no closing time
    # given they are sealed by the moment itself.
    closes = _ms(midnight["closes"]) if midnight.get("closes") else at
    api = app / "api" / "_journey.js"
    api.parent.mkdir(parents=True, exist_ok=True)
    api.write_text(API.format(at=_js(at), closes=_js(closes),
                              letterbox=_js(bool(j.get("letterbox"))),
                              demo=_js(bool(j.get("demo"))),
                              letters=_demo_letters(j)), "utf-8")

    box = j.get("letterbox") or {}
    pages = [_page(app / "public" / "index.html", j.get("title", ""), j.get("opening", "")),
             _page(app / "public" / "letterbox.html", box.get("title") or j.get("title", ""),
                   box.get("intro") or j.get("opening", ""))]
    # The key page binds this, and it reads badly if it still says the last traveller's name.
    # It is written before the cache is stamped, because the stamp covers the trip file and a
    # build that changed it afterwards would hand every second build a different cache name.
    label = f"{j['for']}'s app"
    if j.get("appLabel") != label:
        j["appLabel"] = label
        _write(app, data)

    manifest = _manifest(app, j)
    cached = _precache(app)
    version = _stamp(app, cached)

    return {"api": str(api), "pages": [str(p) for p in pages if p], "manifest": str(manifest or ""),
            "precache": str(app / "public" / "precache.json"), "cached": len(cached),
            "version": version, "warnings": report["warnings"]}


def _demo_letters(j):
    """A demo journey's own letters, as a JavaScript literal.

    Written out rather than read at runtime because a function has no way to reach the journey
    file, which is served to the browser and not bundled with the API.
    """
    if not j.get("demo"):
        return "[]"
    out = []
    for n, letter in enumerate(j.get("demoLetters") or []):
        out.append({
            "id": f"demo{n:02d}",
            "from": str(letter.get("from", ""))[:60],
            "text": str(letter.get("text", ""))[:6000],
            "audio": None, "video": None,
            "last": bool(letter.get("last")),
            "at": n,
        })
    return json.dumps(out, ensure_ascii=False, indent=1)


def _page(path, title, description):
    """Rewrite what is between the markers and nothing else, so hand edits to the rest of the
    head survive a build."""
    if not path.exists():
        return None
    block = "\n".join([
        OPEN,
        f"<title>{html.escape(title)}</title>",
        f'<meta name="description" content="{html.escape(description)}">',
        f'<meta property="og:title" content="{html.escape(title)}">',
        f'<meta property="og:description" content="{html.escape(description)}">',
        '<meta property="og:type" content="website">',
        # A journey is one person's, addressed to one person. It has no business in a search index.
        '<meta name="robots" content="noindex, nofollow">',
        CLOSE,
    ])
    text = path.read_text("utf-8")
    if BLOCK.search(text):
        text = BLOCK.sub(lambda m: block, text, count=1)
    elif HEAD.search(text):
        text = HEAD.sub(lambda m: block + "\n" + m.group(0), text, count=1)
    else:
        text = text + "\n" + block + "\n"
    path.write_text(text, "utf-8")
    return path


def _precache(app):
    pub = app / "public"
    # "./" is the address the phone actually opens. Without it there is no app shell offline,
    # only the files the shell would have asked for.
    files = ["./"]
    for path in pub.rglob("*"):
        rel = path.relative_to(pub)
        name = rel.as_posix()
        if not path.is_file() or any(part.startswith(".") for part in rel.parts):
            continue
        if name in NEVER_CACHED:
            continue
        if name in CACHE_FILES or rel.parts[0] in CACHE_DIRS:
            files.append(name)
    files.sort()
    (pub / "precache.json").write_text(json.dumps(files, indent=0) + "\n", "utf-8")
    return files


def _manifest(app, j):
    """The name the phone puts under the icon when the journey is added to a home screen.

    It lives in a static file the browser reads before any script runs, so it cannot be bound from
    the journey file at runtime like the rest of the copy.
    """
    path = app / "public" / "manifest.webmanifest"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text("utf-8"))
    except json.JSONDecodeError:
        return None
    title = j.get("title", "")
    data["name"] = title
    # A home screen gives a short label about twelve characters before it trims it with an
    # ellipsis, so drop a leading article and then cut on a word rather than mid syllable.
    short = title[4:] if title.lower().startswith("the ") else title
    if len(short) > 12:
        short = short[:12].rsplit(" ", 1)[0] if " " in short[:13] else short[:12]
    data["short_name"] = short.strip() or title[:12]
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    return path


def _stamp(app, files):
    """Name the cache after what is in it.

    A service worker only reinstalls when its own source changes, so a cache named by hand goes
    stale the moment someone rewrites a poster without renaming it: the phone keeps serving what
    it already has and the traveller sees last week's journey. Hashing the contents means the name
    changes exactly when something the phone holds has changed, and not otherwise, which is also
    what keeps a second build byte identical to the first.
    """
    pub = app / "public"
    h = hashlib.sha256()
    for name in files:
        if name == "./":
            continue
        h.update(name.encode("utf-8"))
        path = pub / name
        if path.is_file():
            h.update(path.read_bytes())
    version = "ga-" + h.hexdigest()[:12]
    sw = pub / "sw.js"
    if sw.exists():
        text = sw.read_text("utf-8")
        if SW_VERSION.search(text):
            sw.write_text(SW_VERSION.sub(f"const V = '{version}';", text, count=1), "utf-8")
    return version


def new(template, dest, trip=None, midnight=None, theme_name="lantern-night"):
    """Copy the engine to a new app and dress it in a theme. With a planning trip file it also
    drafts the stops, leaving every line of writing empty: the dates and the places can be worked
    out, the words cannot."""
    template, dest = Path(template).resolve(), Path(dest)
    if dest.exists() and any(dest.iterdir()):
        raise FileExistsError(f"{dest} already has something in it")

    def leave_out(directory, names):
        here = Path(directory).resolve()
        out = set()
        for name in names:
            rel = (here / name).relative_to(template).as_posix()
            if rel in NOT_THE_ENGINE or name in NEVER_COPIED:
                out.add(name)
            elif name.startswith(".") and name not in KEEP_DOTFILES:
                out.add(name)
        return out

    shutil.copytree(template, dest, ignore=leave_out, dirs_exist_ok=True)
    from . import theme as theme_mod
    theme_mod.apply_to(dest, theme_name)
    if trip:
        with open(trip, encoding="utf-8") as fh:
            _write(dest, _draft(json.load(fh), midnight))
    return dest


def _time(value):
    text = str(value or "09:00")
    return text if len(text) == 8 else text + ":00"


def _date(value):
    return dt.date.fromisoformat(str(value)[:10])


def _hhmm(offset):
    minutes = int(offset.total_seconds()) // 60
    sign = "+" if minutes >= 0 else "-"
    return f"{sign}{abs(minutes) // 60:02d}:{abs(minutes) % 60:02d}"


def _offset(place, date):
    """The offset to stamp on a drafted stop. A named zone is the only way to be sure of it, so
    without one we read the longitude, which lands within an hour or so and is meant to be
    corrected by hand before the journey is built."""
    place = place or {}
    if place.get("tz"):
        try:
            noon = dt.datetime.combine(_date(date), dt.time(12), zoneinfo.ZoneInfo(place["tz"]))
            return _hhmm(noon.utcoffset())
        except (zoneinfo.ZoneInfoNotFoundError, ValueError):
            pass
    if place.get("lon") is not None:
        return _hhmm(dt.timedelta(hours=round(float(place["lon"]) / 15)))
    return "+00:00"


def _place_for(places, date):
    """A trip file lists places in order, but a stop belongs to whichever one covers its date."""
    if not places:
        return None
    day = _date(date)
    for place in places:
        if place.get("from") and place.get("to") and _date(place["from"]) <= day <= _date(place["to"]):
            return place
    return min(places, key=lambda p: abs((_date(p.get("from") or p.get("to") or date) - day).days))


def _id(text, taken):
    """Two words is enough to tell stops apart and short enough to read in a URL."""
    plain = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode("ascii")
    words = [word for word in re.split(r"[^a-z0-9]+", plain.lower()) if word]
    base = "".join(words[:2])[:24] or "stop"
    candidate, n = base, 1
    while candidate in taken:
        n += 1
        candidate = base[:24 - len(str(n))] + str(n)
    return candidate


def _entries(trip):
    """What in a planning file is worth an envelope: everything on the way out, and everything
    planned once there. The flight home is the book, not a stop."""
    out = []
    for flight in trip.get("flights", []):
        if flight.get("direction") == "return":
            continue
        number = str(flight.get("flight_number") or "")
        route = " to ".join(x for x in (flight.get("from"), flight.get("to")) if x)
        out.append({"date": flight.get("date"), "time": flight.get("time"),
                    "slug": number, "place": route or number})
    for item in trip.get("activities", []):
        what = str(item.get("what") or "")
        out.append({"date": item.get("date"), "time": item.get("time"), "slug": what, "place": what})
    return [entry for entry in out if entry.get("date")]


def _draft(trip, midnight=None):
    places = trip.get("places", [])
    travellers = trip.get("travellers", [])
    dates = trip.get("dates", {})
    drafted = []
    for entry in _entries(trip):
        place = _place_for(places, entry["date"])
        opens = f"{entry['date']}T{_time(entry.get('time'))}{_offset(place, entry['date'])}"
        drafted.append((opens, entry, place))
    if midnight:
        drafted.append((midnight, {"date": midnight[:10], "slug": "midnight", "place": "Midnight",
                                   "kind": "midnight"}, _place_for(places, midnight[:10])))
    drafted.sort(key=lambda row: _moment(row[0]))

    first = _date(dates.get("depart") or (drafted[0][1]["date"] if drafted else dt.date.today().isoformat()))
    stops, taken = [], set()
    for n, (opens, entry, place) in enumerate(drafted, start=1):
        sid = _id(entry["slug"], taken)
        taken.add(sid)
        stop = {"id": sid, "n": n, "day": (_date(entry["date"]) - first).days + 1,
                "opensAt": opens, "place": entry["place"], "city": (place or {}).get("name", ""),
                "lede": "", "question": "", "caption": "", "poster": ""}
        if entry.get("kind"):
            stop["kind"] = entry["kind"]
        stops.append(stop)

    opens = _book_opens(trip, places, stops[-1]["opensAt"] if stops else None)
    home = _place_for(places, opens[:10]) if opens else None
    stops.append({"id": _id("book", taken), "n": len(stops) + 1,
                  "day": (_date(opens) - first).days + 1 if opens else len(stops) + 1,
                  "kind": "book", "opensAt": opens, "place": "On the way home",
                  "city": (home or {}).get("name", ""), "lede": "", "caption": ""})

    journey = {"title": trip.get("destination", ""),
               "for": travellers[0] if travellers else "",
               "from": travellers[1] if len(travellers) > 1 else "",
               "subtitle": " · ".join(x for x in (trip.get("destination"), dates.get("depart")) if x),
               "opening": "",
               "bookLabel": trip.get("destination", ""),
               "tz": next((p["tz"] for p in places if p.get("tz")), ""),
               "tzCity": (places[-1].get("name", "") if places else "")}
    if midnight:
        journey["midnight"] = {"at": midnight, "title": "", "dayLabel": "",
                               "closes": (_moment(midnight) - dt.timedelta(minutes=1)).isoformat()}
    return {"journey": journey, "stops": stops}


def _book_opens(trip, places, last):
    """The book opens on the way home, so it wants the flight back. Without one it opens an hour
    after the last envelope, which at least keeps it last."""
    home = next((f for f in trip.get("flights", []) if f.get("direction") == "return"), {})
    date = home.get("date") or trip.get("dates", {}).get("return")
    if date:
        opens = f"{date}T{_time(home.get('time'))}{_offset(_place_for(places, date), date)}"
        if last is None or _moment(opens) > _moment(last):
            return opens
    return (_moment(last) + dt.timedelta(hours=1)).isoformat() if last else ""
