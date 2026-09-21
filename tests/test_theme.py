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
