"""URL configuration for the Riser backend.

Routes ``/admin/`` to the Django admin site and ``/api/`` to the
compliance app's API (buildings, elevators, and the ledger).
"""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.compliance.urls")),
]
