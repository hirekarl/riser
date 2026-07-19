# Django REST Framework (DRF)

Official docs: https://www.django-rest-framework.org/api-guide/viewsets/, https://www.django-rest-framework.org/api-guide/serializers/

## Syntax / Usage Cheatsheet

- `ModelViewSet` gives all six actions for free: `class UserViewSet(viewsets.ModelViewSet): queryset = User.objects.all(); serializer_class = UserSerializer`.
- Read-only data: use `ReadOnlyModelViewSet` (only `.list()` / `.retrieve()`) instead of adding permission gymnastics to a full `ModelViewSet`.
- Router registration replaces manual URLconf: `router = DefaultRouter(); router.register(r"users", UserViewSet, basename="user"); urlpatterns = router.urls` — do not add a trailing slash to the registered prefix, DRF handles it.
- `ModelSerializer` field selection: `class Meta: model = Account; fields = ["id", "account_name", "created"]`.
- Lock down fields users shouldn't write: `read_only_fields = ["account_name"]` in `Meta` (fields must still be listed in `fields`).
- Computed / non-stored fields: declare a `SerializerMethodField` explicitly — `flagged = serializers.SerializerMethodField()` plus `def get_flagged(self, obj): return obj.violations.exists()`. Any property or callable on the model can also be exposed this way.
- Field-level validation: `def validate_<field_name>(self, value): ...`; object-level validation: `def validate(self, attrs): ...`.
- Nested read representations: declare a nested serializer field explicitly (`building = BuildingSerializer(read_only=True)`) rather than relying on `Meta.depth` when you need control over write behavior.
- Custom `@action` decorated methods on a viewset are auto-routed by the router; don't call `.as_view()` directly on an action or it bypasses router-applied permission/throttle settings.
- Dynamic querysets: override `get_queryset()` (e.g. to scope by `request.user`) instead of relying on the static `queryset` class attribute when access needs to be request-dependent.

## Project-Specific Gotchas

- `basename` for a router registration is derived from `.queryset.model` — if a viewset removes the static `queryset` attribute (common when overriding `get_queryset()` for per-request scoping), you must pass `basename=` explicitly to `router.register()` or route generation breaks.
- The `action` attribute on a viewset (e.g. `"list"`, `"create"`) is not yet set when `get_parsers()`, `get_authenticators()`, or `get_content_negotiator()` run — don't branch on `self.action` inside those overrides.
- Computed/non-stored fields (`SerializerMethodField`) are inherently read-only and are not included in `.validated_data` — if a computed field name collides with a real model field name listed in `fields`, DRF's auto-generation can silently shadow it; declare the method field explicitly above `Meta`.
- This repo pins `djangorestframework>=3.17.1` alongside `djangorestframework-stubs>=3.17.0` and `mypy_drf_plugin.main` in `backend/pyproject.toml` for complete type-checking support under mypy.

## Minimal Example

```python
from rest_framework import serializers, viewsets

class ElevatorUnitSerializer(serializers.ModelSerializer):
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = ElevatorUnit
        fields = ["id", "serial_number", "status", "is_overdue"]
        read_only_fields = ["status"]

    def get_is_overdue(self, obj: ElevatorUnit) -> bool:
        return obj.next_inspection_due < timezone.now().date()

class ElevatorUnitViewSet(viewsets.ModelViewSet):
    serializer_class = ElevatorUnitSerializer

    def get_queryset(self):
        return ElevatorUnit.objects.filter(building__owner=self.request.user)
```

## References

- https://www.django-rest-framework.org/api-guide/viewsets/
- https://www.django-rest-framework.org/api-guide/serializers/
