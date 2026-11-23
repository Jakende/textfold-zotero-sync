from pathlib import Path
from urllib.parse import urlsplit
import argparse
import json
import zipfile

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description="Build the Zotero XPI from an explicit file list.")
parser.add_argument("--out", type=Path, default=root / "dist")
parser.add_argument("--update-url", help="HTTPS Zotero update manifest URL for a public release")
args = parser.parse_args()
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
if args.update_url:
    url = urlsplit(args.update_url)
    if url.scheme != "https" or not url.hostname or url.username or url.password or url.fragment:
        parser.error("--update-url must be an HTTPS URL without credentials or fragment")
    manifest["applications"]["zotero"]["update_url"] = args.update_url

args.out.mkdir(parents=True, exist_ok=True)
target = args.out / f"TextFold-Zotero-Sync-{manifest['version']}.xpi"
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in ("manifest.json", "bootstrap.js", "core.js", "sync.js", "LICENSE", "NOTICE"):
        payload = (
            (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
            if name == "manifest.json"
            else (root / name).read_bytes()
        )
        info = zipfile.ZipInfo(name)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, payload)
print(target)
