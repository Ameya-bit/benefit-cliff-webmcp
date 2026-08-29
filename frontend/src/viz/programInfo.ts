/**
 * Plain-language program explainers for the right panel. One sentence of
 * what the program does for a family, the official Colorado name, and a
 * link to the real program page — the agent narrates strategy in chat; this
 * panel grounds each stream in something a person can go read.
 */

export interface ProgramInfo {
  slug: string;
  official: string;
  blurb: string;
  linkLabel: string;
  linkHref: string;
}

export const PROGRAM_INFO: Record<string, ProgramInfo> = {
  medicaid: {
    slug: "medicaid",
    official: "Health First Colorado (Medicaid)",
    blurb:
      "Free health coverage for lower-income adults and children. Its value here is what equivalent coverage would cost you.",
    linkLabel: "healthfirstcolorado.com",
    linkHref: "https://www.healthfirstcolorado.com/",
  },
  chip: {
    slug: "chip",
    official: "Child Health Plan Plus (CHP+)",
    blurb:
      "Low-cost health coverage for kids and pregnant people when income is a bit above Medicaid’s limit.",
    linkLabel: "hcpf.colorado.gov",
    linkHref: "https://hcpf.colorado.gov/child-health-plan-plus",
  },
  aca: {
    slug: "aca",
    official: "ACA premium tax credit",
    blurb:
      "A discount on marketplace health-insurance premiums. It ends abruptly at 400% of the poverty line.",
    linkLabel: "connectforhealthco.com",
    linkHref: "https://connectforhealthco.com/",
  },
  snap: {
    slug: "snap",
    official: "SNAP food assistance",
    blurb:
      "Monthly grocery money on an EBT card. In Colorado its income test is loosened by TANF’s rules (that’s a hidden dependency).",
    linkLabel: "cdhs.colorado.gov/snap",
    linkHref: "https://cdhs.colorado.gov/snap",
  },
  tanf: {
    slug: "tanf",
    official: "Colorado Works (TANF)",
    blurb:
      "Monthly cash help for very low-income families with children. Ends at low earnings, but its rules keep helping SNAP.",
    linkLabel: "cdhs.colorado.gov/colorado-works",
    linkHref: "https://cdhs.colorado.gov/colorado-works",
  },
  childcare: {
    slug: "childcare",
    official: "Colorado Child Care Assistance Program (CCCAP)",
    blurb:
      "Pays most of your childcare bill while you work or study. You pay a parent fee that grows gently with income — until the exit limit, where the help ends all at once.",
    linkLabel: "cdhs.colorado.gov/cccap",
    linkHref: "https://cdhs.colorado.gov/cccap",
  },
  eitc: {
    slug: "eitc",
    official: "Earned Income Tax Credit (federal + Colorado)",
    blurb:
      "A tax refund that grows as you earn at low incomes, then phases out gradually — a ramp, not a cliff.",
    linkLabel: "irs.gov/eitc",
    linkHref:
      "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit-eitc",
  },
  ctc: {
    slug: "ctc",
    official: "Child Tax Credit (federal + Colorado)",
    blurb: "A tax credit for each child, phasing out only at high incomes.",
    linkLabel: "irs.gov/child-tax-credit",
    linkHref:
      "https://www.irs.gov/credits-deductions/individuals/child-tax-credit",
  },
};
