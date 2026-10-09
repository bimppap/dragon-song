"""모험가 등급(rank)을 메달 단계 그대로(1 동, 2 은, 3 금, 4 백금, 5 용린) 쓰도록 기존 값을 옮긴다.

예전에는 rank 1~3 동, 4~6 은, 7~9 금, 10 이상 백금이었다. 기본은 미리보기.
--apply로 적용하며 기존 등급은 임시 JSON 파일에 백업한다.
"""
import argparse
import json
import sys
import tempfile
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.db import SessionLocal
from app.models import Character


def new_rank(old: int) -> int:
    return 1 if old <= 3 else 2 if old <= 6 else 3 if old <= 9 else 4


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    with SessionLocal.begin() as db:
        characters = db.query(Character).order_by(Character.id).with_for_update().all()
        targets = [c for c in characters if new_rank(c.rank) != c.rank]
        changes = Counter((c.rank, new_rank(c.rank)) for c in targets)
        print(f"현재 캐릭터 {len(characters)}명, 등급 변경 대상 {len(targets)}명")
        for (old, new), count in sorted(changes.items()):
            print(f"  rank {old} -> {new}: {count}명")
        if not args.apply or not targets:
            return
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", prefix="dragon-rank-remap-", suffix=".json", delete=False) as backup:
            json.dump([dict(id=c.id, name=c.name, rank=c.rank) for c in targets], backup, ensure_ascii=False, indent=2)
            print(f"기존 등급 백업: {backup.name}")
        for character in targets:
            character.rank = new_rank(character.rank)
        db.flush()
        if db.query(Character).filter(Character.id.in_([c.id for c in characters]), (Character.rank < 1) | (Character.rank > 5)).count():
            raise RuntimeError("등급 검증 실패")
    print(f"완료: {len(targets)}명 등급 변경")


if __name__ == "__main__":
    main()
