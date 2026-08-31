"""Boot-time answer prewarm for the preset scenarios.

Runs in a daemon thread after startup and fills the engine's answer cache
with everything a visitor (or judge) reaches from the scenario library:
each preset's opening sweep and cliff traces, every program ablation, and
the flagship minimal-fix finale. Grouped so each 1.2GB tax-benefit system
is built once and reused across presets. Every step is best-effort — a
failure is logged and skipped, never fatal.

PRESET_HOUSEHOLDS mirrors frontend/src/presets.ts (the source of truth);
keep the two in sync by hand.
"""

import logging
import time

from . import engine
from .programs import ABLATION_VARIABLES
from .situations import Adult, Child, Household, SweepAxis

logger = logging.getLogger("peira.prewarm")

PRESET_HOUSEHOLDS: list[Household] = [
    # Weighing a raise (the flagship demo household)
    Household(
        adults=[Adult(age=30, employment_income=50_000, weekly_work_hours=40)],
        children=[Child(age=3, yearly_childcare_expenses=15_000)],
        receiving_childcare_subsidy=True,
    ),
    # More hours?
    Household(
        adults=[Adult(age=28, employment_income=38_000, weekly_work_hours=32)],
        children=[Child(age=4, yearly_childcare_expenses=12_000)],
        receiving_childcare_subsidy=True,
    ),
    # Marriage penalty?
    Household(
        adults=[Adult(age=32, employment_income=35_000, weekly_work_hours=40)],
        children=[Child(age=2, yearly_childcare_expenses=14_000)],
        receiving_childcare_subsidy=True,
    ),
    # New baby on the way
    Household(
        adults=[Adult(age=31, employment_income=45_000, weekly_work_hours=40)],
        children=[Child(age=4, yearly_childcare_expenses=13_000)],
        receiving_childcare_subsidy=True,
    ),
    # Kindergarten next year
    Household(
        adults=[Adult(age=34, employment_income=42_000, weekly_work_hours=40)],
        children=[Child(age=5, yearly_childcare_expenses=15_000)],
        receiving_childcare_subsidy=True,
    ),
    # $12k side gig
    Household(
        adults=[Adult(age=27, employment_income=40_000, weekly_work_hours=40)],
        children=[Child(age=3, yearly_childcare_expenses=10_000)],
        receiving_childcare_subsidy=True,
    ),
]

FLAGSHIP = PRESET_HOUSEHOLDS[0]
FLAGSHIP_CLIFF_AT = 80_000  # the healable CCAP exit cliff in the demo arc


def _step(label: str, fn) -> None:
    started = time.time()
    try:
        fn()
        logger.info("prewarmed %s (%.1fs)", label, time.time() - started)
    except Exception:
        logger.exception("prewarm step failed (skipped): %s", label)


def run() -> None:
    """Fill the answer cache, cheapest wins first. Live requests interleave
    freely: each step is one engine-lock hold, and anything a visitor asks
    for that we already warmed is served from cache without the lock."""
    axis = SweepAxis()
    overall = time.time()

    # 1. Opening sweeps + cliff traces: all on the baseline system, no swaps.
    for i, household in enumerate(PRESET_HOUSEHOLDS):
        _step(f"sweep preset {i}", lambda h=household: engine.run_sweep(h, axis))
    for i, household in enumerate(PRESET_HOUSEHOLDS):

        def trace_cliffs(h=household):
            for cliff in engine.run_sweep(h, axis)["cliffs"]:
                engine.run_trace(h, cliff["from_x"])

        _step(f"traces preset {i}", trace_cliffs)

    # 2. Ablations, grouped by program: one system build serves all presets.
    for program in ABLATION_VARIABLES:
        for i, household in enumerate(PRESET_HOUSEHOLDS):
            _step(
                f"ablate {program} preset {i}",
                lambda h=household, p=program: engine.run_ablation(h, axis, p),
            )

    # 3. The finale: flagship minimal fix (also caches its candidate
    # reform sweeps, so a follow-up edit_policy of the chosen value is warm).
    _step(
        "minimal_fix flagship",
        lambda: engine.run_minimal_fix(FLAGSHIP, axis, FLAGSHIP_CLIFF_AT),
    )

    # 4. Leave the baseline system resident for the first novel household.
    _step("re-seat baseline", lambda: engine.run_calculate(FLAGSHIP))

    logger.info("prewarm complete in %.0fs", time.time() - overall)
