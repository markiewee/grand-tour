# Journey themes

2026-09-21

## The problem

The journey engine looks like one journey. Its palette, its four typefaces, its painted art and
about fifty printed words are fixed in the source, and all of them describe a paper lantern rising
over an indigo night. A trip to Kyoto and a trip to Vietnam come out of the same command looking
like the same app.

The same palette and the same four typefaces are also written out three separate times: once in
`templates/styles/*.json` for the poster generator, once in `templates/guide.css` for the printed
A4 guide, and once in `templates/journey/public/css/lantern.css` for the app. Editing one does not
move the others, so a trip's posters and a trip's app drift apart the first time anyone changes a
colour.

## What a theme is

A theme is a folder. It owns the painted art, the colours, the typefaces and the words. It does
not own the animations, the scene layout or any code.

```
templates/themes/<name>/
  theme.json
  img/art/  sky.jpg  moon.jpg  <rise>.png  envelope.jpg  envelope_t.jpg  liner.jpg
```

`theme.json` has five blocks:

| Block | Feeds | Notes |
|---|---|---|
| `house_prompt`, `avoid` | the poster generator | replaces `templates/styles/*.json` |
| `palette` | the app CSS, the guide CSS | eleven tokens, the names `lantern.css` already uses; the moodboard reads seven of them |
| `fonts` | the app CSS, the guide CSS, both font links | four families plus the Google Fonts query |
| `rise` | the copy | `{"asset": "crane.png", "one": "a crane", "many": "cranes"}` |
| `copy` | every printed word | overrides only; the base file holds the rest |

The art filenames are fixed because the engine reads them by name. A theme's own picture may be
called `crane.png` in the theme folder; `rise.asset` says which file becomes `rise.png` in the app.

## Copy

Two problems sit under the words. They are in two places, and a theme should not have to write
fifty sentences to exist.

`templates/themes/_base/copy.json` holds every key with its default sentence, and a sentence may
carry `{one}` or `{many}`, filled from the theme's `rise` block. "Send it up as {one}" becomes
"Send it up as a crane" with no theme author writing anything. A theme's `copy` block overrides
any key it wants a different voice for.

In HTML, a new `data-t` attribute reads theme copy, next to the existing `data-j` which keeps
reading the journey file. In JS, a `t(key)` helper from a new `public/js/copy.js` reads the same
object. Precedence, lowest to highest: base copy, theme copy, journey file. A journey can always
have the last word on a sentence without a new theme.

The strings to move: about fourteen in `index.html`, about twenty in `app.js`, six in `book.js`,
eight in `key.js`, one in `midnight.js`. `letterbox.html` and `key.html` already bind eight and
two. The one journey-specific string hiding among them is `'Happy birthday.'` in `app.js`, which
belongs in the journey file, not in a theme.

## How a theme reaches an app

`adventure journey new <dest> --theme kyoto-woodblock` copies the engine as it does today, then:

1. copies the theme's `img/art/*` into `public/img/art/`, renaming `rise.asset` to `rise.png`
2. writes `public/data/theme.json`, the merged base copy plus theme copy plus the rise nouns
3. writes `public/css/theme.css`, the `:root` block and the Google Fonts `@import`

`public/css/lantern.css` loses its `:root` block and is renamed `journey.css`, because what is
left is layout and layout is not a lantern. `index.html` loads `theme.css` before it.

`adventure journey retheme <app> --theme <name>` re-runs those three steps on an existing app, so
changing your mind does not mean scaffolding again. It refuses if the app has a `public/data/
trip.json` with answered questions in it, because the noun in a traveller's own sent answer cannot
be rewritten after the fact.

Copying at scaffold time rather than reading a theme at runtime keeps the deployed app
self-contained, keeps the service worker's offline list honest, and ships one set of art instead
of three.

## The guide and the posters

`render.render_day` gains the theme, writes the same `:root` into the printed page and swaps the
hardcoded Google Fonts link in `templates/day.html` for the theme's. `templates/guide.css` loses
its `:root` block the same way the app's CSS does.

`poster.load_style` becomes `theme.load`, and the `prompt`, `poster` and `flow-card` commands take
`--theme <name or path>` where they took `--style <path>`. `templates/styles/art-deco.json` and
`templates/styles/wpa-screenprint.json` become the `lantern-night` and `canyon-ember` themes and
the `styles` folder goes. This is a breaking change to a plugin at 0.2.0 with no outside users.

## Building your own

`adventure theme new <name>` writes the folder: a `theme.json` with the palette and fonts blocks
filled with the base theme's values to edit, an empty `copy` block, and `PROMPTS.md`, the five
image prompts with the exact pixel size each one has to end at.

`adventure theme cut <name> <folder>` turns a folder of generated images into the six art files.
It carries the three things today's session proved are needed:

- **Margin trim.** Generators print a paper margin, sometimes with a torn corner over part of one
  edge. A line counts as margin while any meaningful part of it is still the margin colour.
- **Two moon crops.** A moon that runs past its frame gets a centre square. A moon sitting on a
  plain card gets the card eaten up to the disc. The wrong one leaves dark corners inside the
  circle the shader draws.
- **Sprite keying.** Flood the background in from the edges rather than keying by colour distance,
  so a colour enclosed by the subject survives, and unmix the background colour out of the edge
  pixels so no fringe is left against the night.

## Checks

`adventure journey check` gains four:

| Check | Fails when |
|---|---|
| copy complete | a key in the base file has no value after the merge, or a `{one}` is left unfilled |
| art present | one of the six files is missing |
| art sized | a file is not the size the engine draws it at |
| contrast | `ivory` on `night` falls below 4.5:1 |

The contrast check is the one a new sky will actually trip.

## Ships with

`lantern-night`, today's art and words unchanged, which is the migration target for the existing
demo and for Lantern Road. `kyoto-woodblock` and `canyon-ember`, both already cut and staged under
`templates/journey/themes/`, which move up to `templates/themes/` because a theme feeds the
posters and the printed guide as well as the app.

## Out of scope

Swappable scene code. Changing theme after deploy. A theme picking its own stop-map projection.
Any change to `lantern-road`, which stays frozen until after the 30th.

## Tests

`tests/test_theme.py`: loading, the base-plus-theme-plus-journey merge order, an unfilled `{one}`
failing, the eleven palette tokens reaching the generated CSS.

`tests/test_theme_cut.py`: the geometry, on small synthetic images. A margin with a notch over
part of one edge trims to the content. A disc past its frame and a disc on a card both come out
filling the square. A sprite with its background colour enclosed by the subject keeps that
colour, and its edge pixels carry no fringe.

`tests/test_journey.py`: the four new checks, and `retheme` refusing an app with answers in it.
