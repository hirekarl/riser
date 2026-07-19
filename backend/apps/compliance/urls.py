"""URL routes for the compliance app's API."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.compliance.views import BuildingViewSet, ElevatorViewSet, LedgerListView

router = DefaultRouter()
router.register("buildings", BuildingViewSet, basename="building")
router.register("elevators", ElevatorViewSet, basename="elevator")

urlpatterns = [
    path("ledger/", LedgerListView.as_view(), name="ledger"),
    *router.urls,
]
