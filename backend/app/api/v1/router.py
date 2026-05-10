from fastapi import APIRouter
from app.api.v1.endpoints import admin, auth, dossiers, lld_catalog_bo, reporting, vehicles

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(dossiers.router)
api_router.include_router(vehicles.router)
api_router.include_router(reporting.router)
api_router.include_router(admin.router)
api_router.include_router(lld_catalog_bo.router)
