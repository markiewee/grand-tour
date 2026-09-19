"""Load a trip file and flag the gaps a traveller would want fixed before leaving."""
import datetime as dt
import json

REQUIRED = ("id", "destination", "dates", "travellers")
SECTIONS = ("flights", "accommodation", "transport", "activities")
BOOKED = ("booked", "paid")


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _date(value):
    return dt.date.fromisoformat(value[:10])


def validate(data):
    problems = [f"missing field: {name}" for name in REQUIRED if name not in data]
    dates = data.get("dates", {})
    if dates.get("depart") and dates.get("return") and _date(dates["return"]) < _date(dates["depart"]):
        problems.append("return date is before departure")
    return problems


def nights_without_bed(data):
    dates = data["dates"]
    if not dates.get("return"):
        return []
    covered = set()
    for stay in data.get("accommodation", []):
        if stay.get("status") not in BOOKED:
            continue
        night = _date(stay["checkin"])
        while night < _date(stay["checkout"]):
            covered.add(night)
            night += dt.timedelta(days=1)
    for ride in data.get("transport", []):
        if ride.get("overnight") and ride.get("status") in BOOKED:
            covered.add(_date(ride["date"]))
    night, last, missing = _date(dates["depart"]), _date(dates["return"]), []
    while night < last:
        if night not in covered:
            missing.append(night.isoformat())
        night += dt.timedelta(days=1)
    return missing


def gaps(data):
    found = [f"no bed booked for the night of {night}" for night in nights_without_bed(data)]
    if not data["dates"].get("return"):
        found.append("no return date")
    for section in SECTIONS:
        for item in data.get(section, []):
            if item.get("status") == "to book":
                label = item.get("what") or item.get("name") or item.get("flight_number") or section
                when = item.get("date") or item.get("checkin") or "?"
                found.append(f"to book: {label} ({when})")
    passport = data.get("documents", {}).get("passport_expiry")
    if passport and _date(passport) < _date(data["dates"]["depart"]) + dt.timedelta(days=183):
        found.append("passport expires within six months of departure")
    return found
