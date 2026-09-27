"""5장 임무 4개를 모두 달성한 캐릭터에게 도전과제 '숙련된 투사'(9)를 달성 처리하고 보상을 지급. 1회성 스크립트.

관리자 요청으로, '5. 진격'의 공개 임무 4개(진격·통신 복구·구출·개화)를 전부 달성한
캐릭터를 골라 도전과제 진행을 achieved=True로 바꾸고, 관리자 화면의 "보상 지급"과 같은 경로
(pay_challenge_rewards)로 보상(최대 체력 +5)을 준다.

이미 보상을 받은 캐릭터는 pay_challenge_rewards가 알아서 건너뛰므로 두 번 지급되지 않는다.
기본은 미리보기. --apply로 적용한다.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.crud import pay_challenge_rewards
from app.db import SessionLocal
from app.models import Challenge, Character, ChallengeProgress, Mission, MissionProgress

CHALLENGE_ID = 9
CHAPTER = "5. 진격"
EXPECTED_MISSION_IDS = {18, 19, 20, 21}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    db = SessionLocal()
    try:
        challenge = db.get(Challenge, CHALLENGE_ID)
        if challenge is None or challenge.name != "숙련된 투사" or challenge.chapter != CHAPTER:
            print(f"도전과제 #{CHALLENGE_ID}이 예상과 다릅니다. 중단합니다.")
            return

        mission_ids = {
            mission_id
            for mission_id, in db.query(Mission.id)
            .filter(Mission.chapter == CHAPTER, Mission.is_public.is_(True))
            .all()
        }
        if mission_ids != EXPECTED_MISSION_IDS:
            print(f"'{CHAPTER}'의 공개 임무가 예상과 다릅니다: {sorted(mission_ids)}. 중단합니다.")
            return

        achieved_by_character: dict[int, set[int]] = {}
        rows = (
            db.query(MissionProgress.character_id, MissionProgress.mission_id)
            .filter(MissionProgress.mission_id.in_(mission_ids))
            .filter(MissionProgress.achieved.is_(True))
            .all()
        )
        for character_id, mission_id in rows:
            achieved_by_character.setdefault(character_id, set()).add(mission_id)
        qualified = sorted(
            character_id
            for character_id, done in achieved_by_character.items()
            if done >= mission_ids
        )
        if not qualified:
            print("5장 임무를 모두 달성한 캐릭터가 없습니다. 중단합니다.")
            return

        characters = {
            character.id: character
            for character in db.query(Character).filter(Character.id.in_(qualified)).with_for_update().all()
        }
        before_hp_max = {character_id: character.hp_max for character_id, character in characters.items()}

        # 달성 표시. 진행 행이 아직 없는 캐릭터는 만들어 준다.
        existing = {
            progress.character_id: progress
            for progress in db.query(ChallengeProgress)
            .filter(ChallengeProgress.challenge_id == CHALLENGE_ID)
            .filter(ChallengeProgress.character_id.in_(qualified))
            .all()
        }
        newly_marked = 0
        for character_id in qualified:
            progress = existing.get(character_id)
            if progress is None:
                db.add(ChallengeProgress(challenge_id=CHALLENGE_ID, character_id=character_id, achieved=True))
                newly_marked += 1
            elif not progress.achieved:
                progress.achieved = True
                newly_marked += 1
        db.flush()

        result = pay_challenge_rewards(db, CHALLENGE_ID, character_ids=set(qualified), commit=False)
        paid_ids = {reward.character_id for reward in result.rewards}
        print(f"대상 캐릭터 {len(qualified)}명:")
        for character_id in qualified:
            character = characters[character_id]
            status = "지급" if character_id in paid_ids else "이미 지급됨"
            print(f"  #{character_id} {character.name} | {status} | 최대 체력 {before_hp_max[character_id]}→{character.hp_max}")
        print(f"달성 표시: {newly_marked}명 (나머지는 이미 달성 상태) / 보상 지급: {result.paid_count}명")
        if not args.apply:
            db.rollback()
            print("미리보기만 했습니다. 적용하려면 --apply")
            return
        db.commit()
        print("완료")
    finally:
        db.close()


if __name__ == "__main__":
    main()
