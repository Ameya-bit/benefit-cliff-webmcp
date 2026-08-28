"""Verify-gate for Step 1: the engine reproduces Colorado's reference cliffs.

Reference household: single parent (30), one child (3), $15k/yr childcare.
Expected cliffs were verified against policyengine-us 1.821.4 on Aug 28, 2026,
cross-checked with PolicyEngine CliffWatch's program set. If these change after
a dependency bump, re-verify against CliffWatch before trusting the new values.
"""

import pytest

from app.engine import run_sweep
from app.situations import Adult, Child, Household, SweepAxis

REFERENCE_HOUSEHOLD = Household(
    state="CO",
    adults=[Adult(age=30)],
    children=[Child(age=3, yearly_childcare_expenses=15_000)],
)
AXIS = SweepAxis(variable="employment_income", min=0, max=100_000, count=101)

# (from_x, expected net drop, dominant program), tolerance $50.
# Magnitudes assume the full care schedule (8h/day x 5d/wk) that
# build_situation always sets; CCAP parent fees scale with income, so the
# childcare layer at $50k is ~$10.8k, not the $15k cap.
EXPECTED_CLIFFS = [
    (5_000, -2_319, "tanf"),
    (29_000, -8_492, "medicaid"),
    (31_000, -6_539, "medicaid"),
    (50_000, -10_604, "childcare"),
]


@pytest.fixture(scope="module")
def sweep():
    return run_sweep(REFERENCE_HOUSEHOLD, AXIS)


def test_sweep_shape(sweep):
    assert len(sweep["x"]) == 101
    assert len(sweep["net_income"]) == 101
    assert set(sweep["programs"]) == {
        "snap", "tanf", "medicaid", "chip", "childcare", "eitc", "ctc", "aca",
    }


@pytest.mark.parametrize("from_x,expected_drop,dominant", EXPECTED_CLIFFS)
def test_reference_cliffs(sweep, from_x, expected_drop, dominant):
    match = [c for c in sweep["cliffs"] if c["from_x"] == from_x]
    assert match, f"no cliff detected at ${from_x:,}"
    cliff = match[0]
    assert cliff["net_drop"] == pytest.approx(expected_drop, abs=50)
    assert cliff["dominant_program"] == dominant


def test_childcare_subsidy_is_modeled(sweep):
    """Guards against the NY/CA failure mode: a childcare model that pays $0."""
    assert max(sweep["programs"]["childcare"]) > 10_000
