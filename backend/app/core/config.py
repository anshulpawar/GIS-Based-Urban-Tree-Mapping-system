"""
Application Core Configuration Proxy Module.

Forwards to app.config providing strongly typed application configurations.
"""

from app.config import Settings, get_settings

__all__ = ["Settings", "get_settings"]
