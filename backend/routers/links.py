"""Concept Links CRUD router (Phase 3)"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.connection import get_db
from database.models import ConceptLink, Concept
from pydantic import BaseModel
from typing import Optional, Any

router = APIRouter()

class LinkCreate(BaseModel):
    from_id: str
    to_id: str
    relationship: str = "relates to"

class LinkUpdate(BaseModel):
    relationship: Optional[str] = None
    notes: Optional[str] = None
    whiteboard_data: Optional[Any] = None

@router.get("/")
def list_links(db: Session = Depends(get_db)):
    return db.query(ConceptLink).all()

@router.post("/")
def create_link(payload: LinkCreate, db: Session = Depends(get_db)):
    from_node = db.query(Concept).filter(Concept.id == payload.from_id).first()
    to_node   = db.query(Concept).filter(Concept.id == payload.to_id).first()
    if not from_node or not to_node: raise HTTPException(404, "Concept not found")
    is_cross = from_node.subject_id != to_node.subject_id
    link = ConceptLink(**payload.dict(), is_cross=is_cross)
    db.add(link); db.commit(); db.refresh(link)
    return link

@router.get("/{link_id}")
def get_link(link_id: str, db: Session = Depends(get_db)):
    l = db.query(ConceptLink).filter(ConceptLink.id == link_id).first()
    if not l: raise HTTPException(404, "Link not found")
    return l

@router.put("/{link_id}")
def update_link(link_id: str, payload: LinkUpdate, db: Session = Depends(get_db)):
    l = db.query(ConceptLink).filter(ConceptLink.id == link_id).first()
    if not l: raise HTTPException(404, "Link not found")
    for k, v in payload.dict(exclude_none=True).items(): setattr(l, k, v)
    db.commit(); db.refresh(l)
    return l

@router.delete("/{link_id}")
def delete_link(link_id: str, db: Session = Depends(get_db)):
    l = db.query(ConceptLink).filter(ConceptLink.id == link_id).first()
    if not l: raise HTTPException(404, "Link not found")
    db.delete(l); db.commit()
    return {"deleted": link_id}
