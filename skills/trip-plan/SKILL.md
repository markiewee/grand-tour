---
name: trip-plan
description: Use when someone wants to plan a trip, add bookings to it, check it for gaps, or see the day-by-day plan. Keeps one trip.json per trip, flags missing nights, unbooked items and passport problems, adds the weather forecast, and lays the days out.
---

# Trip plan

Keep one trip file per trip at `trips/<id>/trip.json`. Start from `templates/trip.example.json` in this plugin.

## Find the helper
This skill's base directory is shown when it loads. The plugin root is two folders up. Run the helper as:
`PYTHONPATH="<plugin root>" python3 -m adventure <command>`

## Steps
1. Ask for the destination, dates, who is travelling and what is already booked. Take details from any confirmation email, PDF or screenshot the traveller shares.
2. Write or update `trips/<id>/trip.json`. Every flight, stay, ride and activity gets a `status`: `idea`, `to book`, `booked`, `paid` or `dropped`. Only `booked` and `paid` stays count as a bed for the night. Overnight buses, trains and ferries get `"overnight": true`. Add each base town to `places` with its latitude, longitude and dates.
3. Run `adventure gaps trips/<id>/trip.json` and show the traveller every line it prints.
4. Check what the helper cannot: visa rules for the traveller's passport, travel insurance, closures and public holidays on the travel dates, and whether each day's timings are realistic (opening hours, last entry, travel time between stops). Search the web for these and cite each source.
5. Inside 16 days of departure, run `adventure weather trips/<id>/trip.json` and put the forecast on each day.
6. Lay out each day as time-ordered rows (time, what, one line of detail, status) and show it in chat.

## Rules
- Never quote a price you have not seen on a live page today. Label estimates as estimates.
- Record what the traveller decides straight away, including things they drop.
