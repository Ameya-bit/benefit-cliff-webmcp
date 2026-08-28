"""Curated eligibility-gate maps: the rule-level layer of the trace probe.

For each program, the boolean variables that act as its income gates in
policyengine-us, with human-readable rule names and — where the rule's
threshold is in the editable-policy whitelist — a pointer to the parameter
that moves it. This is what turns "childcare collapsed" into "the CCAP
re-determination income test flipped, and here is the dial that moves it."

Colorado-scoped by design; add per-state maps when more states ship.
"""

from pydantic import BaseModel


class GateSpec(BaseModel):
    variable: str
    level: str  # spm_unit | tax_unit | person
    rule: str
    param_id: str | None = None
    # "bool": a test that flips. "count": months-per-year eligibility — CCAP
    # applies its income test monthly, so a household can lose 9 of 12 months
    # while the year-level boolean still reads eligible.
    kind: str = "bool"


GATE_MAPS: dict[str, list[GateSpec]] = {
    "childcare": [
        GateSpec(
            variable="co_ccap_eligible",
            level="spm_unit",
            rule="CCAP months of eligibility (re-determination income test, applied monthly against 85% of state median income)",
            param_id="ccap_exit_smi_rate",
            kind="count",
        ),
        GateSpec(
            variable="co_ccap_re_determination_income_eligible",
            level="spm_unit",
            rule="CCAP re-determination income test (enrolled families; 85% of state median income)",
            param_id="ccap_exit_smi_rate",
        ),
        GateSpec(
            variable="co_ccap_entry_income_eligible",
            level="spm_unit",
            rule="CCAP entry income test (new applicants)",
        ),
        GateSpec(
            variable="co_ccap_smi_eligible",
            level="spm_unit",
            rule="CCAP state-median-income entry limit",
            param_id="ccap_entry_smi_rate",
        ),
        GateSpec(
            variable="co_ccap_fpg_eligible",
            level="spm_unit",
            rule="CCAP county poverty-guideline entry limit",
        ),
    ],
    "snap": [
        GateSpec(
            variable="meets_snap_gross_income_test",
            level="spm_unit",
            rule="SNAP gross income test",
            param_id="snap_gross_income_limit",
        ),
        GateSpec(
            variable="meets_snap_net_income_test",
            level="spm_unit",
            rule="SNAP net income test",
        ),
        GateSpec(
            variable="meets_snap_categorical_eligibility",
            level="spm_unit",
            rule="SNAP categorical eligibility",
        ),
        GateSpec(
            variable="is_tanf_non_cash_eligible",
            level="spm_unit",
            rule="TANF non-cash benefit (carries SNAP broad-based categorical eligibility)",
        ),
    ],
    "medicaid": [
        GateSpec(
            variable="is_medicaid_eligible",
            level="person",
            rule="Medicaid income eligibility (MAGI, per person)",
        ),
    ],
    "chip": [
        GateSpec(
            variable="is_chip_eligible",
            level="person",
            rule="CHIP income eligibility (per child)",
        ),
    ],
    "aca": [
        GateSpec(
            variable="is_aca_ptc_eligible",
            level="person",
            rule="ACA premium tax credit eligibility (400% FPL cliff)",
        ),
    ],
    "tanf": [
        GateSpec(
            variable="co_tanf_income_eligible",
            level="spm_unit",
            rule="Colorado TANF income test",
        ),
        GateSpec(
            variable="co_tanf_eligible",
            level="spm_unit",
            rule="Colorado TANF eligibility",
        ),
    ],
    "eitc": [
        GateSpec(
            variable="eitc_eligible",
            level="tax_unit",
            rule="EITC eligibility",
        ),
    ],
    "ctc": [],
}
