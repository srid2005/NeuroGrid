"""Subjects CRUD router (Phase 3)"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.connection import get_db
from database.models import Subject
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class SubjectCreate(BaseModel):
    name: str
    label: str
    color: str = "#8B5CF6"
    pos_x: float = 0.0
    pos_y: float = 0.0
    pos_z: float = 0.0

class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    label: Optional[str] = None
    color: Optional[str] = None

@router.get("/")
def list_subjects(db: Session = Depends(get_db)):
    return db.query(Subject).all()

@router.post("/")
def create_subject(payload: SubjectCreate, db: Session = Depends(get_db)):
    subj = Subject(**payload.dict())
    db.add(subj); db.commit(); db.refresh(subj)
    return subj

@router.get("/{subject_id}")
def get_subject(subject_id: str, db: Session = Depends(get_db)):
    s = db.query(Subject).filter(Subject.id == subject_id).first()
    if not s: raise HTTPException(404, "Subject not found")
    return s

@router.put("/{subject_id}")
def update_subject(subject_id: str, payload: SubjectUpdate, db: Session = Depends(get_db)):
    s = db.query(Subject).filter(Subject.id == subject_id).first()
    if not s: raise HTTPException(404, "Subject not found")
    for k, v in payload.dict(exclude_none=True).items(): setattr(s, k, v)
    db.commit(); db.refresh(s)
    return s

@router.delete("/{subject_id}")
def delete_subject(subject_id: str, db: Session = Depends(get_db)):
    s = db.query(Subject).filter(Subject.id == subject_id).first()
    if not s: raise HTTPException(404, "Subject not found")
    db.delete(s); db.commit()
    return {"deleted": subject_id}
