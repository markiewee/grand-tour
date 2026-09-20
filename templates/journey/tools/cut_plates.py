"""Cut each poster into the five ink plates the app prints with, plus a phone-sized copy and a thumbnail.

    python3 tools/cut_plates.py <source-dir-or-files...>

Every source image named <id>.jpg becomes:
    public/img/posters/<id>.jpg      720 x 960, the finished poster
    public/img/thumbs/<id>.jpg       120 x 160, for the route map and cards
    public/img/plates/<id>_<ink>.png one flat colour per plate: mist, jade, gold, red, ink

The plates come from quantising the poster to the six colours of a 1930s stone lithograph
(paper plus five inks), so printing them in order looks like the poster coming off the press.
"""
import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public" / "img"
INKS = [  # printing order, lightest first
    ("mist", (164, 188, 184)),
    ("jade", (46, 106, 92)),
    ("gold", (214, 161, 63)),
    ("red", (179, 52, 43)),
    ("ink", (27, 35, 64)),
]
PAPER = (239, 227, 198)
W, H = 720, 960


def palette_image():
    pal = Image.new("P", (1, 1))
    colours = [PAPER] + [c for _, c in INKS]
    flat = [v for c in colours for v in c]
    pal.putpalette(flat + flat[:3] * (256 - len(colours)))
    return pal


def cut(src: Path):
    pid = src.stem
    im = Image.open(src).convert("RGB")
    # centre-crop to 3:4, then size for the phone
    w, h = im.size
    if w / h > 0.75:
        nw = int(h * 0.75)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    elif w / h < 0.75:
        nh = int(w / 0.75)
        im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    poster = im.resize((W, H), Image.LANCZOS)
    poster.save(PUB / "posters" / f"{pid}.jpg", quality=82, optimize=True, progressive=True)
    poster.resize((120, 160), Image.LANCZOS).save(PUB / "thumbs" / f"{pid}.jpg", quality=80, optimize=True)

    small = poster.resize((W // 2, H // 2), Image.LANCZOS)
    q = small.quantize(palette=palette_image(), dither=Image.Dither.NONE)
    idx = q.load()
    for k, (name, colour) in enumerate(INKS, start=1):
        plate = Image.new("RGBA", small.size, colour + (0,))
        px = plate.load()
        for y in range(small.height):
            for x in range(small.width):
                if idx[x, y] == k:
                    px[x, y] = colour + (255,)
        plate.save(PUB / "plates" / f"{pid}_{name}.png", optimize=True)
    return pid


def main(args):
    files = []
    for a in args:
        p = Path(a)
        files += sorted(p.glob("*.jpg")) if p.is_dir() else [p]
    for sub in ("posters", "thumbs", "plates"):
        (PUB / sub).mkdir(parents=True, exist_ok=True)
    for f in files:
        print("cut", cut(f))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
