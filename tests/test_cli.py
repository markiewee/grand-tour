import json
import os

from grandtour import __main__ as cli

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
