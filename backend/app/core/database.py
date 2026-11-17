import os
import logging
from pathlib import Path
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Ensure .env is loaded reliably regardless of working directory
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
env_path = BACKEND_DIR / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_KEY")

supabase_client: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY and "placeholder" not in SUPABASE_URL:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized successfully.")
    except Exception as exc:
        logger.warning("Failed to initialize Supabase client: %s. Using local fallback.", exc)
else:
    logger.info("Supabase credentials not configured or placeholder detected. Operating in mock repository mode.")


def get_db() -> Optional[Client]:
    """Returns the authenticated Supabase client, or None if unavailable."""
    return supabase_client


def get_supabase_client() -> Optional[Client]:
    """Alias for get_db to satisfy feature service dependencies."""
    return supabase_client
