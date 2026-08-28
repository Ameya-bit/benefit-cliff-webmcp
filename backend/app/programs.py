"""Program registry for the supported state and cliff detection.

Each program layer maps to one or more policyengine-us variables whose
household-mapped values are summed. Layers are what the frontend stacks;
federal and state versions of the same credit share a layer.
"""

import numpy as np

# Colorado registry (the launch state). Slug -> policyengine-us variables.
PROGRAMS: dict[str, tuple[str, ...]] = {
    "snap": ("snap",),
    "tanf": ("tanf",),
    "medicaid": ("medicaid",),
    "chip": ("per_capita_chip",),
    "childcare": ("co_child_care_subsidies",),
    "eitc": ("eitc", "co_eitc"),
    "ctc": ("ctc", "co_ctc"),
    "aca": ("aca_ptc",),
}

# Net income drop (in $) per axis step that counts as a cliff.
CLIFF_THRESHOLD = 500


def detect_cliffs(
    x: np.ndarray, net_income: np.ndarray, programs: dict[str, np.ndarray]
) -> list[dict]:
    """Find points where net income drops by more than CLIFF_THRESHOLD per step.

    Returns one record per cliff with the per-program deltas so every cliff is
    attributed to the layer that collapsed.
    """
    steps = np.diff(net_income)
    cliffs = []
    for i in np.where(steps < -CLIFF_THRESHOLD)[0]:
        deltas = {slug: float(values[i + 1] - values[i]) for slug, values in programs.items()}
        dominant = min(deltas, key=deltas.get)
        cliffs.append(
            {
                "from_x": float(x[i]),
                "to_x": float(x[i + 1]),
                "net_drop": float(steps[i]),
                "dominant_program": dominant,
                "program_deltas": deltas,
            }
        )
    return cliffs
