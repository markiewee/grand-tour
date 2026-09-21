"""Turn a folder of generated images into the six art files the engine draws.

Three things here are not obvious, and each one is a picture that reached a screen looking wrong
before it was understood:

* A generator prints a paper margin, and sometimes a torn corner covering part of one edge. A line
  counts as margin while any meaningful part of it is still the margin colour, not only while all
  of it is. Requiring the whole line stops at the torn corner and leaves a pale band across the
  top of the sky.
* A moon needs two different crops. One drawn larger than its frame wants a centre square. One
  sitting on a plain card wants the card eaten away up to the disc. The app masks the picture into
  a circle, so the wrong crop leaves the card's corners showing inside the moon.
* A sprite has to be keyed by flooding in from the edges, not by distance from the background
  colour. A flat colour the subject encloses, such as the night showing through a printed flame,
  is the same colour as the background and gets punched out of the middle of the object. The
  background is then unmixed back out of the part-covered edge pixels, or a dark fringe rings the
  object once it is drawn against the night.
"""
from collections import deque
from pathlib import Path

from PIL import Image

from . import theme


def _array(im):
    try:
        import numpy as np
    except ImportError:  # pragma: no cover - the extra is the fix, not a fallback
        raise SystemExit("theme cut needs numpy: pip install 'great-adventure[themes]'")
    return np, np.asarray(im.convert("RGB")).astype(float)


def strip_border(im, tol=51, cap=0.45, extra=5):
    """Trim the printed paper margin. The corners say what the margin looks like.

    Each side is walked twice at once. `solid` counts the leading lines that are almost entirely
    margin, which is the frame itself. `loose` keeps going while enough of the line is still
    margin, which is what reaches past a torn corner printed over part of one edge.

    `loose` is the answer when it stops on its own. When it runs to the cap without stopping, the
    side never stopped looking like margin, and trusting it would eat the picture: a notch running
    down one edge does exactly that, and so does a picture with no margin at all. Then `solid` is
    the answer, and for a picture with no margin `solid` is zero and nothing is cut.
    """
    np, a = _array(im)
    h, w, _ = a.shape
    corners = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3),
                              a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)])
    c = np.median(corners, axis=0)
    enough = 0.15

    def settle(solid, loose):
        """How far in to cut, given the two readings.

        The loose reading reaches past a torn corner printed over part of one edge, which the
        solid one stops at. But a repeating pattern also reads as margin line after line, and
        following it eats the pattern. A frame is a frame: the loose reading is allowed to run
        past the solid one, not to wander away from it.
        """
        return loose if loose <= solid * 3 + 20 else solid

    def walk(lines, limit):
        solid = loose = 0
        still_solid = True
        for line in lines:
            near = (np.sqrt(((line - c) ** 2).sum(axis=1)) < tol).mean()
            if near <= enough:
                return settle(solid, loose)
            loose += 1
            if still_solid and near > 0.95:
                solid += 1
            else:
                still_solid = False
            if loose >= limit:
                # Neither reading ever stopped, so this side is not a margin at all: it is a
                # picture whose own colours happen to sit near the corner's. Cut nothing.
                return 0 if solid >= limit else settle(solid, solid)
        return 0 if solid >= limit else settle(solid, solid)

    lh, lw = max(1, int(h * cap)), max(1, int(w * cap))
    top = walk([a[y] for y in range(lh)], lh)
    bottom = walk([a[h - 1 - y] for y in range(lh)], lh)
    left = walk([a[:, x] for x in range(lw)], lw)
    right = walk([a[:, w - 1 - x] for x in range(lw)], lw)
    # A printed margin is a frame and shows up on every side. One flat band on its own is part of
    # the picture, an empty sky or a still sea, and cutting it off would be cutting the picture.
    if sum(1 for side in (top, bottom, left, right) if side) < 3:
        return im
    box = (left + extra if left else 0, top + extra if top else 0,
           w - (right + extra if right else 0), h - (bottom + extra if bottom else 0))
    return im.crop(box)


def cover(im, tw, th, bias=0.5):
    """Fill a size without squashing, keeping the middle unless told to favour one side."""
    w, h = im.size
    s = max(tw / w, th / h)
    im = im.resize((max(tw, round(w * s)), max(th, round(h * s))), Image.LANCZOS)
    x, y = round((im.width - tw) * bias), round((im.height - th) * bias)
    return im.crop((x, y, x + tw, y + th))


def moon(im, mode, size=768):
    """`fill` for a disc drawn larger than its frame, `trim` for one sitting on a plain card."""
    if mode == "trim":
        # The frame first, then the disc. A printed rule a few pixels in from the edge is not the
        # card, and looking for the disc without removing it finds the rule instead.
        return _disc(strip_border(im), size)
    return cover(strip_border(im), size, size)


def _disc(im, size, tol=25, ink=0.02):
    """Square up on the disc itself rather than on what is left after trimming the card.

    Trimming each side independently gives the disc's box only when the disc is centred. Off
    centre, one side's card is wider than the walk will go, that side keeps its card, and the
    card then shows inside the circle the app masks the picture into.

    `tol` is above the grain of a printed card, and `ink` is the share of a line that has to be
    something other than card before the line counts as part of the disc. Both are set by what
    real prints do, not by what a flat fill does.
    """
    np, a = _array(im)
    h, w, _ = a.shape
    card = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)
    mask = np.sqrt(((a - card) ** 2).sum(axis=2)) > tol
    rows = np.where(mask.mean(axis=1) > ink)[0]
    cols = np.where(mask.mean(axis=0) > ink)[0]
    if not len(rows) or not len(cols):
        return cover(im, size, size)     # all one colour: there is no disc to find
    y0, y1, x0, x1 = rows[0], rows[-1], cols[0], cols[-1]
    cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
    r = max(x1 - x0, y1 - y0) / 2
    box = (max(0, round(cx - r)), max(0, round(cy - r)),
           min(w, round(cx + r)), min(h, round(cy + r)))
    return cover(im.crop(box), size, size)


def _background(np, a, tol):
    """The flat field around the subject: what an edge pixel can reach without crossing it."""
    h, w, _ = a.shape
    c = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)
    near = np.sqrt(((a - c) ** 2).sum(axis=2)) < tol
    seen = np.zeros((h, w), bool)
    q = deque()
    for y in range(h):
        for x in (0, w - 1):
            if near[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for x in range(w):
        for y in (0, h - 1):
            if near[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return seen, c


def sprite(im, tw, th, tol=60, feather=26, pad=0.05):
    """Lift the subject off its flat background, keeping its own edge glow."""
    np, a = _array(strip_border(im))
    bg, c = _background(np, a, tol)
    d = np.sqrt(((a - c) ** 2).sum(axis=2))
    alpha = np.where(bg, np.clip((d - tol + feather) / feather, 0, 1), 1.0)
    safe = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip((a - c * (1 - safe)) / safe, 0, 255)
    ys, xs = np.where(alpha > 0.4)
    if len(xs) == 0:
        raise ValueError("nothing left after keying: the subject is the same colour as its background")
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    px, py = round((x1 - x0) * pad), round((y1 - y0) * pad)
    cut = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), "RGBA").crop(
        (max(0, x0 - px), max(0, y0 - py), min(a.shape[1], x1 + px), min(a.shape[0], y1 + py)))
    s = min(tw / cut.width, th / cut.height)
    cut = cut.resize((max(1, round(cut.width * s)), max(1, round(cut.height * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    canvas.paste(cut, ((tw - cut.width) // 2, (th - cut.height) // 2))
    return canvas


# The five pictures a theme is generated from. envelope_t is cut from envelope rather than made.
WANTED = ("sky", "moon", "rise", "envelope", "liner")


def sources(folder):
    """Match files to slots by the start of their name, so sky_2.jpeg answers for the sky."""
    folder = Path(folder)
    found = {}
    for path in sorted(folder.iterdir()):
        if not path.is_file():
            continue
        for want in WANTED:
            if want not in found and path.stem.lower().startswith(want):
                found[want] = path
    missing = [w for w in WANTED if w not in found]
    if missing:
        raise FileNotFoundError(
            f"no image in {folder} whose name starts with: {', '.join(missing)}")
    return found


def _rise_name(name):
    """A theme folder keeps its own name for the sprite, so somebody opening the folder can see
    what the picture is of. The app only ever sees rise.png, renamed when the theme is applied."""
    try:
        return theme.load(name)["rise"]["asset"]
    except (FileNotFoundError, ValueError, KeyError):
        return "rise.png"


def run(name, folder, dest=None, moon_mode="fill", sky_bias=0.5):
    """Cut a folder of generated images into a theme's six art files."""
    found = sources(folder)
    out = Path(dest) if dest else theme.THEMES / name / "img" / "art"
    out.mkdir(parents=True, exist_ok=True)
    rise_name = _rise_name(name)

    with Image.open(found["sky"]) as im:
        cover(strip_border(im), *theme.ART["sky.jpg"], bias=sky_bias).save(out / "sky.jpg", quality=88)
    with Image.open(found["moon"]) as im:
        moon(im, moon_mode).save(out / "moon.jpg", quality=90)
    with Image.open(found["rise"]) as im:
        sprite(im, *theme.ART["rise.png"]).save(out / rise_name)
    with Image.open(found["envelope"]) as im:
        env = cover(strip_border(im), *theme.ART["envelope.jpg"])
    env.save(out / "envelope.jpg", quality=90)
    env.resize(theme.ART["envelope_t.jpg"], Image.LANCZOS).save(out / "envelope_t.jpg", quality=88)
    with Image.open(found["liner"]) as im:
        cover(strip_border(im), *theme.ART["liner.jpg"]).save(out / "liner.jpg", quality=88)

    written = {art: str(out / art) for art in theme.ART if art != "rise.png"}
    written[rise_name] = str(out / rise_name)
    return {"theme": name, "art": written}
