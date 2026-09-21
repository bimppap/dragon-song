"""도전과제 '넌 못 지나간다'(7) 보상이 1%로 잘못 지급된 것을 2%로 메운다. 1회성 스크립트.

보상은 지급 시점에 캐릭터 능력치에 더해지고 이력(Reward.reward_items)에 스냅샷으로 남는다.
그래서 도전과제 정의를 나중에 0.01 -> 0.02로 고쳐도 이미 받은 캐릭터에게는 반영되지 않는다.
이 스크립트가 차액 +0.01을 캐릭터에 더하고, 이력의 금액도 0.02로 맞춘다.

이미 0.02로 지급된 이력은 건너뛰므로 여러 번 돌려도 두 번 메워지지 않는다.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.models import Challenge, Character, Reward

CHALLENGE_ID = 7
STAT = "skill_eff_fixed"  # 기술 효율(비례, %)
PAID_AMOUNT = 0.01  # 잘못 지급된 금액
CORRECT_AMOUNT = 0.02  # 고쳐진 도전과제 보상
# 0.01 단위 값이라 더할 때마다 쌓이는 부동소수점 오차를 자르고 저장한다.
ROUND_DIGITS = 4


def main() -> None:
    db = SessionLocal()
    try:
        challenge = db.get(Challenge, CHALLENGE_ID)
        if challenge is None or challenge.name != "넌 못 지나간다":
            print(f"도전과제 #{CHALLENGE_ID}이 예상과 다릅니다. 중단합니다.")
            return
        if challenge.reward_items != [{"type": "stat", "stat": STAT, "amount": CORRECT_AMOUNT}]:
            print(f"도전과제 보상이 예상과 다릅니다: {challenge.reward_items}. 중단합니다.")
            return

        rewards = (
            db.query(Reward)
            .filter(Reward.type == "challenge", Reward.source_id == CHALLENGE_ID)
            .order_by(Reward.id)
            .all()
        )
        targets = [
            reward for reward in rewards
            if reward.reward_items == [{"type": "stat", "stat": STAT, "amount": PAID_AMOUNT}]
        ]
        others = [reward for reward in rewards if reward not in targets]
        for reward in others:
            print(f"건너뜀 (이미 고쳐졌거나 내용이 다름): R#{reward.id} {reward.reward_items}")
        if not targets:
            print("메울 보상 이력이 없습니다. 중단합니다.")
            return

        characters = {
            character.id: character
            for character in db.query(Character)
            .filter(Character.id.in_([reward.character_id for reward in targets]))
            .with_for_update()
            .all()
        }
        delta = round(CORRECT_AMOUNT - PAID_AMOUNT, ROUND_DIGITS)
        print(f"대상 {len(targets)}명, 1인당 {STAT} +{delta}")
        for reward in targets:
            character = characters.get(reward.character_id)
            if character is None:
                print(f"캐릭터 #{reward.character_id}을 찾을 수 없어 중단합니다.")
                return
            before = character.skill_eff_fixed
            character.skill_eff_fixed = round(before + delta, ROUND_DIGITS)
            # JSON 컬럼은 새 리스트를 넣어야 변경으로 잡힌다.
            reward.reward_items = [{"type": "stat", "stat": STAT, "amount": CORRECT_AMOUNT}]
            print(f"  #{character.id} {character.name}: {before} -> {character.skill_eff_fixed} (보상 이력 R#{reward.id}도 {CORRECT_AMOUNT}로 수정)")

        db.commit()
        print("완료")
    finally:
        db.close()


if __name__ == "__main__":
    main()
