import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load variables from .env
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
# Prefer SECRET_KEY for server operations, fallback to KEY
SUPABASE_KEY = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY in environment variables.")

# Create the reusable Supabase client instance
supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_db() -> Client:
    """Returns the authenticated Supabase client."""
    return supabase_client