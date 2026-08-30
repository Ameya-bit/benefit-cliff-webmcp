/**
 * The specimen, as a sentence. The household reads as one quiet line in the
 * header — "Adult, 30 · one child (3) · $50,000/yr · daycare $1,250/mo ·
 * childcare assistance ✓" — and expands into the full editable card on
 * click. Agent set_household calls rewrite the sentence live; human edits
 * happen in the expanded card (and reach the agent through the digest).
 */

import { useEffect, useRef, useState } from "react";
import { usePeiraStore } from "../state/store";
import { HouseholdCard } from "./HouseholdCard";

const fmt = (v: number) =>
  `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;

function plural(n: number, word: string): string {
  return n === 1 ? `one ${word}` : `${n} ${word}s`;
}

/** Small person glyph for the phone-width chip. */
function PersonIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="5" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2.5 14c0.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HouseholdBar() {
  const household = usePeiraStore((s) => s.household);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const earnings = household.adults.reduce((a, ad) => a + ad.employment_income, 0);
  const childcare = household.children.reduce((a, c) => a + c.yearly_childcare_expenses, 0);
  const kidAges = household.children.map((c) => c.age).join(", ");
  const isEmpty = earnings === 0 && household.children.length === 0;

  if (isEmpty) {
    return (
      <div className="household-wrap" ref={wrapRef}>
        <button
          className="household"
          aria-expanded={open}
          aria-label="Your household — fill it in to map your benefits"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="hh-full">
            <b>Your household</b>
            <span className="dot">·</span> fill it in to map your benefits
            <span className="edit">✎ start</span>
          </span>
          <span className="hh-compact" aria-hidden="true">
            <PersonIcon /> start
          </span>
        </button>
        {open && (
          <div className="household-pop">
            <HouseholdCard />
          </div>
        )}
      </div>
    );
  }

  const summary = [
    `${household.adults.length === 1 ? "Single adult" : `${household.adults.length} adults`}, ${household.adults[0].age}`,
    household.children.length > 0 ? `${plural(household.children.length, "child")} (${kidAges})` : null,
    `${fmt(earnings)}/yr`,
    childcare > 0 ? `daycare ${fmt(Math.round(childcare / 12))}/mo` : null,
    household.receiving_childcare_subsidy ? "childcare assistance" : "no childcare assistance",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="household-wrap" ref={wrapRef}>
      <button
        className="household"
        aria-expanded={open}
        aria-label={`Household: ${summary} — click to edit`}
        title="Click to edit the household"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="hh-full">
          <b>
            {household.adults.length === 1 ? "Single adult" : `${household.adults.length} adults`},{" "}
            {household.adults[0].age}
          </b>
          {household.children.length > 0 && (
            <>
              <span className="dot">·</span> {plural(household.children.length, "child")} ({kidAges})
            </>
          )}
          <span className="dot">·</span> <b>{fmt(earnings)}</b>/yr
          {childcare > 0 && (
            <>
              <span className="dot">·</span> daycare {fmt(Math.round(childcare / 12))}/mo
            </>
          )}
          <span className="dot">·</span>{" "}
          {household.receiving_childcare_subsidy ? "childcare assistance ✓" : "no childcare assistance"}
          <span className="edit">✎ edit</span>
        </span>
        <span className="hh-compact" aria-hidden="true">
          <PersonIcon /> <b>{fmt(earnings)}</b>
        </span>
      </button>
      {open && (
        <div className="household-pop">
          <HouseholdCard />
        </div>
      )}
    </div>
  );
}
