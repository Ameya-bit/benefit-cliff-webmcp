"""Household profiles and their conversion to policyengine-us situation dicts.

policyengine-us gotchas encoded here (verified Aug 2026, v1.821.4):
- Childcare inputs live on the CHILD person, not the benefit unit; setting them
  on the wrong entity raises SituationParsingError.
- State childcare activity tests read `weekly_hours_worked_before_lsr` on the
  parent and the child's care schedule (`childcare_hours_per_day`,
  `childcare_days_per_week`); with defaults of 0 the subsidy silently computes $0.
"""

from pydantic import BaseModel, Field

YEAR = "2026"

DEFAULT_WORK_HOURS_PER_WEEK = 40
DEFAULT_CARE_HOURS_PER_WEEK = 40
DEFAULT_CARE_HOURS_PER_DAY = 8
DEFAULT_CARE_DAYS_PER_WEEK = 5


class Adult(BaseModel):
    age: int = Field(ge=18, le=100)
    employment_income: float = Field(default=0, ge=0, le=2_000_000)
    weekly_work_hours: float = Field(default=DEFAULT_WORK_HOURS_PER_WEEK, ge=0, le=100)


class Child(BaseModel):
    age: int = Field(ge=0, le=17)
    yearly_childcare_expenses: float = Field(default=0, ge=0, le=100_000)


class Household(BaseModel):
    state: str = Field(default="CO", pattern=r"^[A-Z]{2}$")
    adults: list[Adult] = Field(min_length=1, max_length=2)
    children: list[Child] = Field(default_factory=list, max_length=6)


class SweepAxis(BaseModel):
    variable: str = "employment_income"
    min: float = Field(default=0, ge=0)
    max: float = Field(default=100_000, le=1_000_000)
    count: int = Field(default=101, ge=2, le=201)


def build_situation(household: Household, axis: SweepAxis | None = None) -> dict:
    """Build a situation dict with all group entities declared explicitly.

    With an axis, the swept variable replaces the first adult's own value
    (policyengine applies axes to person index 0).
    """
    people: dict[str, dict] = {}
    for i, adult in enumerate(household.adults):
        person = {
            "age": {YEAR: adult.age},
            "weekly_hours_worked_before_lsr": {YEAR: adult.weekly_work_hours},
        }
        if not (axis and axis.variable == "employment_income" and i == 0):
            person["employment_income"] = {YEAR: adult.employment_income}
        people[f"adult_{i + 1}"] = person
    for i, child in enumerate(household.children):
        people[f"child_{i + 1}"] = {
            "age": {YEAR: child.age},
            "pre_subsidy_childcare_expenses": {YEAR: child.yearly_childcare_expenses},
            "childcare_hours_per_week": {YEAR: DEFAULT_CARE_HOURS_PER_WEEK},
            "childcare_hours_per_day": {YEAR: DEFAULT_CARE_HOURS_PER_DAY},
            "childcare_days_per_week": {YEAR: DEFAULT_CARE_DAYS_PER_WEEK},
        }

    members = list(people)
    adult_names = [name for name in people if name.startswith("adult")]
    situation = {
        "people": people,
        "families": {"family": {"members": members}},
        # Two adults in one marital unit means married; diff_scenarios varies this later.
        "marital_units": {"marital_unit": {"members": adult_names}},
        "tax_units": {"tax_unit": {"members": members}},
        "spm_units": {"spm_unit": {"members": members}},
        "households": {
            "household": {
                "members": members,
                "state_name": {YEAR: household.state},
            }
        },
    }
    if axis is not None:
        situation["axes"] = [
            [
                {
                    "name": axis.variable,
                    "count": axis.count,
                    "min": axis.min,
                    "max": axis.max,
                    "period": YEAR,
                }
            ]
        ]
    return situation
