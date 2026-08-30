"""Step 2 verify-gate: every endpoint works against the reference household.

Covers the two demo-critical behaviors beyond plumbing:
- ablating TANF changes SNAP (broad-based categorical eligibility dependency)
- raising the CCAP exit limit extends the childcare subsidy past the cliff
"""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app

HOUSEHOLD = {
    "state": "CO",
    "adults": [{"age": 30, "employment_income": 50_000}],
    "children": [{"age": 3, "yearly_childcare_expenses": 15_000}],
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as client:
        yield client


def post(client, path, body):
    response = client.post(path, json=body)
    payload = response.json()
    assert response.status_code == 200, payload
    assert payload["success"] is True
    return payload["data"]


def test_calculate(client):
    data = post(client, "/calculate", {"household": HOUSEHOLD})
    assert data["net_income"] > 0
    assert data["programs"]["childcare"] == pytest.approx(10_813, abs=50)


def test_sweep_has_reference_cliff(client):
    data = post(client, "/sweep", {"household": HOUSEHOLD})
    cliff = [c for c in data["cliffs"] if c["from_x"] == 50_000]
    assert cliff and cliff[0]["dominant_program"] == "childcare"


def test_diff(client):
    household_b = {**HOUSEHOLD, "children": [{"age": 3}]}  # no childcare costs
    data = post(
        client,
        "/diff",
        {"household_a": HOUSEHOLD, "household_b": household_b},
    )
    assert any(abs(d) > 1_000 for d in data["net_income_delta"])


def test_ablate_tanf_reveals_snap_dependency(client):
    data = post(
        client,
        "/ablate",
        {"household": HOUSEHOLD, "program": "tanf"},
    )
    assert "snap" in data["interactions"], (
        "ablating TANF should change SNAP via broad-based categorical "
        f"eligibility; interactions: {data['interactions']}"
    )


def test_trace_at_ccap_cliff(client):
    data = post(client, "/trace", {"household": HOUSEHOLD, "at": 50_000})
    assert data["dominant_program"] == "childcare"
    rules = [r["rule"] for r in data["binding_rules"]]
    assert any("entry income test" in r for r in rules)


def test_trace_names_editable_parameter(client):
    enrolled = {**HOUSEHOLD, "receiving_childcare_subsidy": True}
    data = post(client, "/trace", {"household": enrolled, "at": 80_000})
    assert data["dominant_program"] == "childcare"
    editable = [
        r["editable_parameter"]
        for r in data["binding_rules"]
        if r["editable_parameter"]
    ]
    assert editable and editable[0]["id"] == "ccap_exit_smi_rate"


def test_trace_medicaid_names_person(client):
    data = post(client, "/trace", {"household": HOUSEHOLD, "at": 29_000})
    assert data["dominant_program"] == "medicaid"
    assert any(r["person"] == "adult_1" for r in data["binding_rules"])


def test_reform_extends_ccap_past_exit_cliff(client):
    """An enrolled family faces the exit (re-determination) test at 85% SMI
    (~$80k); raising that limit extends the subsidy past the baseline cutoff.

    Note: a residual discontinuity at $80k remains because a second rule also
    references 85% SMI — Step 7's find_minimal_fix is built around exactly
    this kind of coupled-parameter discovery.
    """
    enrolled = {**HOUSEHOLD, "receiving_childcare_subsidy": True}
    data = post(
        client,
        "/reform",
        {"household": enrolled, "reforms": {"ccap_exit_smi_rate": 1.5}},
    )
    baseline_at_85k = data["baseline"]["programs"]["childcare"][85]
    reformed_at_85k = data["reformed"]["programs"]["childcare"][85]
    assert baseline_at_85k == 0
    assert reformed_at_85k > 1_000


def test_minimal_fix_heals_ccap_cliff(client):
    """The finale: the smallest whitelisted edit that removes the CCAP cliff.
    Verified manually: exit=0.95 leaves cliffs, exit=1.1 removes all childcare
    cliffs — so the search should land just above 1.0."""
    enrolled = {**HOUSEHOLD, "receiving_childcare_subsidy": True}
    data = post(
        client,
        "/minimal_fix",
        {"household": enrolled, "cliff_at": 80_000},
    )
    assert data["found"] and data["healed"]
    assert data["parameter"]["id"] == "ccap_exit_smi_rate"
    assert 0.95 < data["minimal_value"] <= 1.2
    childcare_cliffs = [
        c for c in data["reformed"]["cliffs"] if c["dominant_program"] == "childcare"
    ]
    assert childcare_cliffs == []


def test_reform_rejects_unknown_parameter(client):
    response = client.post(
        "/reform",
        json={"household": HOUSEHOLD, "reforms": {"gov.evil.path": 1}},
    )
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_sweep2d_varies_along_both_axes(client):
    data = post(
        client,
        "/sweep2d",
        {
            "household": HOUSEHOLD,
            "axis_x": {"variable": "employment_income", "min": 0, "max": 80_000, "count": 9},
            "axis_y": {
                "variable": "pre_subsidy_childcare_expenses",
                "min": 0,
                "max": 30_000,
                "count": 5,
            },
        },
    )
    matrix = np.array(data["net_income"])
    assert matrix.shape == (5, 9)
    assert np.ptp(matrix, axis=0).max() > 1_000  # varies with childcare cost
    assert np.ptp(matrix, axis=1).max() > 10_000  # varies with income


def test_rate_limiter_blocks_burst_and_recovers():
    """/reform and /minimal_fix carry a sliding-window lid (expensive engine
    rebuilds); the window logic is tested directly so no reform builds run."""
    from app.main import _sliding_window_allows

    key = ("unit-test-client", "/minimal_fix")
    # Arrange/Act: three calls inside the window are allowed…
    assert all(_sliding_window_allows(key, 3, 120.0, now=t) for t in (0.0, 1.0, 2.0))
    # …the fourth in the same window is blocked…
    assert not _sliding_window_allows(key, 3, 120.0, now=3.0)
    # …and once the window slides past the burst, calls flow again.
    assert _sliding_window_allows(key, 3, 120.0, now=125.0)
