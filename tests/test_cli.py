import json
import os

from PIL import Image

from adventure import __main__ as cli

EXAMPLE = os.path.join(os.path.dirname(__file__), "..", "templates", "trip.example.json")


def test_gaps_command_prints_json_list(capsys):
    assert cli.main(["gaps", EXAMPLE]) == 0
    found = json.loads(capsys.readouterr().out)
    assert "to book: XX100 (2027-04-02)" in found


def test_weather_command_uses_places(monkeypatch, capsys):
    monkeypatch.setattr(cli.weather, "forecast", lambda lat, lon, start, end: [{"date": start}])
    assert cli.main(["weather", EXAMPLE]) == 0
    assert json.loads(capsys.readouterr().out) == {"Kyoto": [{"date": "2027-04-02"}]}


def test_prompt_command_builds_from_style(capsys):
    style = os.path.join(os.path.dirname(__file__), "..", "templates", "styles", "art-deco.json")
    assert cli.main(["prompt", "--style", style, "--concept", "A lantern leads the way."]) == 0
    assert "Concept: A lantern leads the way." in capsys.readouterr().out


def test_journey_check_exits_one_when_something_is_wrong(tmp_path, capsys):
    app = tmp_path / "app"
    (app / "public" / "data").mkdir(parents=True)
    (app / "public" / "data" / "trip.json").write_text(json.dumps({"journey": {}, "stops": []}), "utf-8")
    assert cli.main(["journey", "check", str(app)]) == 1
    assert "journey.title is missing" in json.loads(capsys.readouterr().out)["errors"]


def test_journey_new_then_build_uses_the_plugin_template(tmp_path, capsys):
    dest = tmp_path / "app"
    assert cli.main(["journey", "new", str(dest), "--trip", EXAMPLE]) == 0
    assert json.loads(capsys.readouterr().out)["app"] == str(dest)

    written = dest / "public" / "data" / "trip.json"
    data = json.loads(written.read_text("utf-8"))
    assert [stop["id"] for stop in data["stops"]][0] == "xx100"
    data["journey"]["tz"] = "Asia/Tokyo"
    written.write_text(json.dumps(data), "utf-8")

    assert cli.main(["journey", "check", str(dest)]) == 0
    assert json.loads(capsys.readouterr().out)["errors"] == []

    assert cli.main(["journey", "build", str(dest)]) == 0
    assert json.loads(capsys.readouterr().out)["api"].endswith("api/_journey.js")


def test_plates_command_writes_into_the_app_image_directory(tmp_path, capsys):
    src = tmp_path / "kix.jpg"
    Image.new("RGB", (1200, 1600), (46, 106, 92)).save(src)
    assert cli.main(["plates", str(src), "--out", str(tmp_path / "img")]) == 0
    cut = json.loads(capsys.readouterr().out)
    assert cut["poster"].endswith("posters/kix.jpg")
    assert cut["thumb"].endswith("thumbs/kix.jpg")
    assert len(cut["plates"]) == 5
