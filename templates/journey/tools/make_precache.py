"""List every file the app needs offline into public/precache.json and bump the cache version in sw.js."""
import json
import re
import time
from pathlib import Path

PUB = Path(__file__).resolve().parent.parent / "public"
# blob-client.js is the letterbox upload library. The journey itself never loads it, so it stays
# out of the cache.
SKIP = {"sw.js", "precache.json", "key.html", "letterbox.html", "blob-client.js"}
files = ["./"]
for p in sorted(PUB.rglob("*")):
    if p.is_file() and p.name not in SKIP and not p.name.startswith(".") and "/js/key" not in str(p) and "/js/letterbox" not in str(p):
        files.append(str(p.relative_to(PUB)))
(PUB / "precache.json").write_text(json.dumps(files, indent=0), "utf-8")
sw = PUB / "sw.js"
s = sw.read_text("utf-8")
s = re.sub(r"const V = '[^']+';", f"const V = 'lr-{time.strftime('%Y%m%d%H%M%S')}';", s)
sw.write_text(s, "utf-8")
print(len(files), "files,", sum((PUB / f).stat().st_size for f in files if f != "./") // 1024, "KB")
