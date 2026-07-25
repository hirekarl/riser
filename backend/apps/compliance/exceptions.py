"""Custom DRF exception handling for the compliance app.

DRF's default exception handler only recognizes :class:`~rest_framework.exceptions.APIException`
(and a couple of Django built-ins) and returns ``None`` for anything else, which lets Django's
own machinery turn the exception into an HTML debug page (in ``DEBUG`` mode) or a bare, unlogged
500. :func:`riser_exception_handler` wraps the default handler so every unrecognized exception
still produces a clean, structured JSON error response and gets logged.
"""

import logging
from typing import Any

from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def riser_exception_handler(exc: Exception, context: dict[str, Any]) -> Response:
    """Convert any exception into a DRF ``Response``, logging unrecognized ones.

    Delegates to DRF's default :func:`rest_framework.views.exception_handler` first, which
    already produces clean responses for :class:`~rest_framework.exceptions.APIException`
    subclasses (including validation errors) and Django's ``Http404``/``PermissionDenied``.
    Anything that handler doesn't recognize (a bare ``ValueError``, for example) is logged
    with a full traceback and converted into a structured 500 response instead of surfacing
    as a raw, unlogged crash.

    Args:
        exc: The exception raised while handling the request.
        context: The DRF exception context, as passed by ``APIView.handle_exception``; must
            contain a ``"view"`` key identifying the view instance where the exception occurred.

    Returns:
        A DRF ``Response`` representing the exception: either the response produced by DRF's
        default handler, or a structured ``{"error": {...}}`` 500 envelope for anything else.
    """
    response = exception_handler(exc, context)
    if response is not None:
        return response

    logger.exception("Unhandled exception in %s", context["view"].__class__.__name__)
    return Response(
        {"error": {"code": "internal_error", "message": "Something went wrong. Please try again."}},
        status=500,
    )
