#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:?usage: packaging/build.sh OUTPUT_DIRECTORY}"
mkdir -p "$OUT"
bash "$ROOT/packaging/build-manager.sh" "$OUT"
python3 - "$ROOT" "$OUT" <<'PY'
import sys,zipfile,hashlib
from pathlib import Path
root,out=map(Path,sys.argv[1:])
archive=out/'Reapple-Music-0.2.0-macOS.zip'
items=['install.sh','安装 Reapple.command','启动 Reapple.command','关闭 Reapple.command','卸载 Reapple.command','使用说明.txt','README.md','CHANGELOG.md','LICENSE','bin','agent','config','payload','docs']
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for name in items:
  p=root/name
  for f in sorted(p.rglob('*')) if p.is_dir() else [p]:
   if f.is_file():z.write(f,'Reapple-Music-0.2.0/'+str(f.relative_to(root)))
 # Bundle the graphical manager as the primary entry point.
 for f in sorted((out/'Reapple Music.app').rglob('*')):
  if f.is_file():z.write(f,'Reapple-Music-0.2.0/Reapple Music.app/'+str(f.relative_to(out/'Reapple Music.app')))
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(out/'Reapple-Music-0.2.0-SHA256.txt').write_text(digest+'  '+archive.name+'\n')
print(archive.resolve());print('SHA256 '+digest)
PY
