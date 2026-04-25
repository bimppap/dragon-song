from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.db import engine, get_db
from app.models import Base
from app.schemas import CharacterCreate, CharacterRead
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
