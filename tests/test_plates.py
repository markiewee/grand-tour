from PIL import Image

from adventure import plates

INKS = ("mist", "jade", "gold", "red", "ink")


def a_poster(path, size=(1200, 1600)):
    """A band of colour per ink, so every plate has something on it to print."""
    image = Image.new("RGB", size)
    bands = [(164, 188, 184), (46, 106, 92), (214, 161, 63), (179, 52, 43), (27, 35, 64), (239, 227, 198)]
    step = size[1] // len(bands)
    for n, colour in enumerate(bands):
        image.paste(colour, (0, n * step, size[0], (n + 1) * step))
    image.save(path)
    return path


def test_cut_writes_a_poster_a_thumb_and_five_plates(tmp_path):
    cut = plates.cut(a_poster(tmp_path / "kix.jpg"), tmp_path / "img")
    assert cut["poster"] == tmp_path / "img" / "posters" / "kix.jpg"
    assert cut["thumb"] == tmp_path / "img" / "thumbs" / "kix.jpg"
    assert Image.open(cut["poster"]).size == (720, 960)
    assert [p.name for p in cut["plates"]] == [f"kix_{ink}.png" for ink in INKS]
    assert all(p.exists() for p in cut["plates"])


def test_the_thumb_is_small_enough_for_the_route_map(tmp_path):
    cut = plates.cut(a_poster(tmp_path / "gion.jpg"), tmp_path / "img")
    assert max(Image.open(cut["thumb"]).size) <= 200


def test_cut_crops_a_wide_image_to_the_phone_shape(tmp_path):
    cut = plates.cut(a_poster(tmp_path / "wide.jpg", size=(1600, 900)), tmp_path / "img")
    assert Image.open(cut["poster"]).size == (720, 960)


def test_every_plate_is_one_flat_ink_on_nothing(tmp_path):
    cut = plates.cut(a_poster(tmp_path / "kix.jpg"), tmp_path / "img")
    jade = Image.open([p for p in cut["plates"] if p.stem.endswith("jade")][0]).convert("RGBA")
    inked = {colour[:3] for _, colour in jade.getcolors(1 << 16) if colour[3] == 255}
    assert inked == {(46, 106, 92)}
