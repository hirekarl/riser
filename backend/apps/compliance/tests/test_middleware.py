"""Tests for the site-wide X-Robots-Tag noindex middleware (issue #93 / ADR-0002)."""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_api_response_carries_noindex_header(api_client: APIClient) -> None:
    """Every API response gets X-Robots-Tag: noindex until auth exists (ADR-0002)."""
    response = api_client.get("/api/buildings/")
    assert response.status_code == status.HTTP_200_OK
    assert response["X-Robots-Tag"] == "noindex, nofollow"
