"""RFC 7807 Problem Details and Application Exceptions."""

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException


class InvalidParam(BaseModel):
    name: str
    reason: str


class ProblemDetails(BaseModel):
    type: str = Field(
        default="about:blank", description="URI reference identifying the problem type"
    )
    title: str = Field(..., description="Short, human-readable summary of the problem type")
    status: int = Field(..., description="HTTP status code")
    code: str | None = Field(default=None, description="Application error code")
    detail: str | None = Field(
        default=None, description="Human-readable explanation specific to this occurrence"
    )
    instance: str | None = Field(
        default=None, description="URI reference identifying the specific occurrence"
    )
    invalid_params: list[InvalidParam] | None = Field(
        default=None, description="Validation error details"
    )


class AppException(Exception):
    def __init__(
        self,
        title: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail: str | None = None,
        code: str | None = None,
        type_uri: str = "about:blank",
        invalid_params: list[InvalidParam] | None = None,
        headers: dict[str, str] | None = None,
    ):
        super().__init__(detail or title)
        self.title = title
        self.status_code = status_code
        self.detail = detail
        self.code = code
        self.type_uri = type_uri
        self.invalid_params = invalid_params
        self.headers = headers or {}


class ProblemException(AppException):
    def __init__(
        self,
        status: int,
        title: str,
        detail: str | None = None,
        code: str | None = None,
        type_uri: str = "about:blank",
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            title=title,
            status_code=status,
            detail=detail,
            code=code,
            type_uri=type_uri,
            headers=headers,
        )


class NotFoundError(AppException):
    def __init__(self, detail: str = "Resource not found", code: str = "not_found"):
        super().__init__(
            title="Not Found",
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail,
            code=code,
            type_uri="https://alibi.local/errors/not-found",
        )


class UnauthorizedError(AppException):
    def __init__(self, detail: str = "Unauthorized", code: str = "unauthorized"):
        super().__init__(
            title="Unauthorized",
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            code=code,
            type_uri="https://alibi.local/errors/unauthorized",
        )


class ForbiddenError(AppException):
    def __init__(self, detail: str = "Forbidden", code: str = "forbidden"):
        super().__init__(
            title="Forbidden",
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
            code=code,
            type_uri="https://alibi.local/errors/forbidden",
        )


class ConflictError(AppException):
    def __init__(self, detail: str = "Conflict", code: str = "conflict"):
        super().__init__(
            title="Conflict",
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
            code=code,
            type_uri="https://alibi.local/errors/conflict",
        )


class RateLimitError(AppException):
    def __init__(self, detail: str = "Too many requests", retry_after: int = 900):
        super().__init__(
            title="Too Many Requests",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            code="rate_limited",
            type_uri="https://alibi.local/errors/rate-limited",
            headers={"Retry-After": str(retry_after)},
        )


class ServiceUnavailableError(AppException):
    def __init__(self, detail: str = "Service unavailable"):
        super().__init__(
            title="Service Unavailable",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
            type_uri="https://alibi.local/errors/service-unavailable",
        )


def register_error_handlers(app: FastAPI) -> None:
    """Register RFC 7807 problem+json handlers with FastAPI."""

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        problem = ProblemDetails(
            type=exc.type_uri,
            title=exc.title,
            status=exc.status_code,
            code=exc.code,
            detail=exc.detail,
            instance=request.url.path,
            invalid_params=exc.invalid_params,
        )
        response_headers = {"Content-Type": "application/problem+json"}
        if exc.headers:
            response_headers.update(exc.headers)
        return JSONResponse(
            status_code=exc.status_code,
            content=problem.model_dump(exclude_none=True),
            headers=response_headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        invalid_params: list[InvalidParam] = []
        for err in exc.errors():
            loc = ".".join(str(x) for x in err.get("loc", []))
            msg = err.get("msg", "Invalid parameter")
            invalid_params.append(InvalidParam(name=loc, reason=msg))

        problem = ProblemDetails(
            type="https://alibi.local/errors/validation-error",
            title="Request Validation Failed",
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="One or more fields failed schema validation.",
            instance=request.url.path,
            invalid_params=invalid_params,
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=problem.model_dump(exclude_none=True),
            headers={"Content-Type": "application/problem+json"},
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        problem = ProblemDetails(
            type="about:blank",
            title=exc.detail if isinstance(exc.detail, str) else "HTTP Error",
            status=exc.status_code,
            detail=str(exc.detail),
            instance=request.url.path,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=problem.model_dump(exclude_none=True),
            headers={"Content-Type": "application/problem+json"},
        )
