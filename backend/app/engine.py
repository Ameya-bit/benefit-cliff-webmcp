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

from .programs import PROGRAMS, detect_cliffs
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
    programs = {
        slug: np.sum(
            [sim.calculate(var, YEAR, map_to="household") for var in variables],
            axis=0,
        )
        for slug, variables in PROGRAMS.items()
    }
    net_income = sim.calculate("household_net_income", YEAR, map_to="household")
    cliffs = detect_cliffs(x, net_income, programs)

    return {
        "axis": axis.model_dump(),
        "x": x.tolist(),
        "net_income": net_income.tolist(),
        "programs": {slug: values.tolist() for slug, values in programs.items()},
        "cliffs": cliffs,
    }
