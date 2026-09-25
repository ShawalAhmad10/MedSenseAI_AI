"""Apply reviewed staged files only to the authorized integration copy, with backups."""
from pathlib import Path
import shutil

ROOT = Path('C:/Projects/amnaMedcopy-integration').resolve()
STAGE = Path('C:/Projects/MedsenseAI/artifacts/integration/partner').resolve()
BACKUP = Path('C:/Projects/MedsenseAI/artifacts/integration/backups').resolve()

for source in sorted(STAGE.rglob('*')):
    if not source.is_file():
        continue
    relative = source.relative_to(STAGE)
    target = (ROOT / relative).resolve()
    if not target.is_relative_to(ROOT) or '.env' == target.name or '.git' in relative.parts:
        raise ValueError(f'Refusing target: {target}')
    if target.exists() and target.read_bytes() == source.read_bytes():
        continue
    if target.exists():
        backup = BACKUP / relative
        if not backup.exists():
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, backup)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    print(relative.as_posix())
