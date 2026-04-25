from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.db import engine, get_db
from app.models import Base, Item
from app.schemas import (
    CharacterCreate,
    CharacterRead,
    ItemCreate,
    ItemRead,
    ItemWithStock,
    PurchaseRequest,
    PurchaseRead,
)
from app import crud

Base.metadata.create_all(bind=engine)

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


@app.post("/items", response_model=ItemRead)
def create_item(data: ItemCreate, db: Session = Depends(get_db)):
    return crud.create_item(db, data)


@app.get("/items", response_model=list[ItemWithStock])
def list_items(character_id: int | None = None, db: Session = Depends(get_db)):
    return crud.get_items_with_stock(db, character_id)


@app.post("/purchases", response_model=PurchaseRead)
def purchase_item(data: PurchaseRequest, db: Session = Depends(get_db)):
    purchase = crud.purchase_item(db, data)
    item = db.query(Item).filter_by(id=purchase.item_id).first()
    return PurchaseRead(
        id=purchase.id,
        character_id=purchase.character_id,
        item_id=purchase.item_id,
        item_name=item.name,
        created_at=purchase.created_at,
    )


@app.get("/purchases", response_model=list[PurchaseRead])
def list_purchases(
    character_id: int | None = None,
    item_id: int | None = None,
    db: Session = Depends(get_db),
):
    return crud.get_purchases(db, character_id, item_id)
