"""The answer cache: identical probes are served from memory, distinct
probes are not conflated, and the prewarm presets stay valid."""

from app import engine, prewarm
from app.situations import Adult, Child, Household, SweepAxis

HOUSEHOLD = Household(
    adults=[Adult(age=30, employment_income=50_000)],
    children=[Child(age=3, yearly_childcare_expenses=15_000)],
)


def test_identical_sweeps_share_one_cached_answer():
    # Arrange: two equal-but-distinct request objects, as HTTP parsing yields
    first_args = (HOUSEHOLD, SweepAxis())
    second_args = (HOUSEHOLD.model_copy(deep=True), SweepAxis())

    # Act
    first = engine.run_sweep(*first_args)
    second = engine.run_sweep(*second_args)

    # Assert: the exact same object came back — no recomputation
    assert first is second


def test_distinct_households_get_distinct_answers():
    richer = HOUSEHOLD.model_copy(deep=True)
    richer.adults[0].employment_income = 60_000

    base = engine.run_sweep(HOUSEHOLD, SweepAxis())
    other = engine.run_sweep(richer, SweepAxis())

    assert base is not other


def test_cache_stays_bounded(monkeypatch):
    monkeypatch.setattr(engine, "_RESULT_CACHE_MAX", 2)

    engine.run_calculate(HOUSEHOLD)
    engine.run_sweep(HOUSEHOLD, SweepAxis())
    engine.run_sweep(HOUSEHOLD, SweepAxis(max=90_000))

    assert len(engine._RESULT_CACHE) <= 2


def test_ablation_leaves_the_resident_system_pristine():
    # __wrapped__ bypasses the answer cache: recompute the baseline for real
    before = engine.run_sweep.__wrapped__(HOUSEHOLD, SweepAxis())
    engine.run_ablation(HOUSEHOLD, SweepAxis(), "tanf")
    after = engine.run_sweep.__wrapped__(HOUSEHOLD, SweepAxis())
    assert after["net_income"] == before["net_income"]


def test_reform_leaves_the_resident_system_pristine():
    from app.policy import build_reform_overrides

    before = engine.run_sweep.__wrapped__(HOUSEHOLD, SweepAxis())
    engine.run_sweep.__wrapped__(
        HOUSEHOLD, SweepAxis(), build_reform_overrides({"ccap_exit_smi_rate": 1.5})
    )
    after = engine.run_sweep.__wrapped__(HOUSEHOLD, SweepAxis())
    assert after["net_income"] == before["net_income"]


def test_prewarm_presets_match_frontend_shape():
    # frontend/src/presets.ts is the source of truth; this guards the mirror
    assert len(prewarm.PRESET_HOUSEHOLDS) == 6
    assert all(h.receiving_childcare_subsidy for h in prewarm.PRESET_HOUSEHOLDS)
    assert prewarm.FLAGSHIP.adults[0].employment_income == 50_000
