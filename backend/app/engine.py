"""Warm policyengine-us engine with cached reformed tax-benefit systems.

Building a reformed CountryTaxBenefitSystem costs ~5s; constructing a
Simulation from a prebuilt system costs ~0.07s (verified Aug 2026). So systems
are cached by reform hash and every request reuses one. The health-benefits
switch is part of the permanent baseline: without it, Medicaid/CHIP/ACA value
is excluded from net income and those cliffs are invisible.
"""

import json
from functools import lru_cache

import numpy as np
from policyengine_core.reforms import Reform
from policyengine_us import Simulation
from policyengine_us.system import CountryTaxBenefitSystem

from .programs import ABLATION_VARIABLES, PROGRAMS, detect_cliffs
from .situations import YEAR, Household, SweepAxis, build_situation

BASELINE_REFORM = {
    "gov.simulation.include_health_benefits_in_net_income": {
        "2026-01-01.2100-12-31": True
    },
}


@lru_cache(maxsize=8)
def _get_system(reform_key: str) -> CountryTaxBenefitSystem:
    overrides = json.loads(reform_key)
    reform = Reform.from_dict({**BASELINE_REFORM, **overrides}, country_id="us")
    return CountryTaxBenefitSystem(reform=reform)


def make_simulation(situation: dict, reform_overrides: dict | None = None) -> Simulation:
    reform_key = json.dumps(reform_overrides or {}, sort_keys=True)
    return Simulation(tax_benefit_system=_get_system(reform_key), situation=situation)


def warm_up() -> None:
    """Build the baseline system at process start instead of on first request."""
    _get_system(json.dumps({}))


def run_sweep(
    household: Household,
    axis: SweepAxis,
    reform_overrides: dict | None = None,
) -> dict:
    """Sweep one input axis; return per-program decomposition and cliffs.

    All curves are household-mapped numpy arrays of length axis.count,
    converted to lists for JSON serialization.
    """
    situation = build_situation(household, axis)
    sim = make_simulation(situation, reform_overrides)

    x = sim.calculate(axis.variable, YEAR, map_to="household")
    net_income, programs = _decompose(sim)
    cliffs = detect_cliffs(x, net_income, programs)

    return {
        "axis": axis.model_dump(),
        "x": x.tolist(),
        "net_income": net_income.tolist(),
        "programs": {slug: values.tolist() for slug, values in programs.items()},
        "cliffs": cliffs,
    }


def _decompose(sim) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    net_income = sim.calculate("household_net_income", YEAR, map_to="household")
    programs = {
        slug: np.sum(
            [sim.calculate(var, YEAR, map_to="household") for var in variables],
            axis=0,
        )
        for slug, variables in PROGRAMS.items()
    }
    return net_income, programs


def run_calculate(household: Household, reform_overrides: dict | None = None) -> dict:
    """Single household calculation with per-program decomposition."""
    sim = make_simulation(build_situation(household), reform_overrides)
    net_income, programs = _decompose(sim)
    return {
        "net_income": float(net_income[0]),
        "programs": {slug: float(values[0]) for slug, values in programs.items()},
    }


def run_diff(household_a: Household, household_b: Household, axis: SweepAxis) -> dict:
    """Counterfactual comparison: the same sweep over two household scenarios."""
    sweep_a = run_sweep(household_a, axis)
    sweep_b = run_sweep(household_b, axis)
    delta = (
        np.array(sweep_b["net_income"]) - np.array(sweep_a["net_income"])
    ).tolist()
    return {"a": sweep_a, "b": sweep_b, "net_income_delta": delta}


@lru_cache(maxsize=10)
def _get_ablated_system(program: str) -> CountryTaxBenefitSystem:
    reform = Reform.from_dict(BASELINE_REFORM, country_id="us")
    system = CountryTaxBenefitSystem(reform=reform)
    for variable in ABLATION_VARIABLES[program]:
        system.neutralize_variable(variable)
    return system


def run_ablation(household: Household, axis: SweepAxis, program: str) -> dict:
    """Knock a program out of the mechanism and re-run the sweep.

    Returns baseline and ablated curves plus which OTHER programs moved —
    the interaction signal (e.g. ablating TANF kills SNAP categorical
    eligibility).
    """
    if program not in ABLATION_VARIABLES:
        raise ValueError(f"unknown program: {program!r}")
    baseline = run_sweep(household, axis)
    sim = Simulation(
        tax_benefit_system=_get_ablated_system(program),
        situation=build_situation(household, axis),
    )
    net_income, programs = _decompose(sim)
    x = np.array(baseline["x"])
    interactions = {
        slug: float(np.sum(values - np.array(baseline["programs"][slug])))
        for slug, values in programs.items()
        if slug != program
        and not np.allclose(values, baseline["programs"][slug], atol=1)
    }
    return {
        "program": program,
        "baseline": baseline,
        "ablated": {
            "net_income": net_income.tolist(),
            "programs": {slug: values.tolist() for slug, values in programs.items()},
            "cliffs": detect_cliffs(x, net_income, programs),
        },
        "interactions": interactions,
    }


def run_trace(household: Household, at: float, step: float = 1_000) -> dict:
    """Program-level attribution of the local mechanism behavior at one point.

    Computes each program just below and above `at` via a two-point sweep.
    Rule-level gate tracing (which statute clause flipped) lands in Step 6;
    until then this returns the dominant program and all deltas.
    """
    axis = SweepAxis(variable="employment_income", min=at, max=at + step, count=2)
    sim = make_simulation(build_situation(household, axis))
    net_income, programs = _decompose(sim)
    deltas = {slug: float(values[1] - values[0]) for slug, values in programs.items()}
    dominant = min(deltas, key=deltas.get)
    return {
        "at": at,
        "step": step,
        "net_income_delta": float(net_income[1] - net_income[0]),
        "program_deltas": deltas,
        "dominant_program": dominant,
    }


def run_sweep_2d(
    household: Household, axis_x: SweepAxis, axis_y: SweepAxis, y_person_index: int
) -> dict:
    """Two perpendicular axes; returns a net-income matrix of shape (y, x).

    axis_x applies to the first adult (person 0); axis_y applies to the person
    at y_person_index (e.g. the first child for childcare-cost axes).
    """
    situation = build_situation(household)
    situation["axes"] = [
        [
            {
                "name": axis_x.variable,
                "count": axis_x.count,
                "min": axis_x.min,
                "max": axis_x.max,
                "period": YEAR,
            }
        ],
        [
            {
                "name": axis_y.variable,
                "count": axis_y.count,
                "min": axis_y.min,
                "max": axis_y.max,
                "period": YEAR,
                "index": y_person_index,
            }
        ],
    ]
    sim = make_simulation(situation)
    net_income = sim.calculate("household_net_income", YEAR, map_to="household")
    matrix = net_income.reshape(axis_y.count, axis_x.count)
    return {
        "axis_x": axis_x.model_dump(),
        "axis_y": axis_y.model_dump(),
        "net_income": matrix.tolist(),
    }
