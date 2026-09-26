"""Read-only source fingerprint; excludes dependency/build/configuration secrets."""
import hashlib
import json
from pathlib import Path

def snapshot(root):
    result = {}
    for path in root.rglob('*'):
        rel = path.relative_to(root)
        if any(part in {'node_modules', '.git', 'dist'} for part in rel.parts):
            continue
        if path.is_file() and (path.suffix in {'.js', '.jsx', '.json', '.sql', '.md', '.css', '.html', '.ps1'}):
            result[rel.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result

if __name__ == '__main__':
    for name in ['amnaMedcopy-main', 'amnaMedcopy-integration']:
        data = snapshot(Path('C:/Projects') / name)
        Path(f'artifacts/integration/{name}-before.json').write_text(json.dumps(data, indent=2))
        print(name, len(data), 'source files fingerprinted')
