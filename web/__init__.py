"""Deployment layer for the hosted YourPDF service.

The entrypoint (``web.serve``) serves the built frontend export next to the API. All product
behaviour — limits, streaming, render budget — lives in ``backend/app`` with the endpoints it
belongs to.
"""
