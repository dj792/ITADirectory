import type { DataType, SearchMode, Visibility } from "./types";

/**
 * PLAIN ENGLISH FOR EVERY CONFIG VALUE. Client-safe; imports nothing.
 *
 * The config tabs store terse keys — `facet`, `multiselect`, `members` — which
 * are right for a spreadsheet cell and wrong on a screen ITA reviews. "Facet"
 * in particular is our word: it means something precise to us (this field gets
 * its own dropdown in the search panel) and nothing at all to an association
 * director looking at their membership form.
 *
 * So the STORED VALUE and the DISPLAYED WORD are separated here, once. The
 * sheet keeps its keys — short, typo-resistant, stable to write rules against —
 * and every surface a customer sees goes through this module. The admin screen
 * will reuse it for its dropdowns, so ITA picks "Filter in search" and the
 * sheet records `facet`, and the two can never drift into two vocabularies.
 *
 * `description` is the one-line definition: a short label alone still leaves
 * "Members only — members of what, seen where?" unanswered, and a legend that
 * has to be explained in a meeting is a legend that failed.
 */

export type Explained = { label: string; description: string };

export const SEARCH_MODE_LABELS: Record<SearchMode, Explained> = {
  none: {
    label: "Not searchable",
    description: "Shown on the member's page, but searching won't look at it.",
  },
  text: {
    label: "Keyword searchable",
    description:
      "The words a member types here are matched by the main search box, " +
      "alongside their name, company and email.",
  },
  facet: {
    label: "Filter in search",
    description:
      "Gets its own drop-down in the search panel, so the directory can be " +
      "narrowed to a chosen answer — the way Membership level works today.",
  },
};

export const VISIBILITY_LABELS: Record<Visibility, Explained> = {
  public: {
    label: "Public",
    description: "Visible to anyone who can open the directory.",
  },
  members: {
    label: "Members only",
    description: "Visible to signed-in ITA members, but not on public listings.",
  },
  staff: {
    label: "ITA staff only",
    description:
      "Collected from the member but shown only to ITA staff. Never displayed " +
      "to other members, and never searchable — a field that can be filtered " +
      "on reveals its answer even when it isn't on screen.",
  },
};

export const DATA_TYPE_LABELS: Record<DataType, Explained> = {
  text: { label: "Short text", description: "A single line of text." },
  textarea: { label: "Long text", description: "A paragraph or more." },
  number: { label: "Number", description: "A whole number." },
  year: { label: "Year", description: "A four-digit year." },
  boolean: { label: "Yes / No", description: "One of two answers." },
  select: { label: "Choose one", description: "One answer from a set list." },
  multiselect: {
    label: "Choose several",
    description: "Any number of answers from a set list — a checklist.",
  },
  file: { label: "File upload", description: "An image or document." },
  repeat: {
    label: "Several entries",
    description: "The same question answered more than once, up to a limit.",
  },
};

/** The applies-to rule, in the customer's terms rather than the column's. */
export const APPLIES_TO_LABELS: Record<"org" | "individual" | "both", Explained> = {
  org: { label: "Companies only", description: "Not asked of individual members." },
  individual: { label: "Individuals only", description: "Not asked of company records." },
  both: { label: "Everyone", description: "Asked of companies and individuals alike." },
};
