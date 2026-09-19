---
name: trip-guide
description: Use when someone wants an illustrated travel guide, travel posters, or a keepsake PDF for a trip. Builds a moodboard and house style, writes a poster idea with a meaning for each stop, generates text-free posters from real reference photos (Google's image API or Google Flow by hand), lays out a page per day and prints it to PDF.
---

# Trip guide

Read `poster-rules.md` in this folder before writing any poster idea.

## Find the helper
The plugin root is two folders up from this skill's base directory. Run:
`PYTHONPATH="<plugin root>" python3 -m grandtour <command>`

## Steps
1. **Style.** Pick a house style from `templates/styles/` or write a new one in the same shape. Build a one-page moodboard (palette, fonts, three to six public-domain posters in that style from Commons) and get the traveller's OK before making anything else.
2. **Ideas.** Using the research from `trip-research`, write one sentence per stop saying what the poster means, then the full concept. Show the list and get an OK.
3. **References.** Prepare one reference image per poster in `trips/<id>/dayN/flowrefs`, following rules 3 and 4.
4. **Posters.** With `GEMINI_API_KEY` set and the traveller's OK to spend on it:
   `grandtour poster --style <style.json> --concept "<concept>" --reference-note "<what the photo is for>" --ref <ref.jpg> --out trips/<id>/art/dayN/raw --name <stop>`
   Without a key, make a card instead and let the traveller paste it into Google Flow:
   `grandtour flow-card --style <style.json> --concept "<concept>" --ref <ref.jpg> --out trips/<id>/art/dayN/cards --name <stop>`
5. **Pick.** Build a contact sheet with `grandtour sheet`, look at every take, run `grandtour text-check` on the ones you pick, and copy them to `trips/<id>/art/dayN/final/<stop>.jpg`.
6. **Pages.** Copy `templates/guide.css` next to the pages. For a simple day, fill `templates/day.html` with `render.render_day`. For a richer day, write the page by hand with the same classes: an opener page with the day's lead poster, then one page per part of the day with the poster, the timed rows, a short history note and pasted ephemera with credits.
7. **Print.** Run `grandtour pdf <day.html> <day.pdf>`, turn the PDF into page images with `pdftoppm -r 50 -png`, and check that nothing overlaps or runs off the page before showing it.

## Rules
- Nothing is published or shared without the traveller's go.
- Paid image generation needs the traveller's OK first. Say roughly how many images the guide will need.
- Credit every public-domain or Creative Commons file on the page where it appears.
