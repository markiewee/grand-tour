# Grand Tour

A Claude Code plugin for planning a trip properly and coming home with a guide worth keeping.

- **trip-plan** keeps one trip file, flags missing nights, unbooked items and passport problems, and adds the forecast.
- **trip-research** sends one agent per day to find facts with a source for each, reference photos, and public-domain postcards, stamps and maps with their credits.
- **trip-book** compares live options and hands you a shortlist with links. You pay, it records the booking.
- **trip-guide** turns each stop into a 1930s-style travel poster with no words on it, drawn from a real photo, and prints a page per day as a PDF.

## Install

In Claude Code:

    /plugin marketplace add markiewee/grand-tour
    /plugin install grand-tour@grand-tour

The skills run a small Python helper that ships inside the plugin. It needs Python 3.10 or newer with Pillow:

    pip install Pillow

You also need Google Chrome to print PDFs. Two things are optional:

- `GEMINI_API_KEY` and `pip install google-genai`, to generate posters through Google's image API. Google charges per image, so the guide skill asks before it spends anything. Without a key it writes a card you can paste into Google Flow instead.
- `tesseract` and `pip install pytesseract`, to check posters for stray lettering.

## Try it

    Plan a 3-day trip to Kyoto in April for two, then make me an illustrated guide.

The helper also works on its own:

    python3 -m grandtour gaps templates/trip.example.json
    python3 -m grandtour commons-search "Hoan Kiem Lake 1915"
    python3 -m grandtour prompt --style templates/styles/art-deco.json --concept "A lantern leads the way up the street."

## Rules it keeps

- It never pays, never types card details or passwords, and never presses the final booking button.
- It never publishes or sends anything without your go.
- Every fact has a source. Anything it could not check is labelled.
- Posters carry one idea each and have no words on them. Every real place is drawn from a real photo.
- Every public-domain or Creative Commons file keeps its credit.

## What's inside

    skills/        the four skills and the poster rules
    grandtour/     the Python helper (python3 -m grandtour --help)
    templates/     a sample trip file, two house styles, the A4 page template and its CSS
    tests/         pytest suite

## Licence

MIT
