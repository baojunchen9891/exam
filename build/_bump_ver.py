# Bump cache-bust stamps across dist so browsers reload refreshed assets/data.
import pathlib

DIST = pathlib.Path("D:/MyWork/exam-site/dist")
OLD_VER = "202608051800"   # ?v= used in HTML <script>/<link>
OLD_ASSET = "202608051450" # ASSET_VER in common.js (data JSON fetch stamp)
NEW = "202608052348"

# 1) HTML ?v=
html_changed = 0
for h in DIST.rglob("*.html"):
    t = h.read_text(encoding="utf-8")
    if OLD_VER in t:
        h.write_text(t.replace(OLD_VER, NEW), encoding="utf-8")
        html_changed += 1
        print("html bump:", h.relative_to(DIST))

# 2) common.js ASSET_VER
cj = DIST / "assets/js/common.js"
t = cj.read_text(encoding="utf-8")
if OLD_ASSET in t:
    cj.write_text(t.replace(OLD_ASSET, NEW), encoding="utf-8")
    print("common.js ASSET_VER bumped:", OLD_ASSET, "->", NEW)
else:
    print("WARN: ASSET_VER old value not found in common.js (current value below):")
    for line in t.splitlines():
        if "ASSET_VER" in line:
            print("   ", line.strip())

print("DONE. html files bumped:", html_changed)
