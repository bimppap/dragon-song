"""최종 CSV의 특성 15개를 등록하고 확인된 테스트 특성만 제거한다.

실행: .venv/bin/python scripts/import_final_traits.py <CSV 경로> [--apply]
기본은 미리보기. 실제 반영은 단일 트랜잭션이며, 삭제 전 JSON 백업을 남긴다.
"""

import argparse
import csv
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.models import Trait
from app.schemas import TraitCreate


DESCRIPTIONS = {
    "명상": "멈추면 비로소 또렷해지는 것이 있습니다.",
    "기교": "익숙한 손놀림에도 한 번쯤 더 부릴 재주는 있습니다.",
    "분배": "강한 하나보다, 함께하는 여럿에게.",
    "공방일체": "막아 낸 자리에는 다음 공격의 길이 열립니다.",
    "만전": "완벽한 기회는 완벽한 준비를 한 사람에게 찾아옵니다.",
    "용사": "적이 많다는 것은 구해야 할 세상이 크다는 뜻입니다.",
    "혈안": "피를 끓게 만드는 투지.",
    "기회주의자": "위기는 기회이며, 기회는 더 많은 기회입니다.",
    "대비": "같은 아픔을 두 번 다시 겪지 않도록.",
    "맹공": "왜 다들 처음부터 강한 공격을 쓰지 않는지 모르겠습니다.",
    "규격화": "사람들은 예부터 반듯한 사각형에 힘이 깃든다고 믿었습니다.",
    "평안": "누군가의 안녕을 빌다 보면 제 마음도 차오릅니다.",
    "최적화": "같은 기적이라면 조금 덜 힘들게 일으켜도 좋겠습니다.",
    "중량화": "가벼운 마음으로는 들 수 없는 위력이 있습니다.",
    "불사자": "죽음이 찾아와도 오늘은 선약이 있습니다.",
}


def load_traits(path: Path) -> list[TraitCreate]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != ["이름", "효과"]:
            raise ValueError("CSV 열은 이름, 효과여야 합니다.")
        rows = list(reader)
    names = [row["이름"] for row in rows]
    if len(names) != len(DESCRIPTIONS) or set(names) != set(DESCRIPTIONS):
        raise ValueError("최종 특성 15개의 이름이 예상과 다르거나 중복되었습니다.")
    result = []
    for row in rows:
        if None in row or not row["효과"]:
            raise ValueError("효과가 없거나 CSV 열 개수가 잘못되었습니다.")
        trait = TraitCreate(
            name=row["이름"], effect=row["효과"], description=DESCRIPTIONS[row["이름"]]
        )
        if trait.effect != row["효과"]:
            raise ValueError("원본 효과에 앞뒤 공백이 있습니다. 원문을 확인하세요.")
        result.append(trait)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    traits = load_traits(args.csv_path)
    expected = {t.name: (t.effect, t.description) for t in traits}

    with SessionLocal.begin() as db:
        existing = db.query(Trait).order_by(Trait.id).with_for_update().all()
        actual = {t.name: (t.effect, t.description) for t in existing}
        if len(existing) == len(traits) and actual == expected:
            print("이미 최종 특성 15개가 동일하게 반영되어 있습니다. 변경 없음.")
            return
        if len(existing) != 1 or (existing[0].id, existing[0].name) != (1, "테스트 특성"):
            raise ValueError("기존 데이터가 확인된 테스트 특성 1개와 다릅니다. 변경을 중단합니다.")

        print("삭제: #1 테스트 특성")
        for trait in traits:
            print(f"추가: {trait.name} — {trait.description}")
        if not args.apply:
            print("미리보기 완료. 실제 반영하려면 --apply를 지정하세요.")
            return

        backup = [
            {column.name: getattr(t, column.name) for column in Trait.__table__.columns}
            for t in existing
        ]
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", prefix="dragon-song-traits-backup-", suffix=".json", delete=False
        ) as output:
            json.dump(backup, output, ensure_ascii=False, indent=2, default=str)
            print(f"기존 데이터 백업: {output.name}")
        db.delete(existing[0])
        db.add_all([Trait(**trait.model_dump()) for trait in traits])
        db.flush()
        saved = db.query(Trait).order_by(Trait.id).all()
        if len(saved) != len(traits) or [(t.name, t.effect, t.description) for t in saved] != [
            (t.name, t.effect, t.description) for t in traits
        ]:
            raise ValueError("저장 검증 실패. 전체 변경을 롤백합니다.")
    print("완료: 테스트 특성 1개 삭제, 최종 특성 15개 등록.")


if __name__ == "__main__":
    main()
