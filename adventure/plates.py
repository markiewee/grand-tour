"""Cut a poster into the five ink plates the app prints with, plus a phone copy and a thumbnail.

The plates come from quantising the poster to the six colours of a 1930s stone lithograph, paper
plus five inks, so laying them down in order looks like the poster coming off the press. The
numbers below are tuned to that animation. Change where the files land, not the maths.
"""
from pathlib import Path

from PIL import Image

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


def cut(src, img_dir):
    src, img_dir = Path(src), Path(img_dir)
    pid = src.stem
    for sub in ("posters", "thumbs", "plates"):
        (img_dir / sub).mkdir(parents=True, exist_ok=True)

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
    poster_path = img_dir / "posters" / f"{pid}.jpg"
    poster.save(poster_path, quality=82, optimize=True, progressive=True)
    thumb_path = img_dir / "thumbs" / f"{pid}.jpg"
    poster.resize((120, 160), Image.LANCZOS).save(thumb_path, quality=80, optimize=True)

    small = poster.resize((W // 2, H // 2), Image.LANCZOS)
    q = small.quantize(palette=palette_image(), dither=Image.Dither.NONE)
    idx = q.load()
    plate_paths = []
    for k, (name, colour) in enumerate(INKS, start=1):
        plate = Image.new("RGBA", small.size, colour + (0,))
        px = plate.load()
        for y in range(small.height):
            for x in range(small.width):
                if idx[x, y] == k:
                    px[x, y] = colour + (255,)
        path = img_dir / "plates" / f"{pid}_{name}.png"
        plate.save(path, optimize=True)
        plate_paths.append(path)
    return {"poster": poster_path, "thumb": thumb_path, "plates": plate_paths}
