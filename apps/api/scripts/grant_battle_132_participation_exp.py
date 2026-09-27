"""5장 실전(전투 #132)에 빠진 참가 경험치 8을 회원 캐릭터 전원에게 추가 지급한다. 1회성 스크립트.

"5. 진격" 챕터의 참가 경험치 설정이 0이라 2026-09-27 전투 보상이 골드만 나갔다. 이전 실전(#67, #95)과
같은 규칙으로, 회원과 연결된 캐릭터 전원에게 경험치 8을 준다(불참자 포함, 비회원 캐릭터 제외).

이미 보상 행이 있으면 그 행에 경험치를 덧붙이고, 없는 불참 회원은 이 전투의 보상 행을 새로 만든다.
성장등급 상승도 이 전투를 출처로 남겨, 나중에 전투 롤백을 해도 경험치·성장까지 함께 되돌아간다.

기본은 미리보기. --apply로 적용한다.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import crud
from app.db import SessionLocal
from app.models import BattleSession, Character, Reward

SESSION_ID = 132
EXPECTED_CHAPTER = "5. 진격"
EXP = 8


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    with SessionLocal.begin() as db:
        session = db.query(BattleSession).filter(BattleSession.id == SESSION_ID).with_for_update().first()
        if session is None or (session.mode, session.status, session.chapter) != ("real", "victory", EXPECTED_CHAPTER):
            raise SystemExit(f"전투 #{SESSION_ID}이 예상(실전·승리·{EXPECTED_CHAPTER})과 달라 중단합니다.")
        rollback_state = crud._get_battle_rollback_state(session)
        if rollback_state.get("version") != 1:
            raise SystemExit("보상 롤백 정보가 없는 전투라 중단합니다.")
        rows = {r.character_id: r for r in db.query(Reward).filter(Reward.type == "battle", Reward.source_id == SESSION_ID)}
        if not rows:
            raise SystemExit("이 전투의 보상 지급 기록이 없어 중단합니다.")
        if any(entry.get("type") == "experience" for r in rows.values() for entry in r.reward_items or []):
            raise SystemExit("이미 경험치가 들어간 보상 행이 있어 중단합니다(중복 지급 방지).")
        rewarded_at = next(iter(rows.values())).rewarded_at

        members = db.query(Character).filter(Character.member_id.isnot(None)).order_by(Character.id).with_for_update().all()
        level_ups = 0
        for character in members:
            before = (character.exp, character.lv, character.ap)
            rollback_state = crud._remember_reward_character_state(rollback_state, character)
            row = rows.get(character.id)
            if row is None:
                db.add(Reward(type="battle", character_id=character.id, source_id=SESSION_ID,
                              reward_items=[{"type": "experience", "amount": EXP}], rewarded_at=rewarded_at))
            else:
                row.reward_items = [*(row.reward_items or []), {"type": "experience", "amount": EXP}]
            character.exp += EXP
            grown = crud._apply_growth_from_exp(db, character, source_id=SESSION_ID)
            level_ups += grown is not None
            print(f"{character.name}({character.id}) {'기존 행' if row else '새 행'} | 경험치 {before[0]}→{character.exp}"
                  f" | 성장등급 {before[1]}→{character.lv} | AP {before[2]}→{character.ap}")
        session.rollback_state = rollback_state
        print(f"\n대상 {len(members)}명 (기존 행 {sum(c.id in rows for c in members)}, 새 행 {sum(c.id not in rows for c in members)}), 성장등급 상승 {level_ups}명")
        if not args.apply:
            db.rollback()
            print("미리보기만 했습니다. 적용하려면 --apply")
            return
    print("완료")


if __name__ == "__main__":
    main()
