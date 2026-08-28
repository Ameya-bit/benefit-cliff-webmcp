"""Peira backend API.

Thin, stateless wrapper over the engine: the household travels with every
request, all state lives in the frontend. Every response uses the
{success, data, error} envelope.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import engine
from .policy import REFORM_PARAMETERS, build_reform_overrides
from .programs import ABLATION_VARIABLES
from .situations import Household, SweepAxis

ALLOWED_ORIGINS = os.environ.get(
    "PEIRA_ALLOWED_ORIGINS", "http://localhost:5173"
).split(",")


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine.warm_up()
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


@app.post("/reform")
def reform(req: ReformRequest):
    overrides = build_reform_overrides(req.reforms)
    baseline = engine.run_sweep(req.household, req.axis)
    reformed = engine.run_sweep(req.household, req.axis, overrides)
    return envelope({"baseline": baseline, "reformed": reformed})


@app.post("/minimal_fix")
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
