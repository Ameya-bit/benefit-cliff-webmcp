"""Warm policyengine-us engine with a single cached tax-benefit system.

Building a (reformed) CountryTaxBenefitSystem costs ~5s, but each one holds
~1.2GB resident (measured Aug 2026) — caching several OOM-killed the 2GB
production instance (exit 137). So exactly ONE system lives in memory at a
time: switching reform/ablation evicts the old system and rebuilds (~5s),
and every public run_* entry point serializes on _ENGINE_LOCK so an
in-flight computation's system can't be evicted under it. The
health-benefits switch is part of the permanent baseline: without it,
Medicaid/CHIP/ACA value is excluded from net income and those cliffs are
invisible.
"""

import ctypes
import gc
import json
import threading
from functools import wraps

import numpy as np
from policyengine_core.reforms import Reform
from policyengine_us import Simulation
from policyengine_us.system import CountryTaxBenefitSystem

from .gates import GATE_MAPS
from .policy import REFORM_PARAMETERS, build_reform_overrides
from .programs import ABLATION_VARIABLES, PROGRAMS, detect_cliffs
from .situations import YEAR, Household, SweepAxis, build_situation

BASELINE_REFORM = {
    "gov.simulation.include_health_benefits_in_net_income": {
        "2026-01-01.2100-12-31": True
    },
}


_ENGINE_LOCK = threading.RLock()
_system_key: tuple[str, str] | None = None
_system: CountryTaxBenefitSystem | None = None


def _serialized(fn):
    """Run the whole engine call under the lock: computations never overlap,
    so the single cached system can't be evicted while a request uses it."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        with _ENGINE_LOCK:
            return fn(*args, **kwargs)

    return wrapper


def _release_memory() -> None:
    gc.collect()
    try:
        # glibc only: hand freed arenas back to the OS so the container's
        # cgroup accounting sees them (no-op failure on macOS).
        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except OSError:
        pass


def _swap_system(key: tuple[str, str], build) -> CountryTaxBenefitSystem:
    global _system_key, _system
    if _system_key == key and _system is not None:
        return _system
    _system, _system_key = None, None
    _release_memory()
    _system = build()
    _system_key = key
    return _system


def _get_system(reform_key: str) -> CountryTaxBenefitSystem:
    def build() -> CountryTaxBenefitSystem:
        overrides = json.loads(reform_key)
        reform = Reform.from_dict({**BASELINE_REFORM, **overrides}, country_id="us")
        return CountryTaxBenefitSystem(reform=reform)

    return _swap_system(("reform", reform_key), build)


def make_simulation(situation: dict, reform_overrides: dict | None = None) -> Simulation:
    reform_key = json.dumps(reform_overrides or {}, sort_keys=True)
    return Simulation(tax_benefit_system=_get_system(reform_key), situation=situation)


def warm_up() -> None:
    """Build the baseline system at process start instead of on first request."""
    _get_system(json.dumps({}))


@_serialized
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


@_serialized
def run_calculate(household: Household, reform_overrides: dict | None = None) -> dict:
    """Single household calculation with per-program decomposition."""
    sim = make_simulation(build_situation(household), reform_overrides)
    net_income, programs = _decompose(sim)
    return {
        "net_income": float(net_income[0]),
        "programs": {slug: float(values[0]) for slug, values in programs.items()},
    }


@_serialized
def run_diff(household_a: Household, household_b: Household, axis: SweepAxis) -> dict:
    """Counterfactual comparison: the same sweep over two household scenarios."""
    sweep_a = run_sweep(household_a, axis)
    sweep_b = run_sweep(household_b, axis)
    delta = (
        np.array(sweep_b["net_income"]) - np.array(sweep_a["net_income"])
    ).tolist()
    return {"a": sweep_a, "b": sweep_b, "net_income_delta": delta}


def _get_ablated_system(program: str) -> CountryTaxBenefitSystem:
    def build() -> CountryTaxBenefitSystem:
        reform = Reform.from_dict(BASELINE_REFORM, country_id="us")
        system = CountryTaxBenefitSystem(reform=reform)
        for variable in ABLATION_VARIABLES[program]:
            system.neutralize_variable(variable)
        return system

    return _swap_system(("ablate", program), build)


@_serialized
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


def _person_names(household: Household) -> list[str]:
    return [f"adult_{i + 1}" for i in range(len(household.adults))] + [
        f"child_{i + 1}" for i in range(len(household.children))
    ]


def _trace_gates(sim: Simulation, household: Household, program: str) -> list[dict]:
    """Evaluate the program's curated gate variables at both trace points and
    report every rule whose boolean flipped across the crossing."""
    people = _person_names(household)
    flips = []
    for gate in GATE_MAPS.get(program, []):
        values = sim.calculate(gate.variable, YEAR)
        if gate.level == "person":
            # axis expansion orders person arrays [everyone@x0, everyone@x1]
            matrix = np.array(values).reshape(2, len(people))
            for p, name in enumerate(people):
                before, after = bool(matrix[0][p]), bool(matrix[1][p])
                if before != after:
                    flips.append(
                        {"rule": gate.rule, "variable": gate.variable,
                         "person": name, "before": before, "after": after,
                         "param_id": gate.param_id}
                    )
        elif gate.kind == "count":
            before, after = float(values[0]), float(values[1])
            if abs(before - after) >= 1:
                flips.append(
                    {"rule": gate.rule, "variable": gate.variable,
                     "person": None, "before": before, "after": after,
                     "param_id": gate.param_id}
                )
        else:
            before, after = bool(values[0]), bool(values[1])
            if before != after:
                flips.append(
                    {"rule": gate.rule, "variable": gate.variable,
                     "person": None, "before": before, "after": after,
                     "param_id": gate.param_id}
                )
    return flips


@_serialized
def run_trace(household: Household, at: float, step: float = 1_000) -> dict:
    """Attribute the local mechanism behavior at one point, down to the rule.

    A two-point sweep finds the dominant program; the program's curated gate
    map (gates.py) then identifies WHICH income test flipped, for WHOM, and —
    when the threshold is whitelisted — which policy parameter moves it. Falls
    back gracefully to program-level attribution when no gate flips (smooth
    phase-outs).
    """
    axis = SweepAxis(variable="employment_income", min=at, max=at + step, count=2)
    sim = make_simulation(build_situation(household, axis))
    net_income, programs = _decompose(sim)
    deltas = {slug: float(values[1] - values[0]) for slug, values in programs.items()}
    dominant = min(deltas, key=deltas.get)

    binding_rules = []
    for flip in _trace_gates(sim, household, dominant):
        param = REFORM_PARAMETERS.get(flip.pop("param_id") or "")
        binding_rules.append(
            {
                **flip,
                "editable_parameter": (
                    {
                        "id": next(
                            pid for pid, s in REFORM_PARAMETERS.items() if s is param
                        ),
                        "label": param.label,
                        "path": param.path,
                        "current_value": param.default,
                        "unit": param.unit,
                    }
                    if param
                    else None
                ),
            }
        )

    return {
        "at": at,
        "step": step,
        "net_income_delta": float(net_income[1] - net_income[0]),
        "program_deltas": deltas,
        "dominant_program": dominant,
        "binding_rules": binding_rules,
    }


@_serialized
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


@_serialized
def run_minimal_fix(household: Household, axis: SweepAxis, cliff_at: float) -> dict:
    """Search policy-space for the smallest whitelisted edit that removes a cliff.

    Traces the cliff to its binding rule, takes the rule's editable parameter,
    then walks a coarse value ladder toward the parameter's bound and bisects
    back for minimality. "Healed" means no cliff dominated by the traced
    program remains anywhere in the swept range (a cliff that merely moves
    does not count as fixed).
    """
    trace = run_trace(household, cliff_at)
    program = trace["dominant_program"]
    editables = []
    for rule in trace["binding_rules"]:
        parameter = rule["editable_parameter"]
        if parameter and parameter["id"] not in [e["id"] for e in editables]:
            editables.append(parameter)
    if not editables:
        return {
            "found": False,
            "program": program,
            "reason": (
                f"the binding rule(s) of {program} at this cliff have no "
                "whitelisted editable parameter"
            ),
            "trace": trace,
        }

    parameter = editables[0]
    spec = REFORM_PARAMETERS[parameter["id"]]
    baseline = run_sweep(household, axis)

    def evaluate(value):
        sweep = run_sweep(
            household, axis, build_reform_overrides({parameter["id"]: value})
        )
        residual = [c for c in sweep["cliffs"] if c["dominant_program"] == program]
        worst = min((c["net_drop"] for c in residual), default=0.0)
        return sweep, residual, worst

    tried = []
    if isinstance(spec.default, bool):
        sweep, residual, worst = evaluate(True)
        tried.append({"value": True, "remaining_cliffs": len(residual), "worst_drop": worst})
        chosen, chosen_sweep, healed = True, sweep, not residual
    else:
        candidates = [round(float(v), 2) for v in np.linspace(spec.default, spec.maximum, 6)[1:]]
        chosen, chosen_sweep, healed = None, None, False
        for value in candidates:
            sweep, residual, worst = evaluate(value)
            tried.append({"value": value, "remaining_cliffs": len(residual), "worst_drop": worst})
            if not residual:
                chosen, chosen_sweep, healed = value, sweep, True
                break
        if healed:
            # bisect back toward the last failing value for minimality
            lo = tried[-2]["value"] if len(tried) > 1 else float(spec.default)
            for _ in range(2):
                mid = round((lo + chosen) / 2, 2)
                if mid in (lo, chosen):
                    break
                sweep, residual, worst = evaluate(mid)
                tried.append({"value": mid, "remaining_cliffs": len(residual), "worst_drop": worst})
                if residual:
                    lo = mid
                else:
                    chosen, chosen_sweep = mid, sweep
        else:
            best = min(tried, key=lambda t: abs(t["worst_drop"]))
            chosen = best["value"]
            chosen_sweep, _, _ = evaluate(chosen)

    return {
        "found": True,
        "healed": healed,
        "program": program,
        "parameter": {
            "id": parameter["id"],
            "label": spec.label,
            "path": spec.path,
            "default": spec.default,
            "unit": spec.unit,
        },
        "minimal_value": chosen,
        "tried": tried,
        "baseline": baseline,
        "reformed": chosen_sweep,
    }
