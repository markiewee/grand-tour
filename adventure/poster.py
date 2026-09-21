"""Turn a poster concept into a prompt, then generate takes with Gemini or write a Flow card."""
import base64
import mimetypes
import os

NO_TEXT = ("Absolutely no text of any kind: no letters, no numbers, no signs, no labels, "
           "no logos, no writing anywhere.")
DEFAULT_MODEL = "gemini-3-pro-image"


def build_prompt(concept, theme, reference_note=None):
    parts = []
    if reference_note:
        parts.append(reference_note.strip())
    parts.append("Concept: " + concept.strip())
    parts.append("Style: " + theme["house_prompt"].strip() + ".")
    if theme.get("avoid"):
        parts.append("Avoid " + ", ".join(theme["avoid"]) + ".")
    parts.append(NO_TEXT)
    return " ".join(parts)


def _image_part(path):
    mime = mimetypes.guess_type(path)[0] or "image/jpeg"
    with open(path, "rb") as fh:
        data = base64.b64encode(fh.read()).decode("ascii")
    return {"type": "image", "data": data, "mime_type": mime}


def generate(prompt, refs, out_dir, name, takes=2, model=DEFAULT_MODEL, size="2K", client=None):
    if client is None:
        from google import genai  # pip install "adventure[posters]"; reads GEMINI_API_KEY
        client = genai.Client()
    os.makedirs(out_dir, exist_ok=True)
    inputs = [{"type": "text", "text": prompt}] + [_image_part(p) for p in refs]
    paths = []
    for take in range(1, takes + 1):
        interaction = client.interactions.create(
            model=model, input=inputs,
            response_format={"type": "image", "mime_type": "image/jpeg", "aspect_ratio": "3:4", "image_size": size})
        path = os.path.join(out_dir, f"{name}_{take}.jpg")
        with open(path, "wb") as fh:
            fh.write(base64.b64decode(interaction.output_image.data))
        paths.append(path)
    return paths


def flow_card(prompt, refs, out_dir, name):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.flow.txt")
    lines = ["Google Flow card (free with a Google AI plan)",
             "Settings: Nano Banana Pro, portrait 3:4, 2 outputs", "",
             "1. Upload these reference images, then add them to the prompt with +:"]
    lines += [f"   - {os.path.basename(p)}" for p in refs]
    lines += ["", "2. Paste this prompt:", "", prompt, "",
              f"3. Save the two takes into {out_dir} as {name}_1.jpg and {name}_2.jpg"]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    return path
