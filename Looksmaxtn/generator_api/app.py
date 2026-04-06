"""
Backward compatibility wrapper.
This file re-exports the main app from the modular structure.

For new code, import from app.main instead.
"""

from app.main import app

__all__ = ["app"]
