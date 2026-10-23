#!/usr/bin/env python3
"""Fetch the pinned official Apple Silicon Node runtime, verifying its archive."""
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import tarfile
import urllib.request

VERSION = '22.23.4'
SHA256 = 'c9e1dbc748b33ed2d14f42445191ecaf14c56259c7a9a26d0042c49ec2b66428'
NAME = f'node-v{VERSION}-darwin-arm64'
URL = f'https://nodejs.org/dist/v{VERSION}/{NAME}.tar.gz'
if platform.system() != 'Darwin' or platform.machine() != 'arm64':
    raise SystemExit('This beta build targets Apple Silicon macOS only.')
data = urllib.request.urlopen(URL, timeout=120).read()
if hashlib.sha256(data).hexdigest() != SHA256:
    raise SystemExit('Node archive checksum mismatch; nothing installed.')
out = Path(__file__).resolve().parents[1] / 'vendor' / 'node'
out.mkdir(parents=True, exist_ok=True)
with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
    for source, name in [('bin/node', 'node'), ('LICENSE', 'LICENSE')]:
        content = archive.extractfile(f'{NAME}/{source}').read()
        temp = out / (name + '.tmp')
        temp.write_bytes(content)
        if name == 'node':
            temp.chmod(0o755)
        os.replace(temp, out / name)
(out / 'PROVENANCE.json').write_text(json.dumps({
    'version': VERSION, 'url': URL, 'archive_sha256': SHA256,
    'node': 'node', 'license': 'LICENSE'
}, indent=2) + '\n')
print(f'Prepared Node {VERSION}: {out}')
