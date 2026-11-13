// Shapes of the rows the jobs module reads with run-time select lists.

export type AssigneeRow = {
  status: string;
  employees: { first_name: string; last_name: string; colour: string } | null;
  subcontractors: { company_name: string } | null;
};

export type JobCardRow = {
  id: string;
  reference: string;
  title: string;
  status: string;
  priority: string;
  client_reference: string | null;
  reported_at: string;
  target_completion_at: string | null;
  updated_at: string;
  trade: string;
  properties: { address_line1: string; town: string; postcode: string } | null;
  organisations: { name: string } | null;
  job_assignments: AssigneeRow[];
};

export const CARD_SELECT =
  "id, reference, title, status, priority, client_reference, reported_at, target_completion_at, updated_at, trade, properties(address_line1, town, postcode), organisations(name), job_assignments(status, employees(first_name, last_name, colour), subcontractors(company_name))";

/** Serializable card for the client-side board. */
export type BoardCard = {
  id: string;
  reference: string;
  title: string;
  status: string;
  priority: string;
  property: string;
  client: string;
  target: string | null;
  targetLabel: string | null;
  targetState: "overdue" | "soon" | "ok" | null;
  assignees: { initials: string; name: string; colour: string }[];
};

export type BoardColumn = {
  key: string;
  label: string;
  colour: string;
  isOpen: boolean;
  total: number;
  cards: BoardCard[];
};

/** A move the current user may attempt from a status (locked = needs a permission they lack). */
export type BoardMove = { to: string; label: string; locked: string | null };

export type Transition = { from_key: string; to_key: string; required_permission: string | null };

export type Option = { value: string; label: string };

export type PropertyOption = { id: string; reference: string; address: string; postcode: string; town: string };

export type ContractOption = {
  id: string;
  label: string;
  status: string;
  slas: { priority: string; attend_hours: number | null; complete_hours: number | null }[];
};
