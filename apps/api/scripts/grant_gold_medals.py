"""현존 캐릭터의 메달을 금메달(rank >= 7, medal_3.png)로 변경한다.

기본은 미리보기. --apply로 적용하며 기존 등급은 임시 JSON 파일에 백업한다.
"""
import argparse
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.db import SessionLocal
from app.models import Character


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    with SessionLocal.begin() as db:
        characters = db.query(Character).order_by(Character.id).with_for_update().all()
        targets = [c for c in characters if c.rank < 7]
        print(f"현재 캐릭터 {len(characters)}명, 금메달 변경 대상 {len(targets)}명")
        if not args.apply or not targets:
            return
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", prefix="dragon-gold-medals-", suffix=".json", delete=False) as backup:
            json.dump([dict(id=c.id, name=c.name, rank=c.rank) for c in targets], backup, ensure_ascii=False, indent=2)
            print(f"기존 메달 등급 백업: {backup.name}")
        for character in targets:
            character.rank = 7
        db.flush()
        if db.query(Character).filter(Character.id.in_([c.id for c in characters]), Character.rank < 7).count():
            raise RuntimeError("금메달 검증 실패")
    print(f"완료: {len(targets)}명 금메달 변경")


if __name__ == "__main__":
    main()
