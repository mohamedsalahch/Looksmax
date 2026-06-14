"""Tests for API endpoints."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


def test_health_check(client):
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_root(client):
    """Test root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "name" in data
    assert "endpoints" in data


def test_generator_api_fails_closed_without_service_key(client, monkeypatch):
    """Generator API routes should not run when service auth is unconfigured."""
    monkeypatch.delenv("GENERATOR_API_KEY", raising=False)

    response = client.post("/api/validate-photo", json={"image": "abc"})

    assert response.status_code == 503


def test_generator_api_requires_bearer_token(client, monkeypatch):
    """Generator API routes require the shared service token."""
    monkeypatch.setenv("GENERATOR_API_KEY", "test-service-key")

    response = client.post("/api/validate-photo", json={"image": "abc"})

    assert response.status_code == 401
