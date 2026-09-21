"""The cutter's geometry, on small synthetic images.

Each test here is a picture that once came out wrong: a pale band left across the top of a sky, a
card's corners showing inside a moon, and a flame with a hole punched through the middle of it.
"""
import pytest
from PIL import Image, ImageDraw

from adventure import theme, theme_cut

CREAM = (237, 224, 197)
NAVY = (27, 35, 64)
FLAME = (204, 102, 44)
GREY = (210, 210, 210)


def bordered(size=(400, 500), margin=30, notch=True):
    """A dark picture inside a printed cream margin, with a torn corner over part of the top."""
    im = Image.new("RGB", size, CREAM)
    im.paste(NAVY, (margin, margin, size[0] - margin, size[1] - margin))
    if notch:
        im.paste(CREAM, (margin, margin, margin + 120, margin + 40))
    return im


def test_margin_trim_eats_the_torn_corner_too():
    out = theme_cut.strip_border(bordered())
    assert out.getpixel((0, 0)) == NAVY
    assert out.getpixel((out.width - 1, 0)) == NAVY
    assert out.size[0] < 400


def a_pattern(size=(400, 500), cell=20):
    """An edge to edge repeat, the way a liner comes back: no margin anywhere to find."""
    im = Image.new("RGB", size, NAVY)
    d = ImageDraw.Draw(im)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                d.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(60, 90, 140))
    return im


def test_a_picture_with_no_margin_is_left_alone():
    assert theme_cut.strip_border(a_pattern()).size == (400, 500)


def test_a_disc_on_a_card_comes_out_filling_the_square():
    im = Image.new("RGB", (400, 500), CREAM)
    ImageDraw.Draw(im).ellipse((100, 150, 300, 350), fill=GREY)
    out = theme_cut.moon(im, "trim", size=120)
    assert out.size == (120, 120)
    assert out.getpixel((60, 60))[0] == pytest.approx(GREY[0], abs=8)
    # the card is gone: the top edge of the square is the disc, not cream
    assert out.getpixel((60, 3))[0] < CREAM[0] - 8


def test_a_disc_drawn_past_its_frame_keeps_its_middle():
    im = Image.new("RGB", (400, 500), GREY)
    ImageDraw.Draw(im).ellipse((-60, 40, 460, 460), fill=(240, 236, 210))
    out = theme_cut.moon(im, "fill", size=120)
    assert out.size == (120, 120)
    assert out.getpixel((60, 60))[0] > 220


def a_flame():
    """A printed flame with the night showing through the middle of it."""
    im = Image.new("RGB", (200, 260), NAVY)
    d = ImageDraw.Draw(im)
    d.ellipse((50, 60, 150, 200), fill=FLAME)
    d.ellipse((85, 100, 115, 160), fill=NAVY)
    return im


def test_a_sprite_keeps_a_background_colour_its_subject_encloses():
    out = theme_cut.sprite(a_flame(), 120, 156)
    assert out.mode == "RGBA"
    assert out.getpixel((out.width // 2, out.height // 2))[3] > 200
    assert out.getpixel((1, 1))[3] == 0
    assert out.getpixel((out.width - 2, out.height - 2))[3] == 0


def test_a_sprite_leaves_no_fringe_of_the_background_it_came_off():
    """Every pixel that is even slightly opaque should read as the subject, not as the field it
    was lifted from, or the object is ringed in navy once it is drawn against the night."""
    out = theme_cut.sprite(a_flame(), 120, 156)
    edges = [out.getpixel((x, y)) for y in range(out.height) for x in range(out.width)]
    edges = [p for p in edges if 40 < p[3] < 220]
    assert edges, "the key produced no part-covered pixels at all, so it is not feathering"
    navyish = [p for p in edges if abs(p[0] - NAVY[0]) < 30 and abs(p[2] - NAVY[2]) < 30]
    assert len(navyish) / len(edges) < 0.25


def test_a_subject_the_same_colour_as_its_background_is_an_error():
    with pytest.raises(ValueError, match="same colour"):
        theme_cut.sprite(Image.new("RGB", (80, 90), NAVY), 40, 50)


def a_folder(tmp_path):
    folder = tmp_path / "raw"
    folder.mkdir()
    for stem, maker in (("sky", lambda: bordered((400, 700))),
                        ("moon", lambda: Image.new("RGB", (400, 500), GREY)),
                        ("rise", a_flame),
                        ("envelope", lambda: Image.new("RGB", (400, 300), CREAM)),
                        ("liner", lambda: a_pattern((400, 400)))):
        maker().save(folder / f"{stem}_2.jpeg")
    return folder


def test_run_writes_every_file_at_the_size_the_engine_draws_it(tmp_path):
    out = tmp_path / "art"
    made = theme_cut.run("harbour-dusk", a_folder(tmp_path), dest=out)
    assert made["theme"] == "harbour-dusk"
    for name, want in theme.ART.items():
        path = out / name
        assert path.exists(), f"{name} was not written"
        with Image.open(path) as im:
            assert im.size == want, f"{name} is {im.size}, the engine draws it at {want}"


def test_run_says_which_picture_it_could_not_find(tmp_path):
    folder = a_folder(tmp_path)
    (folder / "moon_2.jpeg").unlink()
    with pytest.raises(FileNotFoundError, match="moon"):
        theme_cut.run("harbour-dusk", folder, dest=tmp_path / "art")
