# Journey themes implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a journey's art, palette, typefaces and words come out of a theme folder, so two trips built from the same engine look and read like different apps.

**Architecture:** A theme is a folder under `templates/themes/<name>/` holding `theme.json` and six art files. One new module, `adventure/theme.py`, loads it, merges its words over a base copy file, and writes a `:root` CSS block. `journey new --theme` copies the art in and writes two generated files into the app. The browser reads the merged words from `public/data/theme.json` through a new `data-t` attribute in HTML and a `t()` helper in JS. The same theme feeds the poster prompts and the printed A4 guide, replacing `templates/styles/`.

**Tech stack:** Python 3.10+, Pillow, numpy (new optional extra, for the art cutter only), pytest. Browser side is vanilla ES modules, no build step.

**Spec:** `docs/superpowers/specs/2026-09-21-journey-themes-design.md`

---

## File structure

**New**

| Path | Responsibility |
|---|---|
| `adventure/theme.py` | load a theme, merge copy, generate the CSS block |
| `adventure/theme_cut.py` | turn generated images into the six art files |
| `templates/themes/_base/copy.json` | every printed string, with `{a}` `{one}` `{many}` placeholders |
| `templates/themes/lantern-night/` | today's art and words, unchanged |
| `templates/themes/kyoto-woodblock/` | moved up from `templates/journey/themes/` |
| `templates/themes/canyon-ember/` | moved up from `templates/journey/themes/` |
| `templates/journey/public/js/copy.js` | the `t()` helper |
| `tests/test_theme.py` | loading, merging, CSS |
| `tests/test_theme_cut.py` | the cutter's geometry |

**Modified**

| Path | Change |
|---|---|
| `adventure/journey.py` | `new()` takes a theme; add `retheme()`; four new checks |
| `adventure/poster.py` | `load_style` becomes `theme.load` |
| `adventure/render.py` | `render_day` writes the theme's `:root` and font link |
| `adventure/__main__.py` | `--theme` on five commands, new `theme` command |
| `templates/journey/public/index.html` | `data-t` attributes, `theme.css`, `journey.css` |
| `templates/journey/public/js/{app,book,key,midnight,bind}.js` | strings become `t()` calls |
| `templates/journey/public/css/lantern.css` | `:root` removed, renamed `journey.css` |
| `templates/guide.css` | `:root` removed |
| `templates/day.html` | `$theme_css` and `$fonts` placeholders |
| `pyproject.toml` | `themes` extra |
| `skills/*/SKILL.md` | `--theme` instead of `--style`, the theme step |
| `README.md` | the theme section |

**Deleted:** `templates/styles/art-deco.json`, `templates/styles/wpa-screenprint.json`.

---

## Task 1: The theme module loads a theme

**Files:**
- Create: `adventure/theme.py`
- Create: `tests/test_theme.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_theme.py
import json

import pytest

from adventure import theme


def a_theme(tmp_path, name="kyoto-woodblock", **over):
    d = tmp_path / name
    (d / "img" / "art").mkdir(parents=True)
    data = {
        "name": "Kyoto woodblock",
        "house_prompt": "Japanese woodblock print, ukiyo-e nocturne",
        "avoid": ["photorealism"],
        "palette": {k: "#112233" for k in theme.TOKENS},
        "fonts": {"display": "Zen Antique", "deco": "Zen Antique",
                  "label": "Zen Kaku Gothic New", "text": "Shippori Mincho",
                  "query": "family=Zen+Antique&family=Shippori+Mincho"},
        "rise": {"asset": "crane.png", "a": "a crane", "one": "crane", "many": "cranes"},
        "copy": {},
    }
    data.update(over)
    (d / "theme.json").write_text(json.dumps(data), encoding="utf-8")
    return d


def test_load_reads_a_theme_directory(tmp_path):
    loaded = theme.load(a_theme(tmp_path))
    assert loaded["name"] == "Kyoto woodblock"
    assert loaded["rise"]["many"] == "cranes"


def test_load_rejects_a_missing_palette_token(tmp_path):
    palette = {k: "#112233" for k in theme.TOKENS}
    palette.pop("mist")
    with pytest.raises(ValueError, match="mist"):
        theme.load(a_theme(tmp_path, palette=palette))
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_theme.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'adventure.theme'`

- [ ] **Step 3: Write the module**

```python
# adventure/theme.py
"""A theme: the art, the colours, the typefaces and the words a journey is printed in.

One theme feeds three things that used to each carry their own copy of the same palette: the
poster prompts, the printed A4 guide and the app. A theme owns no code. It cannot change how an
envelope opens, only what the envelope is made of and what the screen says.
"""
import json
import re
from pathlib import Path

THEMES = Path(__file__).resolve().parent.parent / "templates" / "themes"
BASE = THEMES / "_base"

# The colour names the app's CSS already uses. A theme has to name all of them, because a missing
# token does not fail loudly in CSS: it falls back to whatever the browser had and looks almost
# right until one screen is unreadable.
TOKENS = ("night", "night-deep", "gold", "gold-soft", "red", "jade",
          "ivory", "paper", "mist", "ink", "ink-soft")
FONTS = ("display", "deco", "label", "text")
RISE = ("asset", "a", "one", "many")

# name -> the size the engine draws it at. envelope_t is cut from envelope, the rest are the
# theme's own files. The key is the name inside the app; rise.asset says which theme file becomes
# rise.png.
ART = {"sky.jpg": (768, 1376), "moon.jpg": (768, 768), "rise.png": (360, 470),
       "envelope.jpg": (920, 649), "envelope_t.jpg": (150, 105), "liner.jpg": (640, 640)}

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def resolve(name_or_path):
    """A theme is named or pointed at. A name is looked up in the plugin's themes."""
    path = Path(name_or_path)
    if path.is_dir():
        return path
    named = THEMES / str(name_or_path)
    if named.is_dir():
        return named
    raise FileNotFoundError(f"no theme called {name_or_path} in {THEMES}")


def load(name_or_path):
    """Read a theme and check it is complete enough to build with."""
    directory = resolve(name_or_path)
    with open(directory / "theme.json", encoding="utf-8") as fh:
        data = json.load(fh)
    data["dir"] = directory
    for token in TOKENS:
        value = data.get("palette", {}).get(token)
        if not value:
            raise ValueError(f"{directory.name}: palette is missing {token}")
        if not HEX.match(value):
            raise ValueError(f"{directory.name}: palette {token} is not a six digit hex colour")
    for font in FONTS:
        if not data.get("fonts", {}).get(font):
            raise ValueError(f"{directory.name}: fonts is missing {font}")
    for key in RISE:
        if not data.get("rise", {}).get(key):
            raise ValueError(f"{directory.name}: rise is missing {key}")
    return data
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_theme.py -v`
Expected: PASS, 2 passed

- [ ] **Step 5: Commit**

```bash
git add adventure/theme.py tests/test_theme.py
git commit -m "feat: load a theme folder"
```

---

## Task 2: The base copy file and the merge

The base file holds every printed string once. A theme overrides the ones it wants in its own
voice and inherits the rest with its own noun dropped in.

**Files:**
- Create: `templates/themes/_base/copy.json`
- Modify: `adventure/theme.py`
- Modify: `tests/test_theme.py`

- [ ] **Step 1: Write the base copy file**

```json
{
  "start": "Open the first envelope",
  "geo": "Let them open when I arrive",
  "geoOn": "They will open when you arrive",
  "geoOff": "They will open on time instead",
  "open": "Open it",
  "seeEnvelope": "See the envelope",
  "sealHint": "Press and hold the seal",
  "hintHold": "Hold it until the gold ring closes.",
  "hintLast": "The last one.",
  "sealedLabel": "Sealed envelope",
  "nextEnvelope": "Next envelope",
  "firstReady": "Your first envelope. Hold the seal to open it.",
  "ready": "It is ready. Hold the seal to open it.",
  "allOpenLabel": "The whole road",
  "allOpenSub": "Your book has everything in it.",
  "readBook": "Read your book",
  "question": "A question for you",
  "answerPlaceholder": "Write it here…",
  "send": "Send it up as {a}",
  "sent": "It is {a} in your sky",
  "toastLabel": "Sent",
  "toastText": "Your answer is {a} now. It stays in your sky for the rest of the trip.",
  "emptySky": "Your answers become {many} here",
  "countLine": "tap one to read it",
  "back": "Back to your sky",
  "firstBack": "Your first {one} came back",
  "firstComesBack": "Your first {one} comes back",
  "memoHint": "Tap anywhere to let it go",
  "memoHintAgain": "Tap anywhere to let it go again",
  "print": "Print the book",
  "notAnswered": "Not answered on the trip. There is still room here.",
  "midnightLetters": "The midnight letters",
  "scanWatch": "Scan to watch",
  "scanListen": "Scan to listen",
  "heldBack": "Held back",
  "openedEarly": "Opened early",
  "backToTime": "Back to its time",
  "openNow": "Open now",
  "desk": "Made for a phone. On a computer, drag to look around the sky."
}
```

- [ ] **Step 2: Write the failing test**

Append to `tests/test_theme.py`:

```python
def test_copy_fills_the_rise_noun(tmp_path):
    loaded = theme.load(a_theme(tmp_path))
    words = theme.copy_for(loaded)
    assert words["send"] == "Send it up as a crane"
    assert words["emptySky"] == "Your answers become cranes here"
    assert words["firstBack"] == "Your first crane came back"


def test_a_theme_overrides_one_line_and_inherits_the_rest(tmp_path):
    d = a_theme(tmp_path, copy={"start": "Open the first letter"})
    words = theme.copy_for(theme.load(d))
    assert words["start"] == "Open the first letter"
    assert words["print"] == "Print the book"


def test_an_unfilled_placeholder_is_an_error(tmp_path):
    d = a_theme(tmp_path, copy={"start": "Open the first {box}"})
    with pytest.raises(ValueError, match="box"):
        theme.copy_for(theme.load(d))
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_theme.py -v`
Expected: FAIL, `AttributeError: module 'adventure.theme' has no attribute 'copy_for'`

- [ ] **Step 4: Add the merge to `adventure/theme.py`**

```python
PLACEHOLDER = re.compile(r"\{([a-z_]+)\}")


def base_copy():
    with open(BASE / "copy.json", encoding="utf-8") as fh:
        return json.load(fh)


def copy_for(loaded):
    """Base words, then the theme's own, with the theme's noun dropped into both.

    A journey file can override any of these again in the browser, so this is the middle layer of
    three and never the last word.
    """
    words = base_copy()
    words.update(loaded.get("copy") or {})
    rise = loaded["rise"]
    out = {}
    for key, line in words.items():
        filled = PLACEHOLDER.sub(lambda m: str(rise.get(m.group(1), m.group(0))), line)
        left = PLACEHOLDER.search(filled)
        if left:
            raise ValueError(f"{loaded['name']}: copy.{key} has nothing to put in {left.group(0)}")
        out[key] = filled
    return out
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_theme.py -v`
Expected: PASS, 5 passed

- [ ] **Step 6: Commit**

```bash
git add templates/themes/_base/copy.json adventure/theme.py tests/test_theme.py
git commit -m "feat: base copy file, merged under a theme's own words"
```

---

## Task 3: The theme writes its CSS

**Files:**
- Modify: `adventure/theme.py`
- Modify: `tests/test_theme.py`

- [ ] **Step 1: Write the failing test**

```python
def test_css_carries_every_token_and_the_fonts(tmp_path):
    css = theme.css(theme.load(a_theme(tmp_path)))
    for token in theme.TOKENS:
        assert f"--{token}: #112233;" in css
    assert '--display: "Zen Antique"' in css
    assert "fonts.googleapis.com/css2?family=Zen+Antique" in css
    assert css.startswith("/*")


def test_contrast_of_ivory_on_night(tmp_path):
    assert theme.contrast("#ffffff", "#000000") == 21
    assert theme.contrast("#f2e7cf", "#121a33") > 4.5
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_theme.py -k css -v`
Expected: FAIL, `AttributeError: module 'adventure.theme' has no attribute 'css'`

- [ ] **Step 3: Add to `adventure/theme.py`**

```python
CSS = """\
/* Written by `python3 -m adventure journey new` or `journey retheme`. Do not edit by hand:
   any change here is overwritten the next time a theme is applied. The theme is {name}. */
@import url("https://fonts.googleapis.com/css2?{query}&display=swap");
:root {{
{tokens}
{families}
}}
"""


def css(loaded):
    tokens = "\n".join(f"  --{k}: {loaded['palette'][k]};" for k in TOKENS)
    families = "\n".join(f'  --{k}: {loaded["fonts"][k]};' for k in FONTS)
    return CSS.format(name=loaded["name"], query=loaded["fonts"].get("query", ""),
                      tokens=tokens, families=families)


def _channel(value):
    v = int(value, 16) / 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _luminance(colour):
    r, g, b = (_channel(colour[i:i + 2]) for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(front, back):
    """WCAG contrast ratio, rounded the way the check reports it."""
    a, b = _luminance(front), _luminance(back)
    lo, hi = sorted((a, b))
    return round((hi + 0.05) / (lo + 0.05), 2)
```

The font families in `theme.json` must already carry their fallbacks, for example
`"display": "\"Zen Antique\", Georgia, serif"`. Update the fixture in `tests/test_theme.py` to
match, so `a_theme` sets `"display": "\"Zen Antique\", Georgia, serif"`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_theme.py -v`
Expected: PASS, 7 passed

- [ ] **Step 5: Commit**

```bash
git add adventure/theme.py tests/test_theme.py
git commit -m "feat: generate a theme's :root block and measure its contrast"
```

---

## Task 4: The three themes on disk

No new code. This is the content the rest of the plan needs to exist.

**Files:**
- Create: `templates/themes/lantern-night/theme.json` and `img/art/*`
- Create: `templates/themes/kyoto-woodblock/theme.json`
- Create: `templates/themes/canyon-ember/theme.json`
- Delete: `templates/styles/art-deco.json`, `templates/styles/wpa-screenprint.json`

- [ ] **Step 1: Move the art**

```bash
mkdir -p templates/themes/lantern-night/img/art
git mv templates/journey/public/img/art/sky.jpg templates/themes/lantern-night/img/art/sky.jpg
git mv templates/journey/public/img/art/moon.jpg templates/themes/lantern-night/img/art/moon.jpg
git mv templates/journey/public/img/art/lantern.png templates/themes/lantern-night/img/art/lantern.png
git mv templates/journey/public/img/art/envelope.jpg templates/themes/lantern-night/img/art/envelope.jpg
git mv templates/journey/public/img/art/envelope_t.jpg templates/themes/lantern-night/img/art/envelope_t.jpg
git mv templates/journey/public/img/art/liner.jpg templates/themes/lantern-night/img/art/liner.jpg
mv templates/journey/themes/kyoto-woodblock templates/themes/kyoto-woodblock
mv templates/journey/themes/canyon-ember templates/themes/canyon-ember
rmdir templates/journey/themes
```

`templates/journey/public/img/art/` is now empty and stays empty in the engine. A scaffolded app
gets its art from the theme.

- [ ] **Step 2: Write `templates/themes/lantern-night/theme.json`**

```json
{
  "name": "Lantern night",
  "house_prompt": "1930s art deco travel poster, stone lithograph print, flat areas of colour, limited palette of lacquer red, jade green, ochre gold, ivory, midnight indigo and misty grey-green, bold simplified silhouettes, strong diagonal composition, subtle paper grain, portrait 3:4",
  "avoid": ["photorealism", "3D render", "gradients", "phones", "extra people", "caricature"],
  "palette": {
    "night": "#121a33", "night-deep": "#070a14", "gold": "#d6a13f", "gold-soft": "#f0cf86",
    "red": "#b3342b", "jade": "#2e6a5c", "ivory": "#f2e7cf", "paper": "#efe3c6",
    "mist": "#a4bcb8", "ink": "#1b2340", "ink-soft": "#3b4054"
  },
  "fonts": {
    "display": "\"Limelight\", \"Didot\", Georgia, serif",
    "deco": "\"Poiret One\", \"Josefin Sans\", sans-serif",
    "label": "\"Josefin Sans\", \"Futura\", \"Avenir Next\", sans-serif",
    "text": "\"Cormorant Garamond\", Georgia, serif",
    "query": "family=Limelight&family=Poiret+One&family=Josefin+Sans:wght@400;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500"
  },
  "rise": {"asset": "lantern.png", "a": "a lantern", "one": "lantern", "many": "lanterns"},
  "copy": {}
}
```

- [ ] **Step 3: Write `templates/themes/kyoto-woodblock/theme.json`**

```json
{
  "name": "Kyoto woodblock",
  "house_prompt": "Japanese woodblock print in the ukiyo-e manner, night scene, flat areas of hand pulled colour, visible woodgrain and slight registration offset, limited palette of indigo, vermilion, washi cream, moss green and soot black, no gradients, fine paper fibre texture, portrait 3:4",
  "avoid": ["photorealism", "3D render", "gradients", "phones", "crowds", "caricature", "signature", "seal stamp"],
  "palette": {
    "night": "#16243d", "night-deep": "#0c1526", "gold": "#f3a24a", "gold-soft": "#fae3b5",
    "red": "#b3342b", "jade": "#3f6f63", "ivory": "#efe8d2", "paper": "#eee7d1",
    "mist": "#7d94ab", "ink": "#16233f", "ink-soft": "#3d4a63"
  },
  "fonts": {
    "display": "\"Zen Antique\", Georgia, serif",
    "deco": "\"Zen Antique\", Georgia, serif",
    "label": "\"Zen Kaku Gothic New\", \"Avenir Next\", sans-serif",
    "text": "\"Shippori Mincho\", Georgia, serif",
    "query": "family=Zen+Antique&family=Zen+Kaku+Gothic+New:wght@400;700&family=Shippori+Mincho:wght@400;600"
  },
  "rise": {"asset": "crane.png", "a": "a crane", "one": "crane", "many": "cranes"},
  "copy": {
    "sealHint": "Press and hold the seal",
    "hintHold": "Hold it until the gold ring closes."
  }
}
```

- [ ] **Step 4: Write `templates/themes/canyon-ember/theme.json`**

```json
{
  "name": "Canyon ember",
  "house_prompt": "1930s WPA national park screenprint, flat layered silkscreen colour, visible layer registration, bold simplified forms, limited palette of burnt orange, forest green, dusk purple, cream and deep navy, no gradients, slight paper texture, portrait 3:4",
  "avoid": ["photorealism", "3D render", "gradients", "phones", "crowds", "caricature"],
  "palette": {
    "night": "#17213c", "night-deep": "#0b1223", "gold": "#cc662c", "gold-soft": "#f2eccc",
    "red": "#c4552f", "jade": "#35573f", "ivory": "#efe8d2", "paper": "#eee7d1",
    "mist": "#8c7aa0", "ink": "#122242", "ink-soft": "#3a4560"
  },
  "fonts": {
    "display": "\"Bebas Neue\", Impact, sans-serif",
    "deco": "\"Bebas Neue\", Impact, sans-serif",
    "label": "\"Oswald\", \"Avenir Next\", sans-serif",
    "text": "\"Libre Baskerville\", Georgia, serif",
    "query": "family=Bebas+Neue&family=Oswald:wght@400;600&family=Libre+Baskerville:ital@0;1"
  },
  "rise": {"asset": "ember.png", "a": "an ember", "one": "ember", "many": "embers"},
  "copy": {
    "hintHold": "Hold it until the ring burns closed.",
    "emptySky": "Your answers go up as {many} here"
  }
}
```

- [ ] **Step 5: Delete the old style files**

```bash
git rm templates/styles/art-deco.json templates/styles/wpa-screenprint.json
```

- [ ] **Step 6: Check every theme loads**

Run:
```bash
.venv/bin/python -c "
from adventure import theme
for n in ('lantern-night','kyoto-woodblock','canyon-ember'):
    t = theme.load(n); w = theme.copy_for(t)
    print(n, theme.contrast(t['palette']['ivory'], t['palette']['night']), w['send'])
"
```
Expected: three lines, each with a contrast ratio above 4.5 and the theme's own sentence, for
example `kyoto-woodblock 11.34 Send it up as a crane`.

- [ ] **Step 7: Commit**

```bash
git add -A templates/themes templates/styles templates/journey/public/img
git commit -m "feat: three themes on disk, replacing the two style files"
```

---

## Task 5: `journey new --theme` applies a theme to a scaffolded app

**Files:**
- Modify: `adventure/journey.py:330-353` (`new`)
- Modify: `adventure/theme.py`
- Modify: `tests/test_journey.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_journey.py`:

```python
def test_new_copies_the_theme_art_and_writes_the_generated_files(tmp_path):
    app = journey.new(ENGINE, tmp_path / "app", theme="kyoto-woodblock")
    art = app / "public" / "img" / "art"
    assert (art / "rise.png").exists()
    assert not (art / "crane.png").exists()
    assert (app / "public" / "css" / "theme.css").read_text().count("--night:") == 1
    words = json.loads((app / "public" / "data" / "theme.json").read_text())
    assert words["copy"]["send"] == "Send it up as a crane"
    assert words["rise"]["many"] == "cranes"
```

`ENGINE` is already imported at the top of `tests/test_journey.py`; if it is not, add
`from adventure.__main__ import ENGINE`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_journey.py -k theme -v`
Expected: FAIL, `TypeError: new() got an unexpected keyword argument 'theme'`

- [ ] **Step 3: Add `apply_to` to `adventure/theme.py`**

```python
def apply_to(app, name_or_path):
    """Put a theme into a scaffolded app: its art, its words, its colours.

    Everything written here is generated. The app keeps no link back to the theme folder, so a
    deployed journey carries one set of art and works with the plugin uninstalled.
    """
    app = Path(app)
    loaded = load(name_or_path)
    art = app / "public" / "img" / "art"
    art.mkdir(parents=True, exist_ok=True)
    source = loaded["dir"] / "img" / "art"
    for name in ART:
        src = source / (loaded["rise"]["asset"] if name == "rise.png" else name)
        if not src.exists():
            raise FileNotFoundError(f"{loaded['dir'].name}: no {src.name} to copy in as {name}")
        shutil.copyfile(src, art / name)
    data = {"name": loaded["name"], "rise": loaded["rise"], "copy": copy_for(loaded)}
    out = app / "public" / "data" / "theme.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    (app / "public" / "css" / "theme.css").write_text(css(loaded), encoding="utf-8")
    return loaded
```

Add `import shutil` at the top of `adventure/theme.py`.

- [ ] **Step 4: Call it from `journey.new`**

In `adventure/journey.py`, change the signature and the tail of `new`:

```python
def new(template, dest, trip=None, midnight=None, theme_name="lantern-night"):
    """Copy the engine to a new app, dressed in a theme. With a planning trip file it also drafts
    the stops, leaving every line of writing empty: the dates and the places can be worked out,
    the words cannot."""
```

and after `shutil.copytree(...)`:

```python
    from . import theme as theme_mod
    theme_mod.apply_to(dest, theme_name)
    if trip:
        with open(trip, encoding="utf-8") as fh:
            _write(dest, _draft(json.load(fh), midnight))
    return dest
```

The import is local because `theme` imports nothing from `journey` and a module-level import here
would be the only cycle risk in the package.

- [ ] **Step 5: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_journey.py -v`
Expected: PASS, all tests in the file

- [ ] **Step 6: Commit**

```bash
git add adventure/theme.py adventure/journey.py tests/test_journey.py
git commit -m "feat: journey new dresses the app in a theme"
```

---

## Task 6: `journey retheme` changes an app's mind

**Files:**
- Modify: `adventure/journey.py`
- Modify: `tests/test_journey.py`

- [ ] **Step 1: Write the failing test**

```python
def test_retheme_swaps_the_art_and_the_words(tmp_path):
    app = journey.new(ENGINE, tmp_path / "app", theme="kyoto-woodblock")
    journey.retheme(app, "canyon-ember")
    words = json.loads((app / "public" / "data" / "theme.json").read_text())
    assert words["copy"]["send"] == "Send it up as an ember"


def test_retheme_refuses_an_app_with_answers_in_it(tmp_path):
    app = journey.new(ENGINE, tmp_path / "app", theme="kyoto-woodblock")
    trip = _read(app) if False else json.loads((app / "public" / "data" / "trip.json").read_text())
    trip["answers"] = {"inari": "with you"}
    (app / "public" / "data" / "trip.json").write_text(json.dumps(trip))
    with pytest.raises(ValueError, match="answered"):
        journey.retheme(app, "canyon-ember")
```

If `public/data/trip.json` does not exist in a bare scaffold, write a minimal one in the test
first: `{"journey": {"title": "T"}, "stops": [], "answers": {...}}`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_journey.py -k retheme -v`
Expected: FAIL, `AttributeError: module 'adventure.journey' has no attribute 'retheme'`

- [ ] **Step 3: Implement**

```python
def retheme(app, theme_name):
    """Dress an existing app in a different theme.

    A traveller's own sent answer was written under one noun and reading it back under another
    would put words in their mouth, so an app that has been travelled is left alone.
    """
    from . import theme as theme_mod
    app = Path(app)
    trip = app / "public" / "data" / "trip.json"
    if trip.exists():
        with open(trip, encoding="utf-8") as fh:
            if json.load(fh).get("answers"):
                raise ValueError("this journey has been answered; retheming it would rewrite "
                                 "words the traveller has already read")
    return {"app": str(app), "theme": theme_mod.apply_to(app, theme_name)["name"]}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_journey.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add adventure/journey.py tests/test_journey.py
git commit -m "feat: journey retheme, refused once a journey has answers in it"
```

---

## Task 7: The browser reads the theme's words

**Files:**
- Create: `templates/journey/public/js/copy.js`
- Modify: `templates/journey/public/js/bind.js`
- Modify: `templates/journey/public/index.html`

- [ ] **Step 1: Write `copy.js`**

```javascript
// The words. Three layers, lowest first: the base copy file, the theme's own lines, and the
// journey file, which always wins. Only the third is loaded in the browser as a separate thing:
// the first two were merged into public/data/theme.json when the theme was applied.
let WORDS = {};
let RISE = { a: 'a lantern', one: 'lantern', many: 'lanterns' };

export function setCopy(theme, journey) {
  WORDS = { ...(theme && theme.copy), ...((journey && journey.copy) || {}) };
  if (theme && theme.rise) RISE = theme.rise;
}

export const rise = () => RISE;

// A missing key shows itself rather than printing nothing, because an empty button is harder to
// spot in a rehearsal than a visible key name.
export function t(key, vars) {
  let line = WORDS[key];
  if (line == null) return `[${key}]`;
  if (vars) for (const [k, v] of Object.entries(vars)) line = line.split(`{${k}}`).join(v);
  return line;
}
```

- [ ] **Step 2: Bind `data-t` in `bind.js`**

Add to `templates/journey/public/js/bind.js`, and export it:

```javascript
import { t } from './copy.js';

// data-j is a word from this journey. data-t is a word from this theme. A journey that sets a
// line in its own copy block has already won by the time t() is asked, so the two never fight.
export function bindTheme(root) {
  for (const el of root.querySelectorAll('[data-t]')) {
    const v = t(el.dataset.t);
    const attr = el.dataset.tAttr;
    if (attr) el.setAttribute(attr, v);
    else el.textContent = v;
  }
}
```

- [ ] **Step 3: Load the theme file and call it**

In `templates/journey/public/js/app.js`, where the journey file is fetched, fetch the theme
alongside it and set the copy before the first render:

```javascript
import { setCopy } from './copy.js';
import { bindCopy, bindTheme } from './bind.js';

const [trip, themeFile] = await Promise.all([
  fetch('data/trip.json').then((r) => r.json()),
  fetch('data/theme.json').then((r) => r.json()),
]);
setCopy(themeFile, trip.journey);
bindTheme(document);
bindCopy(document, trip.journey);
```

Match the existing fetch and call sites rather than pasting this verbatim: the file already loads
`data/trip.json` and calls `bindCopy`, so the change is one extra fetch, one `setCopy` and one
`bindTheme` immediately before the existing `bindCopy`.

- [ ] **Step 4: Put `data-t` on every fixed string in `index.html`**

Each of these keeps its element and its id. The text node between the tags is deleted and the
attribute added, for example:

```html
<button class="btn gold-btn" id="startBtn" data-t="start"></button>
<button class="geo" id="geoBtn" aria-pressed="false" data-t="geo"></button>
<button class="btn" id="openBtn" data-t="open"></button>
<div class="lbl gold2" id="hintLbl" data-t="sealHint"></div>
<div class="lbl gold" data-t="question"></div>
<button class="btn" id="sendBtn" data-t="send"></button>
<div class="answered-note" data-t="sent"></div>
<button class="btn" id="doneBtn" data-t="back"></button>
<button class="btn" id="midDone" data-t="back"></button>
<button class="btn" id="printBtn" data-t="print"></button>
<div class="lbl mist" id="memoHint" data-t="memoHint"></div>
<div class="lbl gold" id="toastLbl" data-t="toastLabel"></div>
<p id="toastText" data-t="toastText"></p>
<textarea id="answer" rows="3" aria-label="Your answer" data-t="answerPlaceholder" data-t-attr="placeholder"></textarea>
```

The desk note keeps its `data-j="title"` span and its second half becomes
`<span data-t="desk"></span>`.

- [ ] **Step 5: Swap the stylesheet links**

In `index.html`, replace the hardcoded Google Fonts `<link>` and `css/lantern.css` with:

```html
<link rel="stylesheet" href="css/theme.css">
<link rel="stylesheet" href="css/journey.css">
```

`theme.css` carries the font `@import`, so the `<link>` to Google Fonts goes. Keep both
`preconnect` lines.

- [ ] **Step 6: Check it in a browser**

Run:
```bash
.venv/bin/python -m adventure journey new /tmp/themecheck/app --theme kyoto-woodblock
cd /tmp/themecheck/app && python3 server.py &
```
Open `http://localhost:8000`. Expected: the welcome screen reads "Open the first envelope" in Zen
Antique over the Kyoto sky. Nothing shows `[key]`.

- [ ] **Step 7: Commit**

```bash
git add templates/journey/public/js/copy.js templates/journey/public/js/bind.js templates/journey/public/js/app.js templates/journey/public/index.html
git commit -m "feat: the app prints the theme's words"
```

---

## Task 8: The strings inside the JS

**Files:**
- Modify: `templates/journey/public/js/app.js`
- Modify: `templates/journey/public/js/book.js`
- Modify: `templates/journey/public/js/key.js`

- [ ] **Step 1: Replace them, key by key**

Import `t` and `rise` at the top of each file, then apply this table. Left is what is in the
source today, right is what replaces it.

| File | Today | Becomes |
|---|---|---|
| app.js | `'Sealed envelope'` | `t('sealedLabel')` |
| app.js | `'The whole road'` | `t('allOpenLabel')` |
| app.js | `'Your book has everything in it.'` | `t('allOpenSub')` |
| app.js | `'Read your book'` | `t('readBook')` |
| app.js | `` `Next envelope · ${t}` `` | `` `${t('nextEnvelope')} · ${time}` `` |
| app.js | `'Next envelope · 00:00'` | `` `${t('nextEnvelope')} · 00:00` `` |
| app.js | `'Your first envelope. Hold the seal to open it.'` | `t('firstReady')` |
| app.js | `'It is ready. Hold the seal to open it.'` | `t('ready')` |
| app.js | `'See the envelope'` | `t('seeEnvelope')` |
| app.js | `'Open it'` | `t('open')` |
| app.js | `'Your answers become lanterns here'` | `t('emptySky')` |
| app.js | `` `${n} ${n === 1 ? 'lantern' : 'lanterns'} · tap one to read it` `` | `` `${n} ${n === 1 ? rise().one : rise().many} · ${t('countLine')}` `` |
| app.js | `'The last one.'` | `t('hintLast')` |
| app.js | `'Hold it until the gold ring closes.'` | `t('hintHold')` |
| app.js | `'Happy birthday.'` | `journey.midnight?.hint \|\| t('hintHold')` |
| app.js | `'Your first lantern came back'` | `t('firstBack')` |
| app.js | `'Tap anywhere to let it go again'` | `t('memoHintAgain')` |
| app.js | `'They will open when you arrive'` | `t('geoOn')` |
| app.js | `'They will open on time instead'` | `t('geoOff')` |
| book.js | `'Not answered on the trip. There is still room here.'` | `t('notAnswered')` |
| book.js | `'The midnight letters'` | `t('midnightLetters')` |
| book.js | `'Scan to watch'` | `t('scanWatch')` |
| book.js | `'Scan to listen'` | `t('scanListen')` |
| book.js | `'Your first lantern comes back'` | `t('firstComesBack')` |
| key.js | `'Held back'` | `t('heldBack')` |
| key.js | `'Opened early'` | `t('openedEarly')` |
| key.js | `'Back to its time'` | `t('backToTime')` |
| key.js | `'Open now'` | `t('openNow')` |

The `` `Next envelope · ${t}` `` line uses a local variable also called `t`. Rename that local to
`time` in `renderSheet` before importing the helper, or the helper is shadowed and every label in
that function silently becomes a time string.

`'Happy birthday.'` is not a theme word. It moves to the journey file as
`journey.midnight.hint`, and `trip.example.json` gains that key.

- [ ] **Step 2: Rename the lantern variables in `sky.js` and `app.js`**

`sky.js` exports `addLantern`, `lanterns`, `lanternAt` and loads `img/art/lantern.png`. Rename to
`addRise`, `risen`, `riseAt` and `img/art/rise.png`. Update the call sites in `app.js`
(`syncLanterns` becomes `syncRisen`). This is a rename with no behaviour change.

Run: `grep -rn "lantern" templates/journey/public/js/ templates/journey/public/index.html`
Expected: no hits except in `journey.css`'s class names if any remain.

- [ ] **Step 3: Check nothing prints a missing key**

Run:
```bash
cd /tmp/themecheck/app && node qa/rehearse.mjs
grep -rl "\[.*\]" qa/out/ || echo "no missing keys"
```
Expected: the rehearsal completes and no screenshot shows a `[key]` placeholder. Look at the
screenshots, not only the exit code.

- [ ] **Step 4: Commit**

```bash
git add templates/journey/public/js templates/trip.example.json
git commit -m "feat: the strings in the JS come from the theme"
```

---

## Task 9: Split the CSS

**Files:**
- Modify: `templates/journey/public/css/lantern.css` (renamed)
- Modify: `templates/guide.css`
- Modify: `templates/day.html`
- Modify: `adventure/render.py`
- Modify: `tests/test_render.py`

- [ ] **Step 1: Rename and strip the app CSS**

```bash
git mv templates/journey/public/css/lantern.css templates/journey/public/css/journey.css
```

Delete the whole `:root { ... }` block at the top of `journey.css`, lines 1 to 19, keeping
`--safe-t` and `--safe-b`, which are not a theme's business:

```css
:root {
  --safe-t: env(safe-area-inset-top, 0px);
  --safe-b: env(safe-area-inset-bottom, 0px);
}
```

- [ ] **Step 2: Write the failing test for the guide**

In `tests/test_render.py`:

```python
def test_render_day_writes_the_theme_tokens_into_the_page(tmp_path):
    from adventure import theme
    out = render.render_day(A_DAY, "templates/day.html", tmp_path / "day.html",
                            theme=theme.load("kyoto-woodblock"))
    page = out.read_text() if hasattr(out, "read_text") else open(out).read()
    assert "--gold: #f3a24a;" in page
    assert "family=Zen+Antique" in page
```

`A_DAY` is the day dict the file's existing tests already build; reuse it.

- [ ] **Step 3: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_render.py -k theme -v`
Expected: FAIL, `TypeError: render_day() got an unexpected keyword argument 'theme'`

- [ ] **Step 4: Change `day.html` and `render_day`**

In `templates/day.html`, replace the Google Fonts `<link>` and add a style block:

```html
<style>$theme_css</style>
<link rel="stylesheet" href="guide.css">
```

Delete the `:root` block from `templates/guide.css` the same way.

In `adventure/render.py`:

```python
def render_day(day, template_path, out_path, theme=None):
    from . import theme as theme_mod
    loaded = theme or theme_mod.load("lantern-night")
    with open(template_path, encoding="utf-8") as fh:
        template = string.Template(fh.read())
    page = template.substitute(
        theme_css=theme_mod.css(loaded),
        title=html.escape(day["title"]), day_number=str(day["number"]), date=html.escape(day["date"]),
        poster=html.escape(day["poster"]), poster_alt=html.escape(day.get("poster_alt", "")),
        caption=html.escape(day.get("caption", "")), history=html.escape(day.get("history", "")),
        rows="\n".join(row_html(row) for row in day.get("rows", [])))
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(page)
    return out_path
```

The parameter and the module share a name, so the module is imported as `theme_mod` inside the
function. Renaming the parameter instead would change the call sites in the skills.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_render.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add templates adventure/render.py tests/test_render.py
git commit -m "feat: the printed guide takes its colours from the theme"
```

---

## Task 10: The poster prompts take a theme

**Files:**
- Modify: `adventure/poster.py`
- Modify: `adventure/__main__.py`
- Modify: `tests/test_poster.py`

- [ ] **Step 1: Write the failing test**

```python
def test_build_prompt_reads_a_named_theme():
    from adventure import theme
    text = poster.build_prompt("A fox shrine at dusk", theme.load("kyoto-woodblock"))
    assert "ukiyo-e" in text
    assert "Avoid photorealism" in text
    assert "no letters" in text
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_poster.py -k theme -v`
Expected: FAIL, the loaded theme has no `house_prompt` at the path `load_style` expects, or the
test errors on the import.

- [ ] **Step 3: Delete `load_style` and point the CLI at `theme.load`**

`build_prompt` already reads `style["house_prompt"]` and `style.get("avoid")`, which a theme has,
so its body does not change. Delete `poster.load_style` and in `adventure/__main__.py`:

```python
    for name in ("prompt", "poster", "flow-card"):
        ...
        p.add_argument("--theme", required=True, help="a theme name or a path to a theme folder")
```

and in the dispatch:

```python
    elif args.cmd in ("prompt", "poster", "flow-card"):
        text = poster.build_prompt(args.concept, theme.load(args.theme), args.reference_note)
```

Add `theme` to the `from . import ...` line at the top.

- [ ] **Step 4: Add `--theme` to `journey`**

```python
    p = sub.add_parser("journey", help="check, scaffold, build or retheme an interactive journey")
    p.add_argument("action", choices=["check", "new", "build", "retheme"])
    p.add_argument("app")
    p.add_argument("--trip", help="a planning trip.json to draft the stops from")
    p.add_argument("--theme", default="lantern-night", help="a theme name or a path to a theme folder")
    p.add_argument("--template", help="where to copy the engine from (default: the plugin's templates/journey)")
```

and in the dispatch:

```python
        if args.action == "new":
            _print({"app": str(journey.new(args.template or ENGINE, args.app, args.trip,
                                           theme_name=args.theme))})
        if args.action == "retheme":
            _print(journey.retheme(args.app, args.theme))
```

- [ ] **Step 5: Run the whole suite**

Run: `.venv/bin/python -m pytest -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add adventure tests
git commit -m "feat: --theme replaces --style across the commands"
```

---

## Task 11: The four new checks

**Files:**
- Modify: `adventure/journey.py:93-167` (`check`)
- Modify: `tests/test_journey.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_check_fails_on_a_missing_art_file(tmp_path):
    app = journey.new(ENGINE, tmp_path / "app", theme="kyoto-woodblock")
    (app / "public" / "img" / "art" / "moon.jpg").unlink()
    assert any("moon.jpg" in e for e in journey.check(app)["errors"])


def test_check_fails_on_art_of_the_wrong_size(tmp_path):
    from PIL import Image
    app = journey.new(ENGINE, tmp_path / "app", theme="kyoto-woodblock")
    Image.new("RGB", (10, 10)).save(app / "public" / "img" / "art" / "sky.jpg")
    assert any("sky.jpg" in e and "768" in e for e in journey.check(app)["errors"])


def test_check_fails_on_a_missing_word(tmp_path):
    app = journey.new(ENGINE, tmp_path / "app", theme="kyoto-woodblock")
    path = app / "public" / "data" / "theme.json"
    data = json.loads(path.read_text())
    data["copy"].pop("send")
    path.write_text(json.dumps(data))
    assert any("send" in e for e in journey.check(app)["errors"])


def test_check_fails_on_unreadable_contrast(tmp_path):
    app = journey.new(ENGINE, tmp_path / "app", theme="kyoto-woodblock")
    css = app / "public" / "css" / "theme.css"
    css.write_text(css.read_text().replace("--ivory: #efe8d2;", "--ivory: #1a2740;"))
    assert any("contrast" in e for e in journey.check(app)["errors"])
```

- [ ] **Step 2: Run them to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_journey.py -k check -v`
Expected: FAIL, four failures, each an empty `errors` list

- [ ] **Step 3: Add the checks**

In `adventure/journey.py`, inside `check`, after the existing stop checks and before the return:

```python
    from . import theme as theme_mod
    art = Path(app) / "public" / "img" / "art"
    for name, (want_w, want_h) in theme_mod.ART.items():
        path = art / name
        if not path.exists():
            errors.append(f"the theme art is missing {name}")
            continue
        with Image.open(path) as im:
            if im.size != (want_w, want_h):
                errors.append(f"{name} is {im.size[0]}x{im.size[1]}, the engine draws it at "
                              f"{want_w}x{want_h}")

    theme_file = Path(app) / "public" / "data" / "theme.json"
    if not theme_file.exists():
        errors.append("there is no public/data/theme.json; run journey retheme")
    else:
        with open(theme_file, encoding="utf-8") as fh:
            words = json.load(fh).get("copy", {})
        for key in theme_mod.base_copy():
            if not words.get(key):
                errors.append(f"the theme has no word for {key}")

    css_file = Path(app) / "public" / "css" / "theme.css"
    if css_file.exists():
        found = dict(re.findall(r"--([a-z-]+): (#[0-9a-fA-F]{6});", css_file.read_text(encoding="utf-8")))
        if "ivory" in found and "night" in found:
            ratio = theme_mod.contrast(found["ivory"], found["night"])
            if ratio < 4.5:
                errors.append(f"contrast of ivory on night is {ratio}:1, under the 4.5:1 that "
                              f"keeps body text readable")
```

Add `from PIL import Image` at the top of `adventure/journey.py`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_journey.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add adventure/journey.py tests/test_journey.py
git commit -m "feat: journey check tests the theme's art, words and contrast"
```

---

## Task 12: `theme new` scaffolds a theme

**Files:**
- Modify: `adventure/theme.py`
- Modify: `adventure/__main__.py`
- Modify: `tests/test_theme.py`

- [ ] **Step 1: Write the failing test**

```python
def test_theme_new_writes_a_folder_with_prompts(tmp_path):
    made = theme.new("harbour-dusk", tmp_path / "harbour-dusk")
    data = json.loads((made / "theme.json").read_text())
    assert data["name"] == "Harbour dusk"
    assert set(data["palette"]) == set(theme.TOKENS)
    assert data["copy"] == {}
    prompts = (made / "PROMPTS.md").read_text()
    assert "768 by 1376" in prompts
    assert "rise.png" in prompts


def test_theme_new_refuses_to_overwrite(tmp_path):
    theme.new("harbour-dusk", tmp_path / "harbour-dusk")
    with pytest.raises(FileExistsError):
        theme.new("harbour-dusk", tmp_path / "harbour-dusk")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_theme.py -k new -v`
Expected: FAIL, `AttributeError: module 'adventure.theme' has no attribute 'new'`

- [ ] **Step 3: Implement**

```python
PROMPTS = """\
# Art for {title}

Six files. Five are generated, the sixth is cut from the fourth. Every prompt ends with no text,
no lettering and no signature, because a word printed into the art cannot be translated and cannot
be removed.

Generators mostly offer 16:9 and 9:16. Generate at the ratio named, then run
`adventure theme cut {name} <folder>` and the sizes below are what comes out.

| File | Ends at | Generate at | What it is |
|---|---|---|---|
| `sky.jpg` | 768 by 1376 | 9:16 | the night behind everything. No moon. Keep the top third open and dark enough for pale text, and the bottom third quiet, because a sheet covers it. |
| `moon.jpg` | 768 by 768 | 16:9 | one disc, filling the frame edge to edge. No sky around it, no rings, no border. |
| `rise.png` | 360 by 470 | 9:16 | the thing that goes up when a question is answered, on a flat background that is nothing like the object. It is drawn 44 pixels wide, so it has to read as a silhouette. |
| `envelope.jpg` | 920 by 649 | 16:9 | a flat sheet of paper, evenly lit. Not an envelope: no flap, no fold, no seal, nothing resting on it. |
| `envelope_t.jpg` | 150 by 105 | cut from the above | nothing to generate |
| `liner.jpg` | 640 by 640 | 16:9 | a repeating pattern for the inside of the envelope. Same size everywhere, no focal point, no border. |

Write the house style once and paste it into all five:

> {house}
"""


def new(name, dest):
    """Scaffold a theme folder to fill in, with the art brief beside it."""
    dest = Path(dest)
    if dest.exists():
        raise FileExistsError(f"{dest} already exists")
    (dest / "img" / "art").mkdir(parents=True)
    title = name.replace("-", " ").replace("_", " ").capitalize()
    base = load("lantern-night")
    data = {
        "name": title,
        "house_prompt": "",
        "avoid": ["photorealism", "3D render", "gradients", "phones", "crowds", "caricature"],
        "palette": dict(base["palette"]),
        "fonts": dict(base["fonts"]),
        "rise": {"asset": "rise.png", "a": "a lantern", "one": "lantern", "many": "lanterns"},
        "copy": {},
    }
    (dest / "theme.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    (dest / "PROMPTS.md").write_text(
        PROMPTS.format(title=title, name=name, house="Your house style goes here."), encoding="utf-8")
    return dest
```

- [ ] **Step 4: Wire the command**

In `adventure/__main__.py`:

```python
    p = sub.add_parser("theme", help="scaffold a theme or cut its art")
    p.add_argument("action", choices=["new", "cut"])
    p.add_argument("name")
    p.add_argument("--dest", help="where to write it (default: the plugin's templates/themes/<name>)")
    p.add_argument("--from", dest="source", help="a folder of generated images, for cut")
```

```python
    elif args.cmd == "theme":
        if args.action == "new":
            _print({"theme": str(theme.new(args.name, args.dest or theme.THEMES / args.name))})
        else:
            _print(theme_cut.run(args.name, args.source, dest=args.dest))
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_theme.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add adventure tests
git commit -m "feat: theme new scaffolds a theme and its art brief"
```

---

## Task 13: `theme cut` turns generated images into art

This is the one piece with real image work in it. All three behaviours below were arrived at by
watching each one fail on real generated images.

**Files:**
- Create: `adventure/theme_cut.py`
- Create: `tests/test_theme_cut.py`
- Modify: `pyproject.toml`

- [ ] **Step 1: Add the extra**

In `pyproject.toml`:

```toml
[project.optional-dependencies]
posters = ["google-genai>=1.0"]
ocr = ["pytesseract>=0.3"]
themes = ["numpy>=1.24"]
dev = ["pytest>=8", "numpy>=1.24"]
```

- [ ] **Step 2: Write the failing tests**

```python
# tests/test_theme_cut.py
from PIL import Image
import pytest

from adventure import theme_cut

CREAM = (237, 224, 197)
NAVY = (27, 35, 64)
FLAME = (204, 102, 44)


def bordered(size=(400, 500), margin=30, notch=True):
    """A dark picture inside a printed cream margin, with a torn corner over part of the top."""
    im = Image.new("RGB", size, CREAM)
    im.paste(NAVY, (margin, margin, size[0] - margin, size[1] - margin))
    if notch:
        im.paste(CREAM, (margin, margin, margin + 120, margin + 40))
    return im


def test_margin_trim_eats_the_notch_too():
    out = theme_cut.strip_border(bordered())
    assert out.getpixel((0, 0)) == NAVY
    assert out.size[0] < 400


def test_a_disc_on_a_card_comes_out_filling_the_square():
    im = Image.new("RGB", (400, 500), CREAM)
    Image.Image  # a grey disc on the cream card
    from PIL import ImageDraw
    ImageDraw.Draw(im).ellipse((100, 150, 300, 350), fill=(210, 210, 210))
    out = theme_cut.moon(im, "trim", size=120)
    assert out.size == (120, 120)
    assert out.getpixel((60, 60)) == pytest.approx((210, 210, 210), abs=6)
    assert out.getpixel((60, 4))[0] < 235


def test_a_sprite_keeps_a_background_colour_its_subject_encloses():
    im = Image.new("RGB", (200, 260), NAVY)
    from PIL import ImageDraw
    d = ImageDraw.Draw(im)
    d.ellipse((50, 60, 150, 200), fill=FLAME)
    d.ellipse((85, 100, 115, 160), fill=NAVY)      # navy the flame encloses
    out = theme_cut.sprite(im, 120, 156)
    assert out.mode == "RGBA"
    middle = out.getpixel((out.width // 2, out.height // 2))
    assert middle[3] > 200                          # the enclosed navy survived
    assert out.getpixel((1, 1))[3] == 0             # the outside did not
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_theme_cut.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'adventure.theme_cut'`

- [ ] **Step 4: Write the module**

```python
"""Turn a folder of generated images into the six files the engine draws.

Three things here are not obvious, and each one is a bug that reached a screen before it was
understood:

* A generator prints a paper margin, and sometimes a torn corner covering part of one edge. A line
  counts as margin while any meaningful part of it is still the margin colour, not only while all
  of it is.
* A moon needs two different crops. One that runs past its frame wants a centre square. One
  sitting on a plain card wants the card eaten up to the disc. Using the wrong one leaves dark
  corners inside the circle the shader draws.
* A sprite has to be keyed by flooding in from the edges, not by distance from the background
  colour, or a colour the subject encloses is punched out of the middle of it. The background is
  then unmixed out of the edge pixels, or a dark fringe rings the object against the night.
"""
from collections import deque
from pathlib import Path

from PIL import Image

try:
    import numpy as np
except ImportError:  # pragma: no cover
    raise SystemExit("theme cut needs numpy: pip install 'great-adventure[themes]'")

from . import theme


def strip_border(im, tol=30, cap=0.15, extra=5, strict=False):
    a = np.asarray(im.convert("RGB")).astype(float)
    h, w, _ = a.shape
    corners = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3),
                              a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)])
    c = np.median(corners, axis=0)

    def is_margin(line):
        if strict:
            return np.abs(line - c).mean() < tol
        return (np.sqrt(((line - c) ** 2).sum(axis=1)) < tol * 1.7).mean() > 0.15

    def walk(lines, limit):
        n = 0
        for line in lines:
            if not is_margin(line):
                break
            n += 1
            if n >= limit:
                return 0          # the whole edge matches, so there is no margin to find
        return n

    lh, lw = int(h * cap), int(w * cap)
    top = walk([a[y] for y in range(lh)], lh)
    bottom = walk([a[h - 1 - y] for y in range(lh)], lh)
    left = walk([a[:, x] for x in range(lw)], lw)
    right = walk([a[:, w - 1 - x] for x in range(lw)], lw)
    if max(top, bottom, left, right) == 0:
        return im
    box = (left + extra if left else 0, top + extra if top else 0,
           w - (right + extra if right else 0), h - (bottom + extra if bottom else 0))
    return im.crop(box)


def cover(im, tw, th, bias=0.5):
    w, h = im.size
    s = max(tw / w, th / h)
    im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    x, y = round((im.width - tw) * bias), round((im.height - th) * bias)
    return im.crop((x, y, x + tw, y + th))


def moon(im, mode, size=768):
    """`fill` for a disc that runs past its frame, `trim` for one sitting on a plain card."""
    if mode == "trim":
        return cover(strip_border(im, tol=18, cap=0.45, extra=0, strict=True), size, size)
    return cover(strip_border(im), size, size)


def _background(a, tol):
    h, w, _ = a.shape
    c = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)
    near = np.sqrt(((a - c) ** 2).sum(axis=2)) < tol
    bg = np.zeros((h, w), bool)
    q = deque()
    for y in range(h):
        for x in (0, w - 1):
            if near[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    for x in range(w):
        for y in (0, h - 1):
            if near[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))
    return bg, c


def sprite(im, tw, th, tol=60, feather=26, pad=0.05):
    a = np.asarray(strip_border(im).convert("RGB")).astype(float)
    bg, c = _background(a, tol)
    d = np.sqrt(((a - c) ** 2).sum(axis=2))
    alpha = np.where(bg, np.clip((d - tol + feather) / feather, 0, 1), 1.0)
    safe = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip((a - c * (1 - safe)) / safe, 0, 255)
    ys, xs = np.where(alpha > 0.4)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    px, py = round((x1 - x0) * pad), round((y1 - y0) * pad)
    cut = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), "RGBA").crop(
        (max(0, x0 - px), max(0, y0 - py), min(a.shape[1], x1 + px), min(a.shape[0], y1 + py)))
    s = min(tw / cut.width, th / cut.height)
    cut = cut.resize((max(1, round(cut.width * s)), max(1, round(cut.height * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    canvas.paste(cut, ((tw - cut.width) // 2, (th - cut.height) // 2))
    return canvas


# Which source file becomes which art file. A folder is matched by filename stem, so a download
# called "sky_2.jpeg" or "sky.png" both answer for the sky.
WANTED = ("sky", "moon", "rise", "envelope", "liner")


def run(name, source, dest=None, moon_mode="fill"):
    """Cut a folder of generated images into a theme's six art files."""
    source = Path(source)
    out = Path(dest) if dest else theme.THEMES / name / "img" / "art"
    out.mkdir(parents=True, exist_ok=True)
    found = {}
    for path in sorted(source.iterdir()):
        for want in WANTED:
            if path.is_file() and path.stem.lower().startswith(want) and want not in found:
                found[want] = path
    missing = [w for w in WANTED if w not in found]
    if missing:
        raise FileNotFoundError(f"no image in {source} whose name starts with: {', '.join(missing)}")

    written = {}
    sky = cover(strip_border(Image.open(found["sky"])), *theme.ART["sky.jpg"])
    sky.save(out / "sky.jpg", quality=88)
    moon(Image.open(found["moon"]), moon_mode).save(out / "moon.jpg", quality=90)
    sprite(Image.open(found["rise"]), *theme.ART["rise.png"]).save(out / "rise.png")
    env = cover(strip_border(Image.open(found["envelope"])), *theme.ART["envelope.jpg"])
    env.save(out / "envelope.jpg", quality=90)
    env.resize(theme.ART["envelope_t.jpg"], Image.LANCZOS).save(out / "envelope_t.jpg", quality=88)
    cover(strip_border(Image.open(found["liner"])), *theme.ART["liner.jpg"]).save(
        out / "liner.jpg", quality=88)
    for art in theme.ART:
        written[art] = str(out / art)
    return {"theme": name, "art": written}
```

`moon_mode` is a flag on the command rather than something guessed, because guessing it wrong
produces art that looks fine in a folder and wrong inside the circular mask. Add
`p.add_argument("--moon", choices=["fill", "trim"], default="fill")` to the `theme` parser and
pass it through.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_theme_cut.py -v`
Expected: PASS, 3 passed

- [ ] **Step 6: Prove it against the real images**

Run:
```bash
.venv/bin/python -m adventure theme cut kyoto-woodblock ~/Downloads/kyoto-raw --moon trim
.venv/bin/python -m adventure journey retheme /tmp/themecheck/app --theme kyoto-woodblock
.venv/bin/python -m adventure journey check /tmp/themecheck/app
```
Expected: `journey check` reports no errors, including the art size check.

- [ ] **Step 7: Commit**

```bash
git add adventure/theme_cut.py tests/test_theme_cut.py pyproject.toml
git commit -m "feat: theme cut turns generated images into a theme's art"
```

---

## Task 14: The skills, the README and the demo

**Files:**
- Modify: `skills/trip-journey/SKILL.md`
- Modify: `skills/trip-guide/SKILL.md`
- Modify: `README.md`
- Modify: `.github/workflows/*.yml`

- [ ] **Step 1: Update `trip-journey/SKILL.md`**

Step 2 of that skill becomes:

```markdown
2. **Pick a theme, then scaffold.** `adventure journey new trips/<id>/app --trip trips/<id>/trip.json --theme <name>`
   The themes that ship are `lantern-night`, `kyoto-woodblock` and `canyon-ember`. Show the
   traveller's friend the three and let them choose, or build a new one with
   `adventure theme new <name>`, which writes the folder and the art brief. A theme decides the
   painted art, the colours, the four typefaces and the words, including the noun for the thing
   that rises when a question is answered. It decides nothing about how the journey works.
   To change your mind later: `adventure journey retheme trips/<id>/app --theme <name>`, which
   refuses once the traveller has answered anything.
```

Step 5 gains a line: the posters take the same theme, `--theme <name>` where it said `--style`.

- [ ] **Step 2: Update `trip-guide/SKILL.md`**

Step 1 becomes:

```markdown
1. **Theme.** Pick a theme from `templates/themes/` or make one with `adventure theme new <name>`.
   The theme carries the house prompt, the palette and the fonts, and the same theme dresses the
   app if the trip is also being handed over as a journey, so the posters and the app cannot
   drift. Build a one-page moodboard (palette, fonts, three to six public-domain posters in that
   style from Commons) and get the traveller's OK before making anything else.
```

Replace every `--style <path>` in the file with `--theme <name>`.

- [ ] **Step 3: Update the README**

Add a section after the journey section:

```markdown
### Themes

A journey's art, colours, typefaces and words come out of a theme. Three ship: `lantern-night`,
`kyoto-woodblock` and `canyon-ember`. The same theme feeds the printed guide and the poster
prompts, so a trip's posters and its app match.

    adventure journey new trips/kix/app --trip trips/kix/trip.json --theme kyoto-woodblock
    adventure journey retheme trips/kix/app --theme canyon-ember

To build one: `adventure theme new harbour-dusk` writes the folder and `PROMPTS.md`, the brief for
the five images with the size each has to end at. Generate them, then
`adventure theme cut harbour-dusk ~/Downloads/harbour` cuts them to size, crops the moon and keys
the background out of the sprite.

A theme owns no code. It cannot change how an envelope opens, only what it is made of.
```

- [ ] **Step 4: Add the theme matrix to CI**

In the workflow that runs the journey QA, scaffold once per theme:

```yaml
      - name: Every theme scaffolds and checks
        run: |
          for t in lantern-night kyoto-woodblock canyon-ember; do
            python -m adventure journey new "/tmp/$t" --theme "$t"
            python -m adventure journey build "/tmp/$t"
            python -m adventure journey check "/tmp/$t"
          done
```

- [ ] **Step 5: Retheme the demo and rehearse it**

The repo's worked example is the Japan demo, so it should be the Kyoto theme.

```bash
adventure journey retheme <demo app path> --theme kyoto-woodblock
adventure journey build <demo app path>
adventure journey check <demo app path>
cd <demo app path> && node qa/rehearse.mjs
```
Expected: the rehearsal passes and the screenshots in `qa/out/` show the Kyoto art with Kyoto
words. Look at them.

- [ ] **Step 6: Run everything**

Run: `.venv/bin/python -m pytest -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: themes in the skills and the README, demo moved to kyoto-woodblock"
```

---

## Self-review

**Spec coverage:** theme folder shape, Task 1 and 4. The five blocks, Task 1, 2 and 4. Base copy
with placeholders, Task 2. `data-t` and `t()`, Task 7 and 8. Precedence of the three layers,
Task 2 and 7. `journey new --theme`, Task 5. `retheme` and its refusal, Task 6. Art copied and
renamed to `rise.png`, Task 5. `theme.css` and the `journey.css` rename, Task 3, 5 and 9. Guide
and posters, Task 9 and 10. `theme new` with `PROMPTS.md`, Task 12. `theme cut` with all three
behaviours, Task 13. The four checks, Task 11. Three themes shipped, Task 4. Tests, in each task.
Out of scope items are not implemented anywhere.

**Names used consistently:** `theme.load`, `theme.copy_for`, `theme.css`, `theme.contrast`,
`theme.apply_to`, `theme.new`, `theme.ART`, `theme.TOKENS`, `theme.base_copy`,
`theme_cut.strip_border`, `theme_cut.moon`, `theme_cut.sprite`, `theme_cut.run`,
`journey.new(theme_name=)`, `journey.retheme`. The browser side is `setCopy`, `t`, `rise`,
`bindTheme`, and the art file is `rise.png` everywhere after Task 8.

**One trap worth repeating:** `renderSheet` in `app.js` has a local variable called `t`. Rename it
to `time` before importing the copy helper, or the helper is shadowed inside that function and
every label in the bottom sheet silently becomes a formatted time.

---

## Amendment, found while executing

`letterbox.html` and `key.html` were not in the plan and they need the same treatment as
`index.html`, or the letterbox and the sender's key page stay in the old palette while the app
changes underneath them. Three things in each:

1. They carry their own `<link>` to Google Fonts with the four art deco families hardcoded, and
   their own inline `<style>` block using colours written out by hand. Both pages gain
   `<link rel="stylesheet" href="css/theme.css">` before their `<style>` block, their Google
   Fonts `<link>` goes, and the colours in the inline block become `var(--token)`.
2. `letterbox.html` line 29 draws `img/art/lantern.png`, which is `img/art/rise.png` after Task 8.
3. `letterbox.html` has a `<meta name="description">` and an `og:description` ending "and then it
   comes down as a lantern". That sentence belongs to one journey, not to the engine. It is
   written by `journey build`, which already rewrites the meta block between the `ga:meta`
   markers, so check `_page()` in `adventure/journey.py` covers `letterbox.html` and take the
   sentence from the journey file rather than the theme.

This belongs to Task 7 for the stylesheet links, Task 8 for the art filename, and Task 9 for the
inline colours.
