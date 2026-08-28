/**
 * The specimen card, editable by hand. set_household's tool description
 * promises the agent "the human can correct it directly on the household
 * card" — this component keeps that promise. Edits log to the probe log as
 * human actions (so the agent's next reply digests them) and re-run the
 * active sweep so both parties look at fresh curves.
 */

import { useEffect, useState } from "react";
import { runSweep } from "../probes/runProbes";
import { usePeiraStore } from "../state/store";
import type { Household } from "../types";

const MAX_ADULTS = 2;
const MAX_CHILDREN = 6;

const NEW_ADULT = { age: 30, employment_income: 0, weekly_work_hours: 40 };
const NEW_CHILD = { age: 3, yearly_childcare_expenses: 0 };

function describeEdit(prev: Household, next: Household): string {
  const parts: string[] = [];
  if (prev.adults.length !== next.adults.length) {
    parts.push(`${next.adults.length} adult(s)`);
  }
  if (prev.children.length !== next.children.length) {
    parts.push(`${next.children.length} child(ren)`);
  }
  next.adults.forEach((adult, i) => {
    const before = prev.adults[i];
    if (!before) return;
    if (before.employment_income !== adult.employment_income) {
      parts.push(`adult ${i + 1} income → $${adult.employment_income.toLocaleString()}`);
    }
    if (before.weekly_work_hours !== adult.weekly_work_hours) {
      parts.push(`adult ${i + 1} hours → ${adult.weekly_work_hours}/wk`);
    }
    if (before.age !== adult.age) parts.push(`adult ${i + 1} age → ${adult.age}`);
  });
  next.children.forEach((child, i) => {
    const before = prev.children[i];
    if (!before) return;
    if (before.yearly_childcare_expenses !== child.yearly_childcare_expenses) {
      parts.push(`child ${i + 1} childcare → $${child.yearly_childcare_expenses.toLocaleString()}`);
    }
    if (before.age !== child.age) parts.push(`child ${i + 1} age → ${child.age}`);
  });
  if (prev.receiving_childcare_subsidy !== next.receiving_childcare_subsidy) {
    parts.push(
      next.receiving_childcare_subsidy ? "now on childcare subsidy" : "off childcare subsidy",
    );
  }
  return parts.length > 0 ? `hand-edited: ${parts.join(", ")}` : "hand-edited the card";
}

export function HouseholdCard() {
  const household = usePeiraStore((s) => s.household);
  const isProbing = usePeiraStore((s) => s.isProbing);
  const [draft, setDraft] = useState<Household>(household);

  // Agent edits (set_household) reset the draft to the new ground truth.
  useEffect(() => setDraft(household), [household]);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(household);

  const updateAdult = (i: number, patch: Partial<Household["adults"][number]>) =>
    setDraft({
      ...draft,
      adults: draft.adults.map((a, j) => (j === i ? { ...a, ...patch } : a)),
    });
  const updateChild = (i: number, patch: Partial<Household["children"][number]>) =>
    setDraft({
      ...draft,
      children: draft.children.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    });

  const apply = () => {
    const store = usePeiraStore.getState();
    const summary = describeEdit(store.household, draft);
    store.setHousehold(draft);
    store.logProbe({ source: "human", tool: "set_household", summary });
    const axis = store.sweep?.axis;
    if (axis) void runSweep({ min: axis.min, max: axis.max }, "human").catch(() => {});
  };

  const num = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };

  return (
    <div className="household-card">
      {draft.adults.map((adult, i) => (
        <div className="member-row" key={`a${i}`}>
          <span className="member-label">Adult {i + 1}</span>
          <label>
            age
            <input
              type="number"
              value={adult.age}
              onChange={(e) => updateAdult(i, { age: num(e.target.value, adult.age) })}
            />
          </label>
          <label>
            $/yr
            <input
              type="number"
              step={1000}
              value={adult.employment_income}
              onChange={(e) =>
                updateAdult(i, { employment_income: num(e.target.value, adult.employment_income) })
              }
            />
          </label>
          <label>
            hrs/wk
            <input
              type="number"
              value={adult.weekly_work_hours}
              onChange={(e) =>
                updateAdult(i, { weekly_work_hours: num(e.target.value, adult.weekly_work_hours) })
              }
            />
          </label>
          {draft.adults.length > 1 && (
            <button
              className="member-remove"
              title="remove adult"
              onClick={() =>
                setDraft({ ...draft, adults: draft.adults.filter((_, j) => j !== i) })
              }
            >
              ×
            </button>
          )}
        </div>
      ))}
      {draft.children.map((child, i) => (
        <div className="member-row" key={`c${i}`}>
          <span className="member-label">Child {i + 1}</span>
          <label>
            age
            <input
              type="number"
              value={child.age}
              onChange={(e) => updateChild(i, { age: num(e.target.value, child.age) })}
            />
          </label>
          <label>
            childcare $/yr
            <input
              type="number"
              step={1000}
              value={child.yearly_childcare_expenses}
              onChange={(e) =>
                updateChild(i, {
                  yearly_childcare_expenses: num(e.target.value, child.yearly_childcare_expenses),
                })
              }
            />
          </label>
          <button
            className="member-remove"
            title="remove child"
            onClick={() =>
              setDraft({ ...draft, children: draft.children.filter((_, j) => j !== i) })
            }
          >
            ×
          </button>
        </div>
      ))}
      <div className="member-add-row">
        {draft.adults.length < MAX_ADULTS && (
          <button
            className="probe-button inline"
            onClick={() => setDraft({ ...draft, adults: [...draft.adults, { ...NEW_ADULT }] })}
          >
            + adult
          </button>
        )}
        {draft.children.length < MAX_CHILDREN && (
          <button
            className="probe-button inline"
            onClick={() => setDraft({ ...draft, children: [...draft.children, { ...NEW_CHILD }] })}
          >
            + child
          </button>
        )}
      </div>
      <label className="subsidy-row">
        <input
          type="checkbox"
          checked={draft.receiving_childcare_subsidy}
          onChange={(e) =>
            setDraft({ ...draft, receiving_childcare_subsidy: e.target.checked })
          }
        />
        receiving childcare subsidy
      </label>
      <div className="member-add-row">
        <button className="probe-button" disabled={!isDirty || isProbing} onClick={apply}>
          {isDirty ? "Apply changes" : "Card is current"}
        </button>
        {isDirty && (
          <button className="probe-button inline" onClick={() => setDraft(household)}>
            discard
          </button>
        )}
      </div>
    </div>
  );
}
