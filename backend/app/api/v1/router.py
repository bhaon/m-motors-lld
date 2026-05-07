from fastapi import APIRouter
from app.api.v1.endpoints import auth
from app.api.v1.endpoints import dossiers
from app.api.v1.endpoints import vehicles

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(dossiers.router)
api_router.include_router(vehicles.router)
