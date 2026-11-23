"""Set up a disposable Zotero profile for the annotation integration test."""
import argparse
from pathlib import Path
import shutil
import zipfile

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("directory", type=Path)
args = parser.parse_args()
directory = args.directory.resolve()
profile = directory / "profile"
extensions = profile / "extensions"
extensions.mkdir(parents=True)
(directory / "data").mkdir()
(profile / "user.js").write_text(
    'user_pref("extensions.zotero.httpServer.port", 23879);\n'
    'user_pref("extensions.zotero.firstRun2", false);\n'
    'user_pref("extensions.autoDisableScopes", 0);\n'
    'user_pref("app.update.auto", false);\n',
    encoding="utf-8",
)
shutil.copyfile(
    root / "dist" / "TextFold-Zotero-Sync-1.1.0-beta.2.xpi",
    extensions / "textfold-zotero-sync@local.jakende.xpi",
)
with zipfile.ZipFile(extensions / "textfold-desktop-check@example.invalid.xpi", "w") as archive:
    archive.writestr(
        "manifest.json",
        '{"manifest_version":2,"name":"TextFold desktop check","version":"1.0",'
        '"applications":{"zotero":{"id":"textfold-desktop-check@example.invalid",'
        '"strict_min_version":"10.0","strict_max_version":"10.0.*"}}}',
    )
    archive.write(root / "desktop-check.js", "bootstrap.js")

stream = b"BT /F1 12 Tf 72 720 Td (A unique scientific passage for the desktop annotation test.) Tj ET\n"
objects = [
    b"<< /Type /Catalog /Pages 2 0 R >>",
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]"
    b" /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"endstream",
]
pdf = b"%PDF-1.4\n"
offsets = []
for number, content in enumerate(objects, 1):
    offsets.append(len(pdf))
    pdf += b"%d 0 obj\n" % number + content + b"\nendobj\n"
index = len(pdf)
pdf += b"xref\n0 6\n0000000000 65535 f \n"
pdf += b"".join(b"%010d 00000 n \n" % offset for offset in offsets)
pdf += b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % index
(directory / "fixture.pdf").write_bytes(pdf)
