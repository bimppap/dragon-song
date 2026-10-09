"""도전과제 '종전의 기사'(12)를 달성한 캐릭터의 메달을 백금메달(rank 4, medal_4.png)로 변경한다.

기본은 미리보기. --apply로 적용하며 기존 등급은 임시 JSON 파일에 백업한다.
"""
import argparse
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.db import SessionLocal
from app.models import Challenge, ChallengeProgress, Character

CHALLENGE_ID = 12
CHALLENGE_NAME = "종전의 기사"
PLATINUM_RANK = 4


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    with SessionLocal.begin() as db:
        challenge = db.get(Challenge, CHALLENGE_ID)
        if challenge is None or challenge.name != CHALLENGE_NAME:
            raise RuntimeError(f"도전과제 #{CHALLENGE_ID}이 '{CHALLENGE_NAME}'이 아닙니다")
        achievers = (
            db.query(Character)
            .join(ChallengeProgress, ChallengeProgress.character_id == Character.id)
            .filter(ChallengeProgress.challenge_id == CHALLENGE_ID, ChallengeProgress.achieved.is_(True))
            .order_by(Character.id)
            .with_for_update(of=Character)
            .all()
        )
        targets = [c for c in achievers if c.rank < PLATINUM_RANK]
        print(f"'{CHALLENGE_NAME}' 달성 캐릭터 {len(achievers)}명, 백금메달 변경 대상 {len(targets)}명")
        for c in targets:
            print(f"  #{c.id} {c.name}: rank {c.rank} -> {PLATINUM_RANK}")
        if not args.apply or not targets:
            return
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", prefix="dragon-platinum-medals-", suffix=".json", delete=False) as backup:
            json.dump([dict(id=c.id, name=c.name, rank=c.rank) for c in targets], backup, ensure_ascii=False, indent=2)
            print(f"기존 메달 등급 백업: {backup.name}")
        for character in targets:
            character.rank = PLATINUM_RANK
        db.flush()
        if db.query(Character).filter(Character.id.in_([c.id for c in targets]), Character.rank < PLATINUM_RANK).count():
            raise RuntimeError("백금메달 검증 실패")
    print(f"완료: {len(targets)}명 백금메달 변경")


if __name__ == "__main__":
    main()
