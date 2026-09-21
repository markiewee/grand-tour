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
        "fonts": {"display": "\"Zen Antique\", Georgia, serif",
                  "deco": "\"Zen Antique\", Georgia, serif",
                  "label": "\"Zen Kaku Gothic New\", sans-serif",
                  "text": "\"Shippori Mincho\", Georgia, serif",
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


def test_theme_new_writes_a_folder_with_an_art_brief(tmp_path):
    made = theme.new("harbour-dusk", tmp_path / "harbour-dusk")
    data = json.loads((made / "theme.json").read_text(encoding="utf-8"))
    assert data["name"] == "Harbour dusk"
    assert set(data["palette"]) == set(theme.TOKENS)
    assert set(data["fonts"]) >= set(theme.FONTS)
    assert data["copy"] == {}
    prompts = (made / "PROMPTS.md").read_text(encoding="utf-8")
    assert "768 by 1376" in prompts
    assert "rise.png" in prompts
    assert (made / "img" / "art").is_dir()


def test_a_scaffolded_theme_loads_and_reads_as_the_base_words(tmp_path):
    made = theme.new("harbour-dusk", tmp_path / "harbour-dusk")
    words = theme.copy_for(theme.load(made))
    assert words["send"] == "Send it up as a lantern"


def test_theme_new_refuses_to_overwrite(tmp_path):
    theme.new("harbour-dusk", tmp_path / "harbour-dusk")
    with pytest.raises(FileExistsError):
        theme.new("harbour-dusk", tmp_path / "harbour-dusk")


def test_a_jpeg_sprite_is_refused_because_it_has_no_transparency(tmp_path):
    rise = {"asset": "crane.jpg", "a": "a crane", "one": "crane", "many": "cranes"}
    with pytest.raises(ValueError, match="png"):
        theme.load(a_theme(tmp_path, rise=rise))


def test_the_sprite_filename_never_reaches_a_sentence(tmp_path):
    """rise.asset names a file in the theme folder. A copy line asking for it would print a
    filename at the traveller, so it is not a word a line can ask for."""
    d = a_theme(tmp_path, copy={"start": "Open the {asset}"})
    with pytest.raises(ValueError, match="asset"):
        theme.copy_for(theme.load(d))


def test_the_app_is_not_told_the_theme_folder_s_filename(tmp_path):
    from adventure import journey
    from adventure.__main__ import ENGINE
    app = journey.new(ENGINE, tmp_path / "app", theme_name="kyoto-woodblock")
    written = json.loads((app / "public" / "data" / "theme.json").read_text(encoding="utf-8"))
    assert set(written["rise"]) == set(theme.NOUNS)


def test_a_shipped_name_is_not_shadowed_by_a_folder_in_the_way(tmp_path, monkeypatch):
    (tmp_path / "kyoto-woodblock").mkdir()
    monkeypatch.chdir(tmp_path)
    assert theme.resolve("kyoto-woodblock") == theme.THEMES / "kyoto-woodblock"


def test_a_theme_with_no_house_style_yet_cannot_draw_posters(tmp_path):
    from adventure import poster
    made = theme.new("harbour-dusk", tmp_path / "harbour-dusk")
    with pytest.raises(ValueError, match="house_prompt"):
        poster.build_prompt("A fox shrine at dusk", theme.load(made))
