"""Freeze the supplied source bytes into an independent browser registration."""
from pathlib import Path
import base64
import hashlib
import json
import zipfile

app = Path(__file__).resolve().parents[1]
root = app.parent
manifest_path = '平台产品设计/条件获取与制度温度来源接入清单_20261006.json'
archive_path = '共享接口/条件获取与来源交接/237500352dce3223/条件获取与来源原件_20261006.zip'
manifest_bytes = (root / manifest_path).read_bytes()
archive_bytes = (root / archive_path).read_bytes()
sha = lambda value: hashlib.sha256(value).hexdigest()
assert sha(manifest_bytes) == '237500352dce32232a011dada8cf93049b097510a955f0085194f6e89b001253'
assert sha(archive_bytes) == '6b9a12ec4b8bfb03491b68fd02202a674ad61d1616daf166c310310fdbcca3d1'
manifest = json.loads(manifest_bytes)
files = [f for g in manifest['groups'] for f in g['files']]
with zipfile.ZipFile(root / archive_path) as archive:
    assert archive.testzip() is None
    assert sorted(archive.namelist()) == sorted([manifest_path] + [f['path'] for f in files])
    assert archive.read(manifest_path) == manifest_bytes
    for f in files:
        raw = (root / f['path']).read_bytes()
        assert len(raw) == f['bytes'] and sha(raw) == f['sha256']
        assert archive.read(f['path']) == raw
for g in manifest['groups']:
    canonical = json.dumps(g['files'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    assert sha(canonical) == g['source_set_sha256']
catalog = []
for g in manifest['groups']:
    catalog.append({'schema_version': '0.1.conditional-source', 'group_id': g['group_id'],
                    'registration_id': g['registration_id'], 'source_group': g,
                    'manifest_source': {'path': manifest_path, 'bytes': len(manifest_bytes), 'sha256': sha(manifest_bytes)},
                    'archive': {'path': archive_path, 'bytes': len(archive_bytes), 'sha256': sha(archive_bytes)},
                    'research_adoption': False})
registrations = [{**r, 'manifest_base64': base64.b64encode(manifest_bytes).decode('ascii'),
                   'archive_base64': base64.b64encode(archive_bytes).decode('ascii')} for r in catalog]
(app / 'src/conditional-source-catalog.js').write_text('export const CONDITIONAL_SOURCE_CATALOG = ' + json.dumps(catalog, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')
(app / 'public/data/conditional-source-state.json').write_text(json.dumps(registrations, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'groups': len(catalog), 'original_files': len(files), 'original_bytes': sum(f['bytes'] for f in files), 'source_manifest_sha256': sha(manifest_bytes)}))
