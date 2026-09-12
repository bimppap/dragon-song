"""'베네르바' 캐릭터와 그 캐릭터를 만든 회원 계정 삭제. 1회성 스크립트.

관리자 요청으로 캐릭터(id 47)와 회원(id 44, login_id aajj0323)을 지운다.
캐릭터에 딸린 데이터는 관리자 화면의 캐릭터 삭제와 같은 경로(crud.delete_character)로 지우고,
그 뒤 회원의 리프레시 토큰과 회원 행을 지운다.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import crud
from app.db import SessionLocal
from app.models import Character, Member, RefreshToken

CHARACTER_ID = 47
EXPECTED_CHARACTER_NAME = "베네르바"
EXPECTED_MEMBER_ID = 44
EXPECTED_LOGIN_ID = "aajj0323"


def main() -> None:
    db = SessionLocal()
    try:
        character = db.get(Character, CHARACTER_ID)
        if character is None:
            print(f"캐릭터 #{CHARACTER_ID}이 없습니다. 중단합니다.")
            return
        if character.name != EXPECTED_CHARACTER_NAME or character.member_id != EXPECTED_MEMBER_ID:
            print(f"예상과 다른 캐릭터라 중단합니다: name={character.name}, member_id={character.member_id}")
            return

        member = db.get(Member, EXPECTED_MEMBER_ID)
        if member is None or member.login_id != EXPECTED_LOGIN_ID:
            print(f"예상과 다른 회원이라 중단합니다: {member and member.login_id}")
            return

        others = (
            db.query(Character)
            .filter(Character.member_id == member.id, Character.id != character.id)
            .all()
        )
        if others:
            print(f"이 회원에게 다른 캐릭터가 있어 중단합니다: {[c.name for c in others]}")
            return

        image_url = crud.delete_character(db, character.id)
        print(f"캐릭터 #{CHARACTER_ID} {EXPECTED_CHARACTER_NAME} 및 딸린 데이터 삭제 (이미지: {image_url})")

        tokens = db.query(RefreshToken).filter(RefreshToken.member_id == member.id).delete()
        print(f"리프레시 토큰 {tokens}건 삭제")
        db.delete(member)
        db.commit()
        print(f"회원 #{member.id} {EXPECTED_LOGIN_ID} 삭제 완료")
    finally:
        db.close()


if __name__ == "__main__":
    main()
