"""A theme: the art, the colours, the typefaces and the words a journey is printed in.

One theme feeds three things that used to each carry their own copy of the same palette: the
poster prompts, the printed A4 guide and the app. A theme owns no code. It cannot change how an
envelope opens, only what the envelope is made of and what the screen says.
"""
import json
import re
import shutil
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


CSS = """\
/* Written by `python3 -m adventure journey new` or `journey retheme`. Do not edit by hand:
   any change here is overwritten the next time the theme is applied. The theme is {name}. */
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
    stylesheet = app / "public" / "css" / "theme.css"
    stylesheet.parent.mkdir(parents=True, exist_ok=True)
    stylesheet.write_text(css(loaded), encoding="utf-8")
    return loaded


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


PROMPTS = """\
# Art for {title}

Five pictures are generated and a sixth is cut from one of them. Every prompt ends with no text,
no lettering and no signature, because a word printed into the art cannot be translated out of it
and cannot be removed.

Generators mostly offer 16:9 and 9:16. Generate at the ratio named below, then run
`adventure theme cut {name} <folder>` and what comes out is the size in the first column. Name
each downloaded file after its slot, so `sky.jpg`, `moon_2.jpeg` and so on.

| File | Ends at | Generate at | What it is |
|---|---|---|---|
| `sky.jpg` | 768 by 1376 | 9:16 | the night behind everything. No moon in it, the moon is a separate picture. Keep the top third open and dark enough for pale text to sit on, and the bottom third quiet, because a sheet covers it. |
| `moon.jpg` | 768 by 768 | 16:9 | one disc, filling the frame edge to edge. No sky around it, no rings, no border. The app masks it into a circle, so anything outside the disc shows up inside the moon. |
| `{rise}` | 360 by 470 | 9:16 | the thing that goes up when a question is answered, on a flat background nothing like the object. It is drawn 44 pixels wide, so it has to read as a silhouette at that size. |
| `envelope.jpg` | 920 by 649 | 16:9 | a flat sheet of paper, evenly lit. Not an envelope: no flap, no fold, no seal, nothing resting on it. The flap is drawn from a slice of this same sheet, so anything printed on it appears twice. |
| `envelope_t.jpg` | 150 by 105 | cut from the envelope | nothing to generate |
| `liner.jpg` | 640 by 640 | 16:9 | a repeating pattern for the inside of the envelope. The same size everywhere, no focal point, no border. |

Two flags on the cut command, both worth getting right the first time:

- `--moon fill` when the disc is drawn larger than its frame and runs off the edges. `--moon trim`
  when it sits on a plain card with space around it. The wrong one leaves the card's corners
  showing inside the circle.
- `--sky-bias` between 0 and 1, which picks what survives when a wide picture is cut to a tall
  one. The default keeps the middle.

Write the house style once and paste it into all five prompts:

> {house}
"""


def new(name, dest):
    """Scaffold a theme folder to fill in, with the art brief beside it.

    The palette and the fonts start as the base theme's, so a half finished theme still loads and
    still renders. The words start empty, because every line a theme does not write is inherited.
    """
    dest = Path(dest)
    if dest.exists():
        raise FileExistsError(f"{dest} already exists")
    (dest / "img" / "art").mkdir(parents=True)
    title = name.replace("-", " ").replace("_", " ").strip().capitalize()
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
    (dest / "theme.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                                     encoding="utf-8")
    (dest / "PROMPTS.md").write_text(
        PROMPTS.format(title=title, name=name, rise=data["rise"]["asset"],
                       house="Your house style goes here, in one sentence."), encoding="utf-8")
    return dest
