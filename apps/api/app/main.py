from datetime import date

from fastapi import FastAPI, Depends, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import storage
from app.auth import create_access_token, get_current_member, is_admin_role, require_admin, require_owner_admin
from app.db import engine, get_db
from app.migrations import ensure_schema
from app.models import Chapter, Challenge, Character, Enemy, Item, Member, Mission, SkillNode
from app.schemas import (
    AccessTokenResponse,
    AdminGiftRequest,
    AttendanceEntryCreate,
    AttendanceEntryRead,
    AttendanceRewardPayResult,
    AttendanceStreakEntry,
    BattleAllyTurnRequest,
    BattleEnemyJoinRequest,
    BattleJoinRequest,
    BattleRewardPreview,
    BattleSessionRead,
    BattleSessionSummary,
    BattleStartRequest,
    BattleTelegraphRequest,
    ChapterCreate,
    ChapterRead,
    CharacterCreate,
    CharacterOnboardingCreate,
    EnemyCreate,
    EnemyRead,
    EnvironmentCreate,
    EnvironmentRead,
    CharacterDetailRead,
    CharacterFlagsUpdate,
    CharacterRead,
    ChallengeCreate,
    ChallengeProgressBulkUpdate,
    ChallengeProgressRead,
    ChallengeRead,
    ChallengeUpdate,
    HealerCandidateRead,
    ItemCreate,
    ItemRead,
    ItemWithStock,
    BulkPurchaseRequest,
    LoginRequest,
    MemberRead,
    MissionCreate,
    MissionProgressBulkUpdate,
    MissionProgressRead,
    MissionRead,
    MissionUpdate,
    NoncombatHealRequest,
    NoncombatHealResult,
    PurchaseRead,
    RefreshTokenRequest,
    RewardPayResult,
    RewardRead,
    RewardWithCharacterRead,
    SettlementCreate,
    SettlementPayRequest,
    SettlementRead,
    SignupRequest,
    SkillNameUpdate,
    SkillNodeRead,
    SkillNodeUpdate,
    SkillVisibilityUpdate,
    ShopStatusRead,
    StaffCandidateRead,
    StaffRoleUpdate,
    ShopStatusUpdate,
    CharacterSkillTreeRead,
    TokenResponse,
    UseItemRequest,
)
from app import crud

ensure_schema(engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    return {"status": "ok"}


@app.post("/auth/signup", response_model=MemberRead)
def signup(data: SignupRequest, db: Session = Depends(get_db)):
    member = crud.create_member(db, data)
    return crud.to_member_read(db, member)


@app.post("/auth/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    member = crud.authenticate_member(db, data)
    access_token = create_access_token(member.id)
    refresh_token = crud.issue_refresh_token(db, member.id)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, member=crud.to_member_read(db, member))


@app.post("/auth/refresh", response_model=AccessTokenResponse)
def refresh_token(data: RefreshTokenRequest, db: Session = Depends(get_db)):
    access_token = crud.refresh_access_token(db, data.refresh_token)
    return AccessTokenResponse(access_token=access_token)


@app.post("/auth/logout")
def logout(data: RefreshTokenRequest, db: Session = Depends(get_db)):
    crud.revoke_refresh_token(db, data.refresh_token)
    return {"ok": True}


@app.get("/auth/me", response_model=MemberRead)
def get_me(member: Member = Depends(get_current_member), db: Session = Depends(get_db)):
    return crud.to_member_read(db, member)


@app.get("/admin/staff", response_model=list[StaffCandidateRead])
def list_staff_candidates(member: Member = Depends(require_owner_admin), db: Session = Depends(get_db)):
    return crud.list_staff_candidates(db)


@app.put("/admin/staff/{member_id}/role", response_model=StaffCandidateRead)
def update_staff_role(
    member_id: int,
    data: StaffRoleUpdate,
    member: Member = Depends(require_owner_admin),
    db: Session = Depends(get_db),
):
    return crud.set_member_staff_role(db, member_id, data.role)


@app.get("/admin/heal/healers", response_model=list[HealerCandidateRead])
def list_healer_candidates(member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    return crud.list_healer_candidates(db)


@app.post("/admin/heal/{healer_id}", response_model=NoncombatHealResult)
def perform_noncombat_heal(
    healer_id: int,
    data: NoncombatHealRequest,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.perform_noncombat_heal(db, healer_id, data.target_character_id)


@app.post("/members/me/character", response_model=CharacterRead)
def create_my_character(
    data: CharacterOnboardingCreate,
    member: Member = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    created = crud.create_character_for_member(db, member, data)
    if not is_admin_role(member.role):
        created = crud.scrub_admin_only_stats(created)
    return created


@app.get("/members/me/character", response_model=CharacterDetailRead)
def get_my_character(member: Member = Depends(get_current_member), db: Session = Depends(get_db)):
    character_id = crud.get_member_character_id(db, member.id)
    if character_id is None:
        raise HTTPException(status_code=404, detail="생성된 캐릭터가 없습니다.")
    detail = crud.get_character_detail(db, character_id)
    if not is_admin_role(member.role):
        detail = crud.scrub_admin_only_stats(detail)
    return detail


@app.post("/characters", response_model=CharacterRead)
def create_character(data: CharacterCreate, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    return crud.create_character(db, data)


@app.put("/characters/{character_id}", response_model=CharacterRead)
def update_character(
    character_id: int,
    data: CharacterCreate,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """관리자가 만든 캐릭터(러너 계정 미연결)만 능력치·기술을 제한 없이 통째로 수정할 수 있다."""
    return crud.update_character(db, character_id, data)


@app.get("/characters", response_model=list[CharacterRead])
def list_characters(member: Member = Depends(get_current_member), db: Session = Depends(get_db)):
    characters = crud.get_characters(db)
    if not is_admin_role(member.role):
        # 관리자가 만든 캐릭터(러너 계정에 연결되지 않음)는 러너 목록에 노출하지 않는다.
        # 단, 전투에 참여하면 전투 세션 스냅샷을 통해 전투 화면에서는 그대로 보인다.
        characters = [c for c in characters if c.member_id is not None]
        characters = [crud.scrub_admin_only_stats(c) for c in characters]
    return characters


@app.get("/characters/{character_id}", response_model=CharacterDetailRead)
def get_character(
    character_id: int,
    member: Member = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    detail = crud.get_character_detail(db, character_id)
    if not is_admin_role(member.role):
        detail = crud.scrub_admin_only_stats(detail)
        # 다른 캐릭터를 조회할 때는 보상·구매 이력을 숨긴다.
        if crud.get_member_character_id(db, member.id) != character_id:
            detail = detail.model_copy(update={"reward_history": [], "item_history": []})
    return detail


@app.patch("/characters/{character_id}/flags", response_model=CharacterRead)
def update_character_flags(
    character_id: int,
    data: CharacterFlagsUpdate,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """관리자 전용 관리 플래그(주의·경고)를 수정한다."""
    return crud.update_character_flags(db, character_id, data)


@app.post("/characters/{character_id}/image", response_model=CharacterDetailRead)
async def upload_character_image(
    character_id: int,
    file: UploadFile = File(...),
    member: Member = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """캐릭터 이미지를 WebP로 변환해 버킷 character/ 디렉토리에 업로드하고, 기존 이미지는 삭제한다.

    본인 캐릭터 또는 관리자만 편집할 수 있다.
    """
    _require_own_character_or_admin(db, member, character_id)
    character = db.get(Character, character_id)
    if not character:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")

    data = await file.read()
    result = await storage.upload_image_to_bucket(storage.make_key("character", character.id, character.name), data)

    old_path = storage.public_url_to_path(character.image_url)
    if old_path and old_path != result["path"]:
        await storage.delete_from_bucket(old_path)

    character.image_url = result["public_url"]
    db.commit()

    detail = crud.get_character_detail(db, character_id)
    if not is_admin_role(member.role):
        detail = crud.scrub_admin_only_stats(detail)
    return detail


@app.delete("/characters/{character_id}")
async def delete_character(character_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    image_url = crud.delete_character(db, character_id)
    old_path = storage.public_url_to_path(image_url)
    if old_path:
        await storage.delete_from_bucket(old_path)
    return {"deleted": True}


@app.get("/attendance/entries", response_model=list[AttendanceEntryRead])
def list_attendance_entries(
    member: Member = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """러너도 조회만 가능하다(등록/수정은 관리자 전용)."""
    return crud.get_attendance_entries(db)


@app.post("/attendance/entries", response_model=list[AttendanceEntryRead])
def create_attendance_entry(
    data: AttendanceEntryCreate,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """관리자가 캐릭터를 선택해 출석 처리한다. 보상은 별도 버튼으로 지급한다."""
    return crud.create_attendance_entry(db, data)


@app.delete("/attendance/entries/{entry_id}", response_model=list[AttendanceEntryRead])
def delete_attendance_entry(
    entry_id: int,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """관리자가 잘못 등록한 출석 기록을 삭제한다."""
    return crud.delete_attendance_entry(db, entry_id)


@app.post("/attendance/rewards/pay", response_model=AttendanceRewardPayResult)
def pay_attendance_rewards(
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """출석했지만 보상을 받지 않은 모든 캐릭터에게 출석 보상을 일괄 지급한다."""
    return crud.pay_attendance_rewards(db)


@app.get("/attendance/streak-ranking", response_model=list[AttendanceStreakEntry])
def get_attendance_streak_ranking(
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.get_attendance_streak_ranking(db)


@app.post("/items", response_model=ItemRead)
def create_item(data: ItemCreate, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    return crud.create_item(db, data)


@app.put("/items/{item_id}", response_model=ItemRead)
def update_item(
    item_id: int,
    data: ItemCreate,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.update_item(db, item_id, data)


@app.post("/items/{item_id}/image", response_model=ItemRead)
async def upload_item_image(
    item_id: int,
    file: UploadFile = File(...),
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """아이템 이미지를 WebP로 변환해 버킷 item/ 디렉토리에 업로드하고, 기존 이미지는 삭제한다.

    파일명은 `{id}_{아이템명}`(공백은 _로 대체)으로 저장한다.
    """
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="아이템을 찾을 수 없습니다.")

    data = await file.read()
    result = await storage.upload_image_to_bucket(storage.make_key("item", item.id, item.name), data)

    old_path = storage.public_url_to_path(item.image_url)
    if old_path and old_path != result["path"]:
        await storage.delete_from_bucket(old_path)

    item.image_url = result["public_url"]
    db.commit()
    db.refresh(item)
    return item


@app.delete("/items/{item_id}")
async def delete_item(item_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    image_url = crud.delete_item(db, item_id)
    old_path = storage.public_url_to_path(image_url)
    if old_path:
        await storage.delete_from_bucket(old_path)
    return {"deleted": True}


@app.get("/shop/status", response_model=ShopStatusRead)
def get_shop_status(member: Member = Depends(get_current_member), db: Session = Depends(get_db)):
    return crud.get_shop_status(db)


@app.put("/shop/status", response_model=ShopStatusRead)
def update_shop_status(
    data: ShopStatusUpdate,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.update_shop_status(db, data.is_open)


@app.get("/challenges", response_model=list[ChallengeRead])
def list_challenges(
    chapter: str | None = None,
    member: Member = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    challenges = crud.get_challenges(db, chapter)
    if not is_admin_role(member.role):
        challenges = [c for c in challenges if c.is_public]
    return challenges


@app.post("/challenges", response_model=ChallengeRead)
def create_challenge(data: ChallengeCreate, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    return crud.create_challenge(db, data)


@app.put("/challenges/{challenge_id}", response_model=ChallengeRead)
def update_challenge(
    challenge_id: int,
    data: ChallengeUpdate,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.update_challenge(db, challenge_id, data)


@app.post("/challenges/{challenge_id}/image", response_model=ChallengeRead)
async def upload_challenge_image(
    challenge_id: int,
    file: UploadFile = File(...),
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """도전과제 이미지를 WebP로 변환해 버킷 challenge/ 디렉토리에 업로드하고, 기존 이미지는 삭제한다."""
    challenge = db.get(Challenge, challenge_id)
    if not challenge:
        raise HTTPException(status_code=404, detail="도전과제를 찾을 수 없습니다.")

    data = await file.read()
    result = await storage.upload_image_to_bucket(storage.make_key("challenge", challenge.id, challenge.name), data)

    old_path = storage.public_url_to_path(challenge.image_url)
    if old_path and old_path != result["path"]:
        await storage.delete_from_bucket(old_path)

    challenge.image_url = result["public_url"]
    db.commit()
    db.refresh(challenge)
    return challenge


@app.delete("/challenges/{challenge_id}")
async def delete_challenge(challenge_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    image_url = crud.delete_challenge(db, challenge_id)
    old_path = storage.public_url_to_path(image_url)
    if old_path:
        await storage.delete_from_bucket(old_path)
    return {"deleted": True}


@app.get("/challenges/{challenge_id}/progress", response_model=list[ChallengeProgressRead])
def list_challenge_progress(challenge_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    return crud.get_challenge_progress(db, challenge_id)


@app.put("/challenges/{challenge_id}/progress", response_model=list[ChallengeProgressRead])
def save_challenge_progress(
    challenge_id: int,
    data: ChallengeProgressBulkUpdate,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.update_challenge_progress(db, challenge_id, data)


@app.get("/items", response_model=list[ItemWithStock])
def list_items(
    character_id: int | None = None,
    member: Member = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    items = crud.get_items_with_stock(db, character_id)
    if not is_admin_role(member.role):
        items = [
            item.model_copy(
                update={
                    "available_from_chapter": None,
                    "available_until_chapter": None,
                    "restricted_mission_id": None,
                }
            )
            for item in items
            if item.purchasable
        ]
    return items


@app.post("/purchases/bulk", response_model=list[PurchaseRead])
def bulk_purchase(data: BulkPurchaseRequest, member: Member = Depends(get_current_member), db: Session = Depends(get_db)):
    is_admin = is_admin_role(member.role)
    if not is_admin and crud.get_member_character_id(db, member.id) != data.character_id:
        raise HTTPException(status_code=403, detail="본인 캐릭터로만 구매할 수 있습니다.")
    purchases = crud.bulk_purchase(db, data, is_admin=is_admin)
    item_ids = {p.item_id for p in purchases}
    character_ids = {p.character_id for p in purchases}
    items = {i.id: i for i in db.query(Item).filter(Item.id.in_(item_ids)).all()}
    characters = {
        c.id: c for c in db.query(Character).filter(Character.id.in_(character_ids)).all()
    }
    return [
        PurchaseRead(
            id=p.id,
            character_id=p.character_id,
            character_name=characters[p.character_id].name,
            item_id=p.item_id,
            item_name=items[p.item_id].name,
            quantity=p.quantity,
            created_at=p.created_at,
        )
        for p in purchases
    ]


def _require_own_character_or_admin(db: Session, member: Member, character_id: int) -> None:
    if not is_admin_role(member.role) and crud.get_member_character_id(db, member.id) != character_id:
        raise HTTPException(status_code=403, detail="본인 캐릭터에만 사용할 수 있습니다.")


@app.post("/characters/{character_id}/items/{item_id}/use", response_model=CharacterDetailRead)
def use_item(
    character_id: int,
    item_id: int,
    data: UseItemRequest | None = None,
    member: Member = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    _require_own_character_or_admin(db, member, character_id)
    detail = crud.use_item(db, character_id, item_id, data.chosen_stats if data else None)
    if not is_admin_role(member.role):
        detail = crud.scrub_admin_only_stats(detail)
    return detail


@app.post("/characters/{character_id}/items/{item_id}/equip", response_model=CharacterDetailRead)
def equip_item(
    character_id: int,
    item_id: int,
    member: Member = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    _require_own_character_or_admin(db, member, character_id)
    detail = crud.equip_item(db, character_id, item_id)
    if not is_admin_role(member.role):
        detail = crud.scrub_admin_only_stats(detail)
    return detail


@app.post("/characters/{character_id}/items/{item_id}/unequip", response_model=CharacterDetailRead)
def unequip_item(
    character_id: int,
    item_id: int,
    member: Member = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    _require_own_character_or_admin(db, member, character_id)
    detail = crud.unequip_item(db, character_id, item_id)
    if not is_admin_role(member.role):
        detail = crud.scrub_admin_only_stats(detail)
    return detail


@app.get("/purchases", response_model=list[PurchaseRead])
def list_purchases(
    character_id: int | None = None,
    item_id: int | None = None,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.get_purchases(db, character_id, item_id)


@app.get("/missions", response_model=list[MissionRead])
def list_missions(
    chapter: str | None = None,
    member: Member = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    missions = crud.get_missions(db, chapter)
    if not is_admin_role(member.role):
        missions = [m for m in missions if m.is_public]
    return missions


@app.post("/missions", response_model=MissionRead)
def create_mission(data: MissionCreate, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    return crud.create_mission(db, data)


@app.put("/missions/{mission_id}", response_model=MissionRead)
def update_mission(
    mission_id: int,
    data: MissionUpdate,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.update_mission(db, mission_id, data)


@app.post("/missions/{mission_id}/image", response_model=MissionRead)
async def upload_mission_image(
    mission_id: int,
    file: UploadFile = File(...),
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """임무 이미지를 WebP로 변환해 버킷 mission/ 디렉토리에 업로드하고, 기존 이미지는 삭제한다."""
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status_code=404, detail="임무를 찾을 수 없습니다.")

    data = await file.read()
    result = await storage.upload_image_to_bucket(storage.make_key("mission", mission.id, mission.name), data)

    old_path = storage.public_url_to_path(mission.image_url)
    if old_path and old_path != result["path"]:
        await storage.delete_from_bucket(old_path)

    mission.image_url = result["public_url"]
    db.commit()
    db.refresh(mission)
    return mission


@app.delete("/missions/{mission_id}")
async def delete_mission(mission_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    image_url = crud.delete_mission(db, mission_id)
    old_path = storage.public_url_to_path(image_url)
    if old_path:
        await storage.delete_from_bucket(old_path)
    return {"deleted": True}


@app.get("/missions/{mission_id}/progress", response_model=list[MissionProgressRead])
def list_mission_progress(mission_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    return crud.get_mission_progress(db, mission_id)


@app.put("/missions/{mission_id}/progress", response_model=list[MissionProgressRead])
def save_mission_progress(
    mission_id: int,
    data: MissionProgressBulkUpdate,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.update_mission_progress(db, mission_id, data)


@app.post("/rewards/mission/{mission_id}", response_model=RewardPayResult)
def pay_mission_rewards(mission_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    return crud.pay_mission_rewards(db, mission_id)


@app.get("/settlements", response_model=list[SettlementRead])
def list_settlements(member: Member = Depends(get_current_member), db: Session = Depends(get_db)):
    """어드민은 전체, 러너는 본인 캐릭터의 정산 요청만 조회한다."""
    if is_admin_role(member.role):
        return crud.get_settlement_requests(db)
    character_id = crud.get_member_character_id(db, member.id)
    if character_id is None:
        return []
    return crud.get_settlement_requests(db, character_id)


@app.post("/settlements", response_model=list[SettlementRead])
def create_settlement(
    data: SettlementCreate,
    member: Member = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    return crud.create_settlement_request(db, member, data)


@app.post("/settlements/{settlement_id}/pay", response_model=SettlementRead)
def pay_settlement(
    settlement_id: int,
    data: SettlementPayRequest,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """정산 요청을 승인하고 골드·CP를 지급한다. 보상 이력에 '로그 정산'으로 남는다."""
    return crud.pay_settlement(db, settlement_id, data)


@app.get("/rewards", response_model=list[RewardWithCharacterRead])
def list_all_rewards(
    character_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.get_all_rewards(db, character_id, date_from, date_to)


@app.post("/rewards/{reward_id}/revoke", response_model=RewardWithCharacterRead)
def revoke_reward(reward_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    """지급된 보상을 회수한다. 회수 내역도 보상 이력에 남는다."""
    return crud.revoke_reward(db, reward_id)


@app.post("/rewards/admin-gift", response_model=list[RewardRead])
def send_admin_gift(data: AdminGiftRequest, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    """관리자가 캐릭터에게 골드·CP·경험치·아이템을 선물한다. 보상 이력에 '관리자의 선물'로 남는다."""
    return crud.send_admin_gift(db, data)


@app.post("/rewards/challenge/{challenge_id}", response_model=RewardPayResult)
def pay_challenge_rewards(challenge_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    return crud.pay_challenge_rewards(db, challenge_id)


@app.get("/chapters", response_model=list[ChapterRead])
def list_chapters(db: Session = Depends(get_db)):
    return crud.get_chapters(db)


@app.post("/chapters", response_model=ChapterRead)
def create_chapter(data: ChapterCreate, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    return crud.create_chapter(db, data)


@app.put("/chapters/{chapter_id}", response_model=ChapterRead)
async def update_chapter(
    chapter_id: int,
    data: ChapterCreate,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    chapter = db.get(Chapter, chapter_id)
    old_music_url = chapter.music_url if chapter else None
    old_music_path = storage.public_url_to_path(chapter.music_url) if chapter else None
    updated = crud.update_chapter(db, chapter_id, data)
    if old_music_path and updated.music_url != old_music_url:
        await storage.delete_from_bucket(old_music_path)
    return updated


@app.post("/chapters/{chapter_id}/image", response_model=ChapterRead)
async def upload_chapter_image(
    chapter_id: int,
    file: UploadFile = File(...),
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """챕터 이미지를 chapter/ 디렉토리에 저장하고 기존 이미지는 교체한다."""
    chapter = db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="챕터를 찾을 수 없습니다.")

    result = await storage.upload_image_to_bucket(
        storage.make_key("chapter", chapter.id, chapter.name), await file.read()
    )
    old_path = storage.public_url_to_path(chapter.image_url)
    if old_path and old_path != result["path"]:
        await storage.delete_from_bucket(old_path)

    chapter.image_url = result["public_url"]
    db.commit()
    db.refresh(chapter)
    return crud._to_chapter_read(chapter)


@app.post("/chapters/{chapter_id}/music", response_model=ChapterRead)
async def upload_chapter_music(
    chapter_id: int,
    file: UploadFile = File(...),
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """챕터 음원을 chapter/ 디렉토리에 저장하고 기존 첨부 음원을 교체한다."""
    chapter = db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="챕터를 찾을 수 없습니다.")

    result = await storage.upload_audio_to_bucket(
        f"chapter/{chapter.id}_music",
        await file.read(),
        content_type=file.content_type,
        filename=file.filename,
    )
    old_path = storage.public_url_to_path(chapter.music_url)
    if old_path and old_path != result["path"]:
        await storage.delete_from_bucket(old_path)

    chapter.music_url = result["public_url"]
    db.commit()
    db.refresh(chapter)
    return crud._to_chapter_read(chapter)


@app.delete("/chapters/{chapter_id}")
async def delete_chapter(chapter_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    image_url, music_url = crud.delete_chapter(db, chapter_id)
    for url in (image_url, music_url):
        path = storage.public_url_to_path(url)
        if path:
            await storage.delete_from_bucket(path)
    return {"deleted": True}


@app.get("/chapters/active", response_model=ChapterRead | None)
def get_active_chapter(db: Session = Depends(get_db)):
    return crud.get_active_chapter(db)


@app.get("/enemies", response_model=list[EnemyRead])
def list_enemies(chapter: str | None = None, member: Member = Depends(get_current_member), db: Session = Depends(get_db)):
    return crud.get_enemies_for_member(db, member, chapter)


@app.post("/enemies", response_model=EnemyRead)
def create_enemy(data: EnemyCreate, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    return crud.create_enemy(db, data)


@app.put("/enemies/{enemy_id}", response_model=EnemyRead)
def update_enemy(
    enemy_id: int,
    data: EnemyCreate,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.update_enemy(db, enemy_id, data)


@app.post("/enemies/{enemy_id}/image", response_model=EnemyRead)
async def upload_enemy_image(
    enemy_id: int,
    file: UploadFile = File(...),
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """에너미 이미지를 WebP로 변환해 버킷 enemy/ 디렉토리에 업로드하고, 기존 이미지는 삭제한다."""
    enemy = db.get(Enemy, enemy_id)
    if not enemy:
        raise HTTPException(status_code=404, detail="에너미를 찾을 수 없습니다.")

    data = await file.read()
    result = await storage.upload_image_to_bucket(storage.make_key("enemy", enemy.id, enemy.name), data)

    old_path = storage.public_url_to_path(enemy.image_url)
    if old_path and old_path != result["path"]:
        await storage.delete_from_bucket(old_path)

    enemy.image_url = result["public_url"]
    db.commit()
    db.refresh(enemy)
    return enemy


@app.post("/enemies/{enemy_id}/skills/{skill_index}/summon-image", response_model=EnemyRead)
async def upload_enemy_summon_image(
    enemy_id: int,
    skill_index: int,
    file: UploadFile = File(...),
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """소환 스킬의 소환수 이미지를 업로드한다. skill_index는 에너미의 skills 배열 내 인덱스다."""
    enemy = db.get(Enemy, enemy_id)
    if not enemy:
        raise HTTPException(status_code=404, detail="에너미를 찾을 수 없습니다.")
    skills = list(enemy.skills or [])
    if skill_index < 0 or skill_index >= len(skills):
        raise HTTPException(status_code=404, detail="스킬을 찾을 수 없습니다.")

    skill = skills[skill_index]
    data = await file.read()
    key_name = f"{skill_index}_{skill.get('summon_name') or 'summon'}"
    result = await storage.upload_image_to_bucket(storage.make_key("enemy-summon", enemy.id, key_name), data)

    old_path = storage.public_url_to_path(skill.get("summon_image_url"))
    if old_path and old_path != result["path"]:
        await storage.delete_from_bucket(old_path)

    skills[skill_index] = {**skill, "summon_image_url": result["public_url"]}
    enemy.skills = skills
    db.commit()
    db.refresh(enemy)
    return enemy


@app.delete("/enemies/{enemy_id}")
async def delete_enemy(enemy_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    image_url = crud.delete_enemy(db, enemy_id)
    old_path = storage.public_url_to_path(image_url)
    if old_path:
        await storage.delete_from_bucket(old_path)
    return {"deleted": True}


@app.get("/environments", response_model=list[EnvironmentRead])
def list_environments(chapter: str | None = None, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    return crud.get_environments(db, chapter)


@app.post("/environments", response_model=EnvironmentRead)
def create_environment(data: EnvironmentCreate, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    return crud.create_environment(db, data)


@app.put("/environments/{environment_id}", response_model=EnvironmentRead)
def update_environment(
    environment_id: int,
    data: EnvironmentCreate,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.update_environment(db, environment_id, data)


@app.delete("/environments/{environment_id}")
def delete_environment(environment_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    crud.delete_environment(db, environment_id)
    return {"deleted": True}


@app.get("/battles", response_model=list[BattleSessionSummary])
def list_battles(
    mode: str | None = None,
    status: str | None = None,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.get_battle_sessions(db, mode, status)


@app.post("/battles", response_model=BattleSessionRead)
def create_battle(data: BattleStartRequest, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    return crud.start_battle(db, member, data)


@app.get("/battles/live", response_model=BattleSessionRead | None)
def get_live_battle(member: Member = Depends(get_current_member), db: Session = Depends(get_db)):
    """러너 관전용: 진행 중인 실전 전투가 있으면 반환하고, 없으면 null을 반환한다."""
    return crud.get_live_real_battle(db)


@app.get("/battles/{session_id}", response_model=BattleSessionRead)
def get_battle(session_id: int, member: Member = Depends(get_current_member), db: Session = Depends(get_db)):
    return crud.get_battle_session(db, session_id, member)


@app.delete("/battles/{session_id}")
def delete_battle(session_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    crud.delete_battle_session(db, session_id)
    return {"deleted": True}


@app.post("/battles/{session_id}/rollback")
def rollback_battle(session_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    """실전 테스트 전투를 원상복구하고 기록까지 삭제한다."""
    crud.rollback_battle_session(db, session_id)
    return {"rolled_back": True}


@app.post("/battles/{session_id}/terminate", response_model=BattleSessionRead)
def terminate_battle(session_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    """관리자가 승패와 관계없이 진행 중인 전투를 조기 종료한다."""
    return crud.terminate_battle(db, session_id)


@app.post("/battles/{session_id}/telegraph", response_model=BattleSessionRead)
def submit_battle_telegraph(
    session_id: int,
    data: BattleTelegraphRequest,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """1턴: 적의 행동 암시."""
    return crud.resolve_battle_telegraph(db, session_id, data)


@app.post("/battles/{session_id}/ally-turn", response_model=BattleSessionRead)
def submit_battle_ally_turn(
    session_id: int,
    data: BattleAllyTurnRequest,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """2턴: 아군 턴."""
    return crud.resolve_battle_ally_turn(db, session_id, data)


@app.post("/battles/{session_id}/enemy-turn", response_model=BattleSessionRead)
def submit_battle_enemy_turn(
    session_id: int,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """3턴: 에너미 턴."""
    return crud.resolve_battle_enemy_turn(db, session_id)


@app.post("/battles/{session_id}/undo-round", response_model=BattleSessionRead)
def undo_battle_round(session_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    """직전 라운드를 되돌려 그 라운드를 다시 진행할 수 있게 한다(실전 전투만 가능)."""
    return crud.undo_last_round(db, session_id)


@app.get("/battles/{session_id}/rewards", response_model=BattleRewardPreview)
def get_battle_rewards(session_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    """실전 전투 종료 후 러너별로 지급될 승리/행동/전원 보상을 미리 계산해 보여준다."""
    return crud.get_battle_reward_preview(db, session_id)


@app.post("/battles/{session_id}/rewards/send", response_model=BattleRewardPreview)
def send_battle_rewards(session_id: int, member: Member = Depends(require_admin), db: Session = Depends(get_db)):
    """실전 전투 보상을 실제로 지급한다(전투당 1회만 가능)."""
    return crud.send_battle_rewards(db, session_id)


@app.post("/battles/{session_id}/join", response_model=BattleSessionRead)
def join_battle(
    session_id: int,
    data: BattleJoinRequest,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """관리자가 전투 중간에 캐릭터를 난입시킨다. 난입한 캐릭터는 해당 라운드에 공격/치유 대상이 되지 않는다."""
    return crud.join_battle(db, session_id, data)


@app.post("/battles/{session_id}/join-enemy", response_model=BattleSessionRead)
def join_battle_enemy(
    session_id: int,
    data: BattleEnemyJoinRequest,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """관리자가 전투 중간에 에너미를 추가한다. 추가된 에너미는 다음 라운드부터 행동한다."""
    return crud.join_battle_enemy(db, session_id, data)


@app.post("/uploads/image")
async def upload_image(
    file: UploadFile = File(...),
    path: str = Form(...),
    member: Member = Depends(require_admin),
):
    """이미지를 WebP로 변환해 Supabase 버킷에 업로드하고 공개 URL을 반환한다."""
    data = await file.read()
    return await storage.upload_image_to_bucket(path, data)


@app.get("/skills", response_model=list[SkillNodeRead])
def list_skill_nodes(book: str, member: Member = Depends(get_current_member), db: Session = Depends(get_db)):
    return crud.get_skill_nodes(db, book)


@app.put("/skills/visibility", response_model=list[SkillNodeRead])
def update_skill_visibility(
    data: SkillVisibilityUpdate,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.update_skill_visibility(db, data)


@app.put("/skills/{node_id}", response_model=SkillNodeRead)
def update_skill_node(
    node_id: int,
    data: SkillNodeUpdate,
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.update_skill_node(db, node_id, data)


@app.post("/skills/{node_id}/image", response_model=SkillNodeRead)
async def upload_skill_image(
    node_id: int,
    file: UploadFile = File(...),
    member: Member = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """기술 이미지를 WebP로 변환해 버킷 skill/ 디렉토리에 업로드하고, 기존 이미지는 삭제한다.

    파일명은 `{id}_{기술명}`(공백은 _로 대체)으로 저장한다.
    """
    node = db.get(SkillNode, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="기술을 찾을 수 없습니다.")

    data = await file.read()
    result = await storage.upload_image_to_bucket(storage.make_key("skill", node.id, node.default_name), data)

    old_path = storage.public_url_to_path(node.image_url)
    if old_path and old_path != result["path"]:
        await storage.delete_from_bucket(old_path)

    node.image_url = result["public_url"]
    db.commit()
    db.refresh(node)
    return crud._to_skill_node_read(node)


@app.get("/characters/{character_id}/skills", response_model=CharacterSkillTreeRead)
def get_character_skills(
    character_id: int,
    book: str,
    member: Member = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    _require_own_character_or_admin(db, member, character_id)
    return crud.get_character_skill_tree(db, character_id, book)


@app.post("/characters/{character_id}/skills/{node_id}/unlock", response_model=CharacterSkillTreeRead)
def unlock_character_skill(
    character_id: int,
    node_id: int,
    member: Member = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    _require_own_character_or_admin(db, member, character_id)
    return crud.unlock_character_skill_node(db, character_id, node_id)


@app.put("/characters/{character_id}/skills/{node_id}/name", response_model=CharacterSkillTreeRead)
def rename_character_skill(
    character_id: int,
    node_id: int,
    data: SkillNameUpdate,
    member: Member = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    _require_own_character_or_admin(db, member, character_id)
    return crud.rename_character_skill(db, character_id, node_id, data.custom_name)


@app.post("/characters/{character_id}/skills/{node_id}/image", response_model=CharacterSkillTreeRead)
async def upload_character_skill_image(
    character_id: int,
    node_id: int,
    file: UploadFile = File(...),
    member: Member = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """러너가 습득한 기술의 이미지를 개인화한다. 루트(0단계) 노드는 습득 기록이 없어 자연히 제외된다."""
    _require_own_character_or_admin(db, member, character_id)
    old_image_url = crud.get_character_skill_unlock_image(db, character_id, node_id)

    data = await file.read()
    result = await storage.upload_image_to_bucket(storage.make_key("character-skill", character_id, f"{node_id}"), data)

    old_path = storage.public_url_to_path(old_image_url)
    if old_path and old_path != result["path"]:
        await storage.delete_from_bucket(old_path)

    return crud.set_character_skill_image(db, character_id, node_id, result["public_url"])
