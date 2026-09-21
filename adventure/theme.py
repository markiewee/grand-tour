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
