"""Peira backend API.

Thin, stateless wrapper over the engine: the household travels with every
request, all state lives in the frontend. Every response uses the
{success, data, error} envelope.
"""

import os
import threading
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import engine, prewarm
from .policy import REFORM_PARAMETERS, build_reform_overrides
from .programs import ABLATION_VARIABLES
from .situations import Household, SweepAxis

ALLOWED_ORIGINS = os.environ.get(
    "PEIRA_ALLOWED_ORIGINS", "http://localhost:5173"
).split(",")


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine.warm_up()
    # Fill the answer cache for the preset scenarios without delaying boot.
    # PEIRA_PREWARM=0 opts out (tests, local dev restarts).
    if os.environ.get("PEIRA_PREWARM", "1") != "0":
        threading.Thread(target=prewarm.run, name="prewarm", daemon=True).start()
    yield


app = FastAPI(title="Peira", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


def envelope(data) -> dict:
    return {"success": True, "data": data, "error": None}


# --- rate limiting ---------------------------------------------------------
# /reform edits policy and /minimal_fix searches policy-space (~5s live) —
# the two write-shaped, heaviest probes. One warm engine serves everyone
# during judging, so they get a per-client sliding-window lid; everything
# else is cheap enough to leave open. In-process on purpose: single
# instance. Requires uvicorn --proxy-headers so request.client is the real
# visitor, not Render's proxy (which would pool everyone into one bucket).

RATE_LIMITS: dict[str, tuple[int, float]] = {
    "/reform": (10, 60.0),  # (max calls, window seconds)
    "/minimal_fix": (6, 60.0),
}
_request_log: dict[tuple[str, str], deque[float]] = defaultdict(deque)


class RateLimited(Exception):
    pass


def _sliding_window_allows(
    key: tuple[str, str], max_calls: int, window: float, now: float
) -> bool:
    log = _request_log[key]
    while log and now - log[0] > window:
        log.popleft()
    if len(log) >= max_calls:
        return False
    log.append(now)
    return True


def enforce_rate_limit(request: Request) -> None:
    limit = RATE_LIMITS.get(request.url.path)
    if limit is None:
        return
    max_calls, window = limit
    client = request.client.host if request.client else "unknown"
    if not _sliding_window_allows(
        (client, request.url.path), max_calls, window, time.monotonic()
    ):
        raise RateLimited(
            "The policy engine is busy with rule changes — wait a minute and try again."
        )


@app.exception_handler(RateLimited)
async def rate_limited_handler(request: Request, exc: RateLimited):
    return JSONResponse(
        status_code=429,
        content={"success": False, "data": None, "error": str(exc)},
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=422,
        content={"success": False, "data": None, "error": str(exc)},
    )


class CalculateRequest(BaseModel):
    household: Household


class SweepRequest(BaseModel):
    household: Household
    axis: SweepAxis = Field(default_factory=SweepAxis)


class Sweep2DRequest(BaseModel):
    household: Household
    axis_x: SweepAxis = Field(default_factory=SweepAxis)
    axis_y: SweepAxis


class DiffRequest(BaseModel):
    household_a: Household
    household_b: Household
    axis: SweepAxis = Field(default_factory=SweepAxis)


class AblateRequest(BaseModel):
    household: Household
    axis: SweepAxis = Field(default_factory=SweepAxis)
    program: str


class TraceRequest(BaseModel):
    household: Household
    at: float = Field(ge=0, le=1_000_000)


class ReformRequest(BaseModel):
    household: Household
    axis: SweepAxis = Field(default_factory=SweepAxis)
    reforms: dict[str, float | bool]


class MinimalFixRequest(BaseModel):
    household: Household
    axis: SweepAxis = Field(default_factory=SweepAxis)
    cliff_at: float = Field(ge=0, le=1_000_000)


@app.get("/health")
def health():
    return envelope({"status": "warm"})


@app.post("/calculate")
def calculate(req: CalculateRequest):
    return envelope(engine.run_calculate(req.household))


@app.post("/sweep")
def sweep(req: SweepRequest):
    return envelope(engine.run_sweep(req.household, req.axis))


@app.post("/sweep2d")
def sweep_2d(req: Sweep2DRequest):
    # The y axis targets the first child (childcare-cost sweeps); person
    # ordering in situations.py is adults first, then children.
    if not req.household.children:
        raise ValueError("2D sweeps need at least one child for the y axis")
    y_index = len(req.household.adults)
    return envelope(
        engine.run_sweep_2d(req.household, req.axis_x, req.axis_y, y_index)
    )


@app.post("/diff")
def diff(req: DiffRequest):
    return envelope(engine.run_diff(req.household_a, req.household_b, req.axis))


@app.post("/ablate")
def ablate(req: AblateRequest):
    return envelope(engine.run_ablation(req.household, req.axis, req.program))


@app.post("/trace")
def trace(req: TraceRequest):
    return envelope(engine.run_trace(req.household, req.at))


@app.post("/reform", dependencies=[Depends(enforce_rate_limit)])
def reform(req: ReformRequest):
    overrides = build_reform_overrides(req.reforms)
    baseline = engine.run_sweep(req.household, req.axis)
    reformed = engine.run_sweep(req.household, req.axis, overrides)
    return envelope({"baseline": baseline, "reformed": reformed})


@app.post("/minimal_fix", dependencies=[Depends(enforce_rate_limit)])
def minimal_fix(req: MinimalFixRequest):
    return envelope(engine.run_minimal_fix(req.household, req.axis, req.cliff_at))


@app.get("/policy-parameters")
def policy_parameters():
    return envelope(
        {pid: spec.model_dump() for pid, spec in REFORM_PARAMETERS.items()}
    )


@app.get("/programs")
def programs():
    return envelope({"programs": list(ABLATION_VARIABLES)})
