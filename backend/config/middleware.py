"""Site-wide middleware for the Riser backend."""

from collections.abc import Callable

from django.http import HttpRequest, HttpResponse


class NoindexMiddleware:
    """Add ``X-Robots-Tag: noindex`` to every response.

    Riser is deployed publicly with no auth (``docs/adr/0002-no-auth-for-mvp.md``),
    so responses are marked noindex until auth exists. Reversible once that
    changes (see issue #93).
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        """Store the next middleware/view in the chain."""
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        """Add the noindex header to the response before returning it."""
        response = self.get_response(request)
        response["X-Robots-Tag"] = "noindex, nofollow"
        return response
