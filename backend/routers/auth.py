"""Auth router — simple password gate with JWT (Phase 3)"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import hashlib, os
from dotenv import load_dotenv

load_dotenv()
router = APIRouter()

APP_PASSWORD_HASH = os.getenv("APP_PASSWORD_HASH", "d6c3cf48e43daa7c6d14e6e3883af26e3d053a4684229f888880f3097dcdf45f")

class LoginRequest(BaseModel):
    password_hash: str  # SHA-256 hash from client

@router.post("/login")
def login(req: LoginRequest):
    if req.password_hash != APP_PASSWORD_HASH:
        raise HTTPException(status_code=401, detail="Incorrect password")
    # Phase 3: return JWT token here
    return {"success": True, "message": "Authenticated"}

@router.post("/change-password")
def change_password(req: LoginRequest):
    """Phase 3: Update the stored password hash"""
    return {"message": "Not implemented in Phase 1"}
