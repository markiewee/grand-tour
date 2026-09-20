import base64
import json
import os

from adventure import poster

STYLE = {"house_prompt": "1930s art deco travel poster, portrait 3:4", "avoid": ["photorealism", "phones"]}


def test_build_prompt_orders_reference_concept_style_and_no_text_rule():
    prompt = poster.build_prompt("A turtle takes back the sword.", STYLE, "Use the photo for the bridge.")
    assert prompt.startswith("Use the photo for the bridge. Concept: A turtle takes back the sword.")
    assert "Style: 1930s art deco travel poster, portrait 3:4" in prompt
    assert "Avoid photorealism, phones." in prompt
    assert prompt.endswith(poster.NO_TEXT)


class FakeInteractions:
    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        image = type("Image", (), {"data": base64.b64encode(b"JPEG%d" % len(self.calls)).decode()})
        return type("Interaction", (), {"output_image": image})


class FakeClient:
    def __init__(self):
        self.interactions = FakeInteractions()


def test_generate_writes_one_file_per_take_with_reference_images(tmp_path):
    ref = tmp_path / "ref.jpg"
    ref.write_bytes(b"REF")
    client = FakeClient()
    paths = poster.generate("prompt", [str(ref)], str(tmp_path / "raw"), "hoankiem", takes=2, client=client)
    assert [os.path.basename(p) for p in paths] == ["hoankiem_1.jpg", "hoankiem_2.jpg"]
    assert open(paths[1], "rb").read() == b"JPEG2"
    call = client.interactions.calls[0]
    assert call["model"] == poster.DEFAULT_MODEL
    assert call["response_format"]["aspect_ratio"] == "3:4"
    assert call["input"][0] == {"type": "text", "text": "prompt"}
    assert call["input"][1]["type"] == "image" and call["input"][1]["mime_type"] == "image/jpeg"


def test_flow_card_lists_refs_and_prompt(tmp_path):
    path = poster.flow_card("the prompt", ["/x/ref_bridge.png"], str(tmp_path), "hoankiem")
    text = open(path, encoding="utf-8").read()
    assert "ref_bridge.png" in text and "the prompt" in text and "hoankiem_1.jpg" in text


def test_bundled_styles_have_prompt_and_palette():
    root = os.path.join(os.path.dirname(__file__), "..", "templates", "styles")
    for name in ("art-deco.json", "wpa-screenprint.json"):
        style = json.load(open(os.path.join(root, name), encoding="utf-8"))
        assert style["house_prompt"] and style["palette"] and style["fonts"]
