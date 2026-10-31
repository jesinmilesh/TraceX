from fastapi import APIRouter
from config.settings import settings

router = APIRouter(prefix="/config", tags=["Configuration"])

@router.get("/maps")
async def get_maps_config():
    """
    Public configuration endpoint exposing solely the browser-restricted Google Maps API key.
    Never exposes database URIs, JWT secrets, passwords, or backend credentials.
    """
    api_key = settings.GOOGLE_MAPS_API_KEY
    return {
        "google_maps_api_key": api_key,
        "configured": bool(api_key),
        "provider": "google_maps" if api_key else "unconfigured"
    }
