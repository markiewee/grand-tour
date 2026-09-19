---
name: trip-research
description: Use when a planned trip needs checked facts, history, reference photos or period ephemera for each stop, usually before making an illustrated guide. Runs one research agent per day, cites a source for every fact, and saves reference photos and public-domain postcards, stamps, maps and logos with their credits.
---

# Trip research

## Find the helper
The plugin root is two folders up from this skill's base directory. Run:
`PYTHONPATH="<plugin root>" python3 -m grandtour <command>`

## Steps
1. Read `trips/<id>/trip.json` and list the stops for each day.
2. Start one background agent per day. Give each agent this brief, filled in:
   - The stops for that day, with times.
   - For every stop: 3 to 5 facts a traveller would enjoy, each with a source URL. Put anything unconfirmed under "Could not verify" and never state it as fact.
   - One reference photo per real place, for drawing accurate buildings. Search Wikimedia Commons first with `grandtour commons-search "<query>"`, then save with `grandtour commons-fetch "<File:...>" --dest trips/<id>/dayN/refs --key <short_name>`. A photo from anywhere else may be used only as a private reference: record its URL and mark it `private reference only`.
   - Period ephemera where the place is old enough: postcards, stamps, airline or hotel logos, maps. Save them to `trips/<id>/dayN/ephemera` the same way. Keep only files whose credit shows `open_licence: true`.
   - One text-free poster idea per stop that carries a meaning through contrast, symbol or composition (see `skills/trip-guide/poster-rules.md`).
   - Any practical problem found on the way: a venue that moved, a closure, a timing that doesn't work.
3. When the agents report, check their practical warnings against the trip file and tell the traveller about each one.

## Rules
- A source for every fact. No source means it goes under "Could not verify".
- Place names stay in the local language with correct accents. Everything else is in the traveller's language.
- Every saved file has a credits.json entry.
