---
name: trip-book
description: Use when a trip has items marked "to book" or the traveller asks to find a hotel, flight, bus or activity. Compares live options in the browser, hands over a shortlist with direct links, and records the booking once the traveller has paid. It never pays and never types card details or passwords.
---

# Trip booking handoff

## Steps
1. Take the item from `trips/<id>/trip.json`: dates, number of travellers, budget and must-haves (for example "near the station" or "free cancellation").
2. Check live prices in a browser (the Chrome extension, or headless Playwright if it is available). Look at two or three sites, including the provider's own site.
3. Show a shortlist of three at most. For each one give the total price as the page showed it, the cancellation terms, the reason it fits, and a direct link.
4. The traveller books and pays. Then ask for the confirmation (email, PDF or screenshot) and record the reference, price paid, cancellation terms and status `booked` or `paid` in the trip file.
5. Run `adventure gaps` again and report what is still open.

## Hard rules
- Never enter card numbers, bank details, passport numbers or passwords, and never press a final "pay", "book" or "confirm" button. Take the traveller to that page and stop.
- Never accept terms or cookie banners beyond the essentials without asking.
- Quote only prices seen on a live page today, with the currency and whether taxes are included.
