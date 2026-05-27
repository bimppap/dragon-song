from datetime import date

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.db import engine, get_db
from app.migrations import ensure_schema
from app.models import Character, Item
from app.schemas import (
    AttendanceRecordRead,
    AttendanceRecordUpdate,
    ChapterCreate,
    ChapterRead,
    CharacterCreate,
    EnemyCreate,
    EnemyRead,
    CharacterDetailRead,
    CharacterRead,
    ChallengeCreate,
    ChallengeProgressBulkUpdate,
    ChallengeProgressRead,
    ChallengeRead,
    ItemCreate,
    ItemRead,
    ItemWithStock,
    BulkPurchaseRequest,
    MissionCreate,
    MissionProgressBulkUpdate,
    MissionProgressRead,
    MissionRead,
    PurchaseRead,
    RewardPayResult,
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


@app.post("/characters", response_model=CharacterRead)
def create_character(data: CharacterCreate, db: Session = Depends(get_db)):
    return crud.create_character(db, data)


@app.get("/characters", response_model=list[CharacterRead])
def list_characters(db: Session = Depends(get_db)):
    return crud.get_characters(db)


@app.get("/characters/{character_id}", response_model=CharacterDetailRead)
def get_character(character_id: int, db: Session = Depends(get_db)):
    return crud.get_character_detail(db, character_id)


@app.get("/attendance", response_model=AttendanceRecordRead)
def get_attendance(attendance_date: date, db: Session = Depends(get_db)):
    return crud.get_attendance_record(db, attendance_date)


@app.put("/attendance", response_model=AttendanceRecordRead)
def save_attendance(
    attendance_date: date,
    data: AttendanceRecordUpdate,
    db: Session = Depends(get_db),
):
    return crud.upsert_attendance_record(db, attendance_date, data)


@app.post("/items", response_model=ItemRead)
def create_item(data: ItemCreate, db: Session = Depends(get_db)):
    return crud.create_item(db, data)


@app.get("/challenges", response_model=list[ChallengeRead])
def list_challenges(chapter: str | None = None, db: Session = Depends(get_db)):
    return crud.get_challenges(db, chapter)


@app.post("/challenges", response_model=ChallengeRead)
def create_challenge(data: ChallengeCreate, db: Session = Depends(get_db)):
    return crud.create_challenge(db, data)


@app.get("/challenges/{challenge_id}/progress", response_model=list[ChallengeProgressRead])
def list_challenge_progress(challenge_id: int, db: Session = Depends(get_db)):
    return crud.get_challenge_progress(db, challenge_id)


@app.put("/challenges/{challenge_id}/progress", response_model=list[ChallengeProgressRead])
def save_challenge_progress(
    challenge_id: int,
    data: ChallengeProgressBulkUpdate,
    db: Session = Depends(get_db),
):
    return crud.update_challenge_progress(db, challenge_id, data)


@app.get("/items", response_model=list[ItemWithStock])
def list_items(character_id: int | None = None, db: Session = Depends(get_db)):
    return crud.get_items_with_stock(db, character_id)


@app.post("/purchases/bulk", response_model=list[PurchaseRead])
def bulk_purchase(data: BulkPurchaseRequest, db: Session = Depends(get_db)):
    purchases = crud.bulk_purchase(db, data)
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


@app.get("/purchases", response_model=list[PurchaseRead])
def list_purchases(
    character_id: int | None = None,
    item_id: int | None = None,
    db: Session = Depends(get_db),
):
    return crud.get_purchases(db, character_id, item_id)


@app.get("/missions", response_model=list[MissionRead])
def list_missions(chapter: str | None = None, db: Session = Depends(get_db)):
    return crud.get_missions(db, chapter)


@app.post("/missions", response_model=MissionRead)
def create_mission(data: MissionCreate, db: Session = Depends(get_db)):
    return crud.create_mission(db, data)


@app.get("/missions/{mission_id}/progress", response_model=list[MissionProgressRead])
def list_mission_progress(mission_id: int, db: Session = Depends(get_db)):
    return crud.get_mission_progress(db, mission_id)


@app.put("/missions/{mission_id}/progress", response_model=list[MissionProgressRead])
def save_mission_progress(
    mission_id: int,
    data: MissionProgressBulkUpdate,
    db: Session = Depends(get_db),
):
    return crud.update_mission_progress(db, mission_id, data)


@app.post("/rewards/mission/{mission_id}", response_model=RewardPayResult)
def pay_mission_rewards(mission_id: int, db: Session = Depends(get_db)):
    return crud.pay_mission_rewards(db, mission_id)


@app.post("/rewards/attendance", response_model=RewardPayResult)
def pay_attendance_rewards(attendance_date: date, db: Session = Depends(get_db)):
    return crud.pay_attendance_rewards(db, attendance_date)


@app.post("/rewards/challenge/{challenge_id}", response_model=RewardPayResult)
def pay_challenge_rewards(challenge_id: int, db: Session = Depends(get_db)):
    return crud.pay_challenge_rewards(db, challenge_id)


@app.get("/chapters", response_model=list[ChapterRead])
def list_chapters(db: Session = Depends(get_db)):
    return crud.get_chapters(db)


@app.post("/chapters", response_model=ChapterRead)
def create_chapter(data: ChapterCreate, db: Session = Depends(get_db)):
    return crud.create_chapter(db, data)


@app.get("/chapters/active", response_model=ChapterRead | None)
def get_active_chapter(db: Session = Depends(get_db)):
    return crud.get_active_chapter(db)


@app.get("/enemies", response_model=list[EnemyRead])
def list_enemies(chapter: str | None = None, db: Session = Depends(get_db)):
    return crud.get_enemies(db, chapter)


@app.post("/enemies", response_model=EnemyRead)
def create_enemy(data: EnemyCreate, db: Session = Depends(get_db)):
    return crud.create_enemy(db, data)
