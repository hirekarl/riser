"""URL routes for the compliance app's API."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.compliance.views import (
    BuildingViewSet,
    DemoDataSeedView,
    ElevatorViewSet,
    LedgerListView,
    NarrationView,
)

router = DefaultRouter()
router.register("buildings", BuildingViewSet, basename="building")
router.register("elevators", ElevatorViewSet, basename="elevator")

urlpatterns = [
    path("ledger/narration/", NarrationView.as_view(), name="ledger-narration"),
    path("ledger/", LedgerListView.as_view(), name="ledger"),
    path("demo-data/seed/", DemoDataSeedView.as_view(), name="demo-data-seed"),
    *router.urls,
]
