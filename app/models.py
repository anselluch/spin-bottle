from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class User(BaseModel):
    id: int
    first_name: str
    username: Optional[str] = None

class Room(BaseModel):
    id: int
    name: str
    participants: list = []

class SpinRequest(BaseModel):
    user_id: int
    room_id: int

class ReactionRequest(BaseModel):
    from_user_id: int
    to_user_id: int
    room_id: int

class MatchResponse(BaseModel):
    match: bool
    partner_name: Optional[str] = None
    partner_id: Optional[int] = None
    stats: dict