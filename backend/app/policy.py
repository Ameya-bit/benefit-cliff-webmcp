"""Whitelist of policy parameters the edit_policy probe may modify.

The agent can only touch parameters listed here, within bounds. Each entry maps
a stable id to a policyengine-us dotted parameter path plus human metadata the
frontend shows in the mechanism inspector. Never pass agent-supplied paths to
the engine directly.
"""

from pydantic import BaseModel

# Backdated well before the simulation year: some formulas read parameters at
# a prior instant (e.g. Colorado CCAP reads the Oct-1-of-previous-year value
# for Jan-Sep months), so a reform starting Jan 1 of the sim year would
# silently miss nine months of the year.
REFORM_PERIOD = "2024-01-01.2100-12-31"


class PolicyParameter(BaseModel):
    path: str
    label: str
    description: str
    unit: str
    default: float | bool
    minimum: float | None = None
    maximum: float | None = None


REFORM_PARAMETERS: dict[str, PolicyParameter] = {
    "ccap_exit_smi_rate": PolicyParameter(
        path="gov.states.co.ccap.re_determination.smi_rate",
        label="CCAP exit income limit",
        description=(
            "Colorado CCAP re-determination limit as a fraction of state "
            "median income; crossing it ends the childcare subsidy at once."
        ),
        unit="fraction of state median income",
        default=0.85,
        minimum=0.5,
        maximum=2.0,
    ),
    "ccap_entry_smi_rate": PolicyParameter(
        path="gov.states.co.ccap.entry.smi_rate",
        label="CCAP entry income limit",
        description="Colorado CCAP application income limit as a fraction of state median income.",
        unit="fraction of state median income",
        default=0.85,
        minimum=0.5,
        maximum=2.0,
    ),
    "snap_gross_income_limit": PolicyParameter(
        path="gov.usda.snap.income.limit.gross",
        label="SNAP gross income limit",
        description="Federal SNAP gross income test as a multiple of the poverty guideline.",
        unit="multiple of federal poverty guideline",
        default=1.3,
        minimum=1.0,
        maximum=3.0,
    ),
    "ctc_fully_refundable": PolicyParameter(
        path="gov.irs.credits.ctc.refundable.fully_refundable",
        label="Make CTC fully refundable",
        description="Remove the earnings-based limit on the refundable Child Tax Credit.",
        unit="boolean",
        default=False,
    ),
}


def build_reform_overrides(reforms: dict[str, float | bool]) -> dict:
    """Validate whitelisted parameter values and return a Reform-ready dict."""
    overrides = {}
    for param_id, value in reforms.items():
        spec = REFORM_PARAMETERS.get(param_id)
        if spec is None:
            raise ValueError(f"unknown policy parameter: {param_id!r}")
        if isinstance(spec.default, bool):
            if not isinstance(value, bool):
                raise ValueError(f"{param_id} expects a boolean, got {value!r}")
        else:
            value = float(value)
            if spec.minimum is not None and value < spec.minimum:
                raise ValueError(f"{param_id} below minimum {spec.minimum}")
            if spec.maximum is not None and value > spec.maximum:
                raise ValueError(f"{param_id} above maximum {spec.maximum}")
        overrides[spec.path] = {REFORM_PERIOD: value}
    return overrides
