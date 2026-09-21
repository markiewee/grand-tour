---
name: trip-journey
description: Use when someone wants a trip delivered as an interactive journey rather than a printed guide, or asks for a sealed app, an envelope app, a surprise trip app or a keepsake the traveller unlocks as they go. Builds a web app from the trip file where each stop stays sealed until its time or until the traveller is standing there, with posters that print, questions that rise into the sky as whatever the theme makes them, an optional letterbox of letters from friends, and a book at the end. Rehearses the whole journey in a headless phone and hands over a deploy command.
---

# Trip journey

A journey is the same trip as the guide, handed over differently. The guide is printed and read in
advance. The journey sits on the traveller's phone and opens one envelope at a time, at the right
hour or at the right place, and it does not tell them what is coming.

Read `poster-rules.md` in `../trip-guide/` before writing any poster idea. The posters are the
same posters.

## Find the helper

The plugin root is two folders up from this skill's base directory. Run:
`PYTHONPATH="<plugin root>" python3 -m adventure <command>`

## Steps

1. **Ask what it is for.** Who is travelling, who is it from, and is there one moment in the trip
   that matters more than the others, such as a birthday. Do not assume there is one. A journey
   with no such moment has no midnight screen and no letterbox, and is simpler for it.

2. **Pick a theme, then scaffold.**
   `adventure journey new trips/<id>/app --trip trips/<id>/trip.json --theme <name>`
   Three themes ship: `lantern-night`, `kyoto-woodblock` and `canyon-ember`. Show the traveller's
   friend the three and let them pick, or make a new one with `adventure theme new <name>`, which
   writes the folder and the brief for its five images. A theme decides the painted art, the
   colours, the four typefaces and the words, including the noun for the thing that rises when a
   question is answered. It decides nothing about how the journey works.

   Scaffolding copies the engine and drafts one stop per activity and per outbound flight, with
   the copy left empty. It never overwrites an existing directory. To change the theme later:
   `adventure journey retheme trips/<id>/app --theme <name>`, which refuses once the traveller has
   answered anything, because their own words were written under one noun.

3. **Write the journey block.** Open `trips/<id>/app/public/data/trip.json` and fill in `title`,
   `for`, `from`, `subtitle`, `opening`, `tz` and `tzCity`. Add `midnight`, `callback` and
   `letterbox` only if step 1 called for them. Show the traveller's friend the words before going on.

4. **Write a stop.** For each envelope:
   - `lede`, about 45 words, three sentences: what the place is, one checked fact from
     `trip-research` with a date or a number in it, and why this stop is in the journey.
   - `question` on about half of them. Open, personal, answerable in one line, never yes or no.
     The answer rises into the sky as a lantern, a crane or an ember, whichever the theme
     chose, and comes back on the callback date.
   - `caption`, one sentence about the poster, as if printed on its back.
   - `geo` with `lat`, `lng` and `r` in metres: 200 for a restaurant or a bar, 300 to 500 for a
     temple or a park, 400 for an airport terminal. Without it the envelope opens on time only.
   - `sources`, one or two URLs that actually support the fact in the lede.

5. **Posters.** Make them with `trip-guide`, passing the same `--theme` so the posters and the
   app match. Write the concept from the place, not from the
   caption: a caption describes the picture to the person reading it, and a generator given only
   that draws the right composition in the wrong country. Then cut each one for the phone:
   `adventure plates trips/<id>/art/final/<stop>.jpg --out trips/<id>/app/public/img`
   That writes the phone sized poster, the thumbnail the route map uses, and the five ink plates
   the printing animation lays down one at a time.

6. **Check.** `adventure journey check trips/<id>/app` until it reports no errors. It exits 1 while
   anything is wrong, so it is safe to loop on. Warnings are worth reading and not always worth
   fixing.

7. **Build.** `adventure journey build trips/<id>/app`
   This writes the three things the browser cannot work out for itself: the midnight moment the API
   gates the letters on, the social tags a link preview reads before any script runs, and the
   offline list the service worker installs from. Run it again after any change to the journey file.

8. **Rehearse.** From inside the app directory:
   ```
   python3 server.py &
   npm install --no-save playwright-core
   node qa/rehearse.mjs
   ```
   It plays the whole journey on a headless phone, holds every seal, answers every question and
   screenshots each step into `qa/out/`. Look at the screenshots. A journey that passes its checks
   can still be ugly.

9. **Hand it over.** Give the traveller's friend the deploy command and the two things to do after:
   ```
   cd trips/<id>/app && vercel deploy --prod
   ```
   Then set the environment variables below if the journey has a letterbox, and open
   `key.html?k=<token>` once to write a note for each envelope. **You do not deploy and you do not
   send the link.** Say what the command will do and let them run it.

## Showing it to someone

A journey is sealed, which makes it hard to show. A visitor can only open the first envelope,
because the rest are shut until dates months away.

For a journey nobody is travelling, such as a sample or something being shown off, set
`"demo": true` in the journey block. The app then carries a bar of buttons that move its clock and
fill in the envelopes up to that point, and the server honours a moved clock. `journey check` warns
about it every time, because on a real journey it hands anyone with the address the letters early.

Never set it on a journey somebody is going to travel.

## The letterbox

Only needed if friends are leaving letters. It wants two Vercel Blob stores, because a store is
public or private for its whole life and these hold different things:

| Variable | Store | Holds |
|---|---|---|
| `BLOB_STATE_TOKEN` | private | the letters, the events, which envelopes are held back |
| `BLOB_MEDIA_TOKEN` | public | voice notes and videos, which a phone has to stream from a URL |
| `KEY_TOKEN` | not a store | the secret in the key link. Make one with `openssl rand -base64 18` |

Recordings go from the friend's phone straight to the media store and only their addresses are
posted with the letter, because a function body is capped at 4.5 MB and a minute of video is many
times that.

Everything stays sealed until the midnight moment. Only the key can move the server's clock, so a
traveller who guesses a date and types it into the address still cannot reach the letters early.

## Rules

- Nothing is deployed, published or sent without the traveller's friend saying so. Not the link,
  not the letterbox invitation, not the journey itself.
- Every fact in a lede has a source. Anything that could not be checked is left out rather than
  guessed at.
- Posters carry one idea each and have no words on them.
- A journey is private by default. Every page it builds carries `noindex, nofollow`.
- Never write the traveller's own answers anywhere the sender can read them. The key page shows
  that a question was answered, never what the answer was.
