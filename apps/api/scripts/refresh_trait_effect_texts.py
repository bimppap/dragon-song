"""규칙으로 만든 특성의 효과 문구(traits.effect)를 지금 템플릿으로 다시 쓴다.

효과 문구는 특성을 저장할 때 trait_effects.CATALOG 템플릿으로 한 번 만들어 저장한다. 그래서 템플릿을
고치면(예: 혈안이 기술뿐 아니라 마나를 쓰는 모든 행동에 체력을 쓰게 바뀜) 이미 저장된 특성은
관리자가 다시 저장하기 전까지 옛 문구를 보여준다. 문구가 달라진 특성만 고치므로 여러 번 돌려도 된다.

기본은 바꿀 내용만 출력한다. 실제로 저장하려면 --apply를 붙인다.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import trait_effects
from app.db import SessionLocal
from app.models import Trait


def main(apply: bool) -> None:
    db = SessionLocal()
    try:
        changed = 0
        for trait in db.query(Trait).order_by(Trait.id).with_for_update().all():
            if not trait.rules:
                continue
            effect = trait_effects.describe(trait.rules)
            if effect == trait.effect:
                continue
            print(f"#{trait.id} {trait.name}\n  {trait.effect}\n→ {effect}")
            trait.effect = effect
            changed += 1
        if not changed:
            print("바꿀 특성이 없습니다.")
            db.rollback()
            return
        if apply:
            db.commit()
            print(f"{changed}개 특성을 저장했습니다.")
        else:
            db.rollback()
            print(f"{changed}개 특성을 바꿀 예정입니다. 저장하려면 --apply를 붙여 다시 실행하세요.")
    finally:
        db.close()


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
