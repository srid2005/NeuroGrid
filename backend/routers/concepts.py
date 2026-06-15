"""Concepts (Nodes) CRUD router (Phase 3)"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.connection import get_db
from database.models import Concept
from pydantic import BaseModel
from typing import Optional, Any

router = APIRouter()

class ConceptCreate(BaseModel):
    subject_id: str
    label: str
    unit: str = ""
    notes: str = ""
    pos_x: float = 0.0
    pos_y: float = 0.0
    pos_z: float = 0.0

class ConceptUpdate(BaseModel):
    label: Optional[str] = None
    unit: Optional[str] = None
    notes: Optional[str] = None
    whiteboard_data: Optional[Any] = None

@router.get("/")
def list_concepts(subject_id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Concept)
    if subject_id: q = q.filter(Concept.subject_id == subject_id)
    return q.all()

@router.post("/")
def create_concept(payload: ConceptCreate, db: Session = Depends(get_db)):
    c = Concept(**payload.dict())
    db.add(c); db.commit(); db.refresh(c)
    return c

@router.get("/{concept_id}")
def get_concept(concept_id: str, db: Session = Depends(get_db)):
    c = db.query(Concept).filter(Concept.id == concept_id).first()
    if not c: raise HTTPException(404, "Concept not found")
    return c

@router.put("/{concept_id}")
def update_concept(concept_id: str, payload: ConceptUpdate, db: Session = Depends(get_db)):
    c = db.query(Concept).filter(Concept.id == concept_id).first()
    if not c: raise HTTPException(404, "Concept not found")
    for k, v in payload.dict(exclude_none=True).items(): setattr(c, k, v)
    db.commit(); db.refresh(c)
    return c

@router.delete("/{concept_id}")
def delete_concept(concept_id: str, db: Session = Depends(get_db)):
    c = db.query(Concept).filter(Concept.id == concept_id).first()
    if not c: raise HTTPException(404, "Concept not found")
    db.delete(c); db.commit()
    return {"deleted": concept_id}
