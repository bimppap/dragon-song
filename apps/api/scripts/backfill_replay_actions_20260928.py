"""사용자가 확인한 과거 전투 행동 보충. --apply 없이 실행하면 검증만 한다.

피해·보상·전투 로그는 변경하지 않는다. 기존 복원 행동 전체를 보존하면서
누락 40건(공격 24, 무반응 16)을 추가하고 메테우스의 기존 방어를 확인한다.
1챕터 화면 1·2·3·4라운드 = 원본 1·2·4·5라운드.
"""
import argparse
import copy
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.crud import get_battle_replay
from app.db import SessionLocal
from app.models import BattleSession

# (전투 ID, 화면 라운드): (원본 라운드, [(캐릭터 ID, 기록상 이름, 행동, 적 이름)])
PLAN = {
    (38, 1): (1, [(40, "파에트", "none", None), (31, "서리속에 잠든 날", "none", None),
                  (36, "팡", "none", None), (27, "메테우스", "none", None)]),
    (38, 2): (2, [(40, "파에트", "none", None)]),
    (38, 3): (4, [(40, "파에트", "none", None), (27, "메테우스", "none", None)]),
    (38, 4): (5, [(40, "파에트", "none", None), (29, "라우", "none", None),
                  (27, "메테우스", "defend", None)]),
    (67, 4): (4, [(cid, name, "attack", "오버그로스") for cid, name in [
        (19, "이즈카르"), (25, "마르두"), (28, "길"), (32, "아타슈"), (26, "그란"),
        (51, "체르"), (20, "카냑"), (34, "타르"), (48, "루체릴"), (13, "백화"),
        (39, "마냥"), (16, "비르트야")]]),
    (95, 1): (1, [(39, "마냥", "none", None)]),
    (95, 2): (2, [(39, "마냥", "none", None)]),
    (95, 3): (3, [(39, "마냥", "none", None)]),
    (95, 4): (4, [(17, "벨리알 메멘토스", "none", None), (32, "아타슈", "none", None),
                  (39, "마냥", "none", None)]),
    (95, 5): (5, [(39, "마냥", "none", None), (18, "팀 노이도로프", "attack", "에리스")]),
    (132, 4): (4, [(cid, name, "attack", target) for cid, name, target in [
        (15, "황혼 녘의 델피니움", "묵야"), (33, "키프", "묵야"), (19, "이즈카르", "묵야"),
        (52, "아르커스", "묵야"), (25, "마르두", "창로"), (28, "길", "묵야"),
        (34, "타르", "묵야"), (20, "카냑", "묵야"), (23, "알란테", "창로"),
        (41, "마그누스 프로스트혼", "묵야"), (16, "비르트야", "묵야")]]),
}


def check_entry(entry, kind, target):
    assert entry["kind"] == kind, (entry, kind)
    assert entry.get("target_names", []) == ([target] if target else []), (entry, target)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    apply = parser.parse_args().apply
    backups = {}
    expected = {}
    with SessionLocal() as db, db.begin():
        battles = db.query(BattleSession).filter(BattleSession.id.in_([38, 67, 95, 132])).order_by(BattleSession.id).with_for_update().all()
        assert len(battles) == 4
        for battle in battles:
            assert battle.mode == "real" and battle.status != "in_progress"
            backups[battle.id] = {key: copy.deepcopy(getattr(battle, key)) for key in
                                  ["round_snapshots", "log", "participants", "enemies", "summons", "status", "round", "phase", "rollback_state"]}
            replay = get_battle_replay(db, battle.id, None)
            snapshots = copy.deepcopy(battle.round_snapshots)
            legacy = all(not snap.get("phase") for snap in snapshots)
            for (sid, display_round), (source_round, entries) in PLAN.items():
                if sid != battle.id:
                    continue
                turns = [t for t in replay.turns if t.phase == "ally" and t.display_round == display_round]
                assert len(turns) == 1 and turns[0].round == source_round
                turn = turns[0]
                matches = [snap for snap in snapshots if snap["round"] == source_round
                           and (legacy or snap.get("phase") == "ally")]
                assert len(matches) == 1
                snapshot = matches[0]
                # 일부 항목만 저장하면 기존 로그 복원이 생략되므로 전체 복원 행동을 함께 보존한다.
                preview = copy.deepcopy(turn.action_preview)
                names = {p["character_id"]: p["name"] for p in snapshot["participants"]}
                for cid, name, kind, target in entries:
                    assert names[cid] == name, (sid, cid, names[cid], name)
                    if target:
                        assert sum(e["name"] == target for e in turn.enemies) == 1
                    key = str(cid)
                    if key in preview:
                        check_entry(preview[key], kind, target)
                    else:
                        preview[key] = {"kind": kind, "target_names": [target] if target else [], "ally_target_ids": []}
                snapshot["action_preview"] = preview
                expected[(sid, source_round)] = preview
                print(f"#{sid} 화면 {display_round} / 원본 {source_round}: 제공 기록 {len(entries)}건, 전체 행동 {len(preview)}건")
            if apply:
                battle.round_snapshots = snapshots
        if not apply:
            print("검증 완료. --apply로 저장합니다.")
            return
        with tempfile.NamedTemporaryFile(mode="w", prefix="dragon-song-replay-before-", suffix=".json", delete=False) as backup:
            json.dump(backups, backup, ensure_ascii=False)
            print(f"변경 전 백업: {backup.name}")
        db.flush()
        for battle in battles:
            replay = get_battle_replay(db, battle.id, None)
            for turn in replay.turns:
                if turn.phase == "ally" and (battle.id, turn.round) in expected:
                    assert turn.action_preview == expected[(battle.id, turn.round)]
                elif turn.phase != "ally":
                    assert not turn.action_preview
            for key, value in backups[battle.id].items():
                if key != "round_snapshots":
                    assert getattr(battle, key) == value, key
            for before, after in zip(backups[battle.id]["round_snapshots"], battle.round_snapshots):
                assert {k: v for k, v in before.items() if k != "action_preview"} == {k: v for k, v in after.items() if k != "action_preview"}
    with SessionLocal() as db:
        for sid in [38, 67, 95, 132]:
            replay = get_battle_replay(db, sid, None)
            for turn in replay.turns:
                if turn.phase == "ally" and (sid, turn.round) in expected:
                    assert turn.action_preview == expected[(sid, turn.round)]
    print("저장 및 재조회 검증 완료: 공격 24건, 무반응 16건, 기존 방어 1건 확인")


if __name__ == "__main__":
    main()
