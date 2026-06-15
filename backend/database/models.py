"""SQLAlchemy ORM models for NeuroGrid (Phase 3)"""
from sqlalchemy import Column, String, Float, Boolean, Text, Integer, ForeignKey, ARRAY
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
import uuid
from .connection import Base

class Subject(Base):
    __tablename__ = "subjects"
    id        = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name      = Column(String(100), nullable=False)
    label     = Column(String(10),  nullable=False)
    color     = Column(String(20),  default="#8B5CF6")
    pos_x     = Column(Float, default=0.0)
    pos_y     = Column(Float, default=0.0)
    pos_z     = Column(Float, default=0.0)
    nodes     = relationship("Concept", back_populates="subject", cascade="all, delete")

class Concept(Base):
    __tablename__ = "concepts"
    id             = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    subject_id     = Column(String, ForeignKey("subjects.id", ondelete="CASCADE"))
    label          = Column(String(200), nullable=False)
    unit           = Column(String(100), default="")
    notes          = Column(Text, default="")
    pos_x          = Column(Float, default=0.0)
    pos_y          = Column(Float, default=0.0)
    pos_z          = Column(Float, default=0.0)
    whiteboard_data = Column(JSONB, nullable=True)
    subject        = relationship("Subject", back_populates="nodes")

class ConceptLink(Base):
    __tablename__ = "concept_links"
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    from_id         = Column(String, ForeignKey("concepts.id", ondelete="CASCADE"))
    to_id           = Column(String, ForeignKey("concepts.id", ondelete="CASCADE"))
    relationship    = Column(String(100), default="relates to")
    is_cross        = Column(Boolean, default=False)
    notes           = Column(Text, default="")
    whiteboard_data = Column(JSONB, nullable=True)
