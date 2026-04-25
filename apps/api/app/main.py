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
    BulkPurchaseRequest,
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


@app.post("/purchases/bulk", response_model=list[PurchaseRead])
def bulk_purchase(data: BulkPurchaseRequest, db: Session = Depends(get_db)):
    purchases = crud.bulk_purchase(db, data)
    items = {i.id: i for i in db.query(Item).filter(Item.id.in_([p.item_id for p in purchases])).all()}
    return [
        PurchaseRead(
            id=p.id,
            character_id=p.character_id,
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
