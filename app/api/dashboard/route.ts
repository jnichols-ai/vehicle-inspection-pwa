import { NextResponse } from "next/server";
import { dateToWeekKey, getISOWeek, weekKey } from "@/lib/weeks";

export const dynamic = "force-dynamic";

const MONDAY_API_URL = "https://api.monday.com/v2";

// Employee Directory — roster (branch/office, manager, active status, job position)
const EMPLOYEE_BOARD_ID = "18003250999";
const EMPLOYEE_COLUMN_IDS = ["status", "color_mkvyytff", "people", "color_mkw1131k"];

// Only Technicians actually drive service trucks and are required to submit
// vehicle inspections. "Field Rep" in this org's data is the Sales-side home
// inspection / sales role (matches the spreadsheet's "Inspectors" list), not
// a truck driver, so it — along with all manager/admin/sales roles — is
// excluded from compliance reporting.
const INSPECTION_REQUIRED_JOB_POSITIONS = new Set(["Technician"]);

// Truck Inspection — actual submission events with dates (the real history)
const INSPECTION_BOARD_ID = "18391339956";
const INSPECTION_COLUMN_IDS = [
  "board_relation_mkyeka3z", // linked employee
  "date_mkyex2ej", // inspection date
  "color_mkye5y90", // Driving Status
  "color_mkye38zd", // Damage
  "color_mkyetmm4", // Tire Status
  "color_mkye1k0g", // Tire Replacement
];

const COLUMN_VALUE_FIELDS = `
  id
  text
  value
  ... on BoardRelationValue {
    linked_item_ids
  }
`;

const ITEMS_QUERY = `
  query GetBoard($boardId: ID!, $columnIds: [String!], $limit: Int!) {
    boards(ids: [$boardId]) {
      name
      items_page(limit: $limit) {
        cursor
        items {
          id
          name
          column_values(ids: $columnIds) {
            ${COLUMN_VALUE_FIELDS}
          }
        }
      }
    }
  }
`;

const NEXT_PAGE_QUERY = `
  query NextPage($cursor: String!, $limit: Int!) {
    next_items_page(cursor: $cursor, limit: $limit) {
      cursor
      items {
        id
        name
        column_values {
          ${COLUMN_VALUE_FIELDS}
        }
      }
    }
  }
`;

type MondayItem = {
  id: string;
  name: string;
  column_values: {
    id: string;
    text: string | null;
    value: string | null;
    linked_item_ids?: string[];
  }[];
};

async function mondayFetch(query: string, variables: Record<string, unknown>) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) {
    throw new Error("MONDAY_API_TOKEN is not configured on the server");
  }
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`monday API error ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(`monday API GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function fetchAllItems(boardId: string, columnIds: string[]): Promise<MondayItem[]> {
  const data = await mondayFetch(ITEMS_QUERY, { boardId, columnIds, limit: 250 });
  const board = data.boards[0];
  let items: MondayItem[] = board.items_page.items;
  let cursor: string | null = board.items_page.cursor;

  while (cursor) {
    const nextData = await mondayFetch(NEXT_PAGE_QUERY, { cursor, limit: 250 });
    items = items.concat(nextData.next_items_page.items);
    cursor = nextData.next_items_page.cursor;
  }
  return items;
}

function colVal(item: MondayItem, id: string): string {
  const col = item.column_values.find((c) => c.id === id);
  return col?.text ?? "";
}

function linkedEmployeeId(item: MondayItem, id: string): string | null {
  const col = item.column_values.find((c) => c.id === id);
  const linked = col?.linked_item_ids?.[0];
  return linked ? String(linked) : null;
}

export async function GET() {
  try {
    const [employeeItems, inspectionItems] = await Promise.all([
      fetchAllItems(EMPLOYEE_BOARD_ID, EMPLOYEE_COLUMN_IDS),
      fetchAllItems(INSPECTION_BOARD_ID, INSPECTION_COLUMN_IDS),
    ]);

    const employees = employeeItems
      .map((item) => {
        const status = colVal(item, "status");
        const branch = colVal(item, "color_mkvyytff");
        const manager = colVal(item, "people");
        const jobPosition = colVal(item, "color_mkw1131k");
        return {
          id: item.id,
          name: item.name,
          branch: branch || "Unassigned",
          manager: manager || "",
          jobPosition,
          active: status === "Active",
        };
      })
      .filter(
        (e) =>
          e.active &&
          e.branch !== "Unassigned" &&
          INSPECTION_REQUIRED_JOB_POSITIONS.has(e.jobPosition)
      );

    const employeeById = new Map(employees.map((e) => [e.id, e]));

    const submissions: {
      employeeId: string;
      date: string;
      weekKey: string;
      issueFlagged: boolean;
      issueDetails: string[];
    }[] = [];

    for (const item of inspectionItems) {
      const employeeId = linkedEmployeeId(item, "board_relation_mkyeka3z");
      const date = colVal(item, "date_mkyex2ej");
      if (!employeeId || !date || !employeeById.has(employeeId)) continue;

      const drivingStatus = colVal(item, "color_mkye5y90");
      const damage = colVal(item, "color_mkye38zd");
      const tireStatus = colVal(item, "color_mkyetmm4");
      const tireReplacement = colVal(item, "color_mkye1k0g");

      const issueDetails: string[] = [];
      if (drivingStatus === "Needs Repair") issueDetails.push(`Driving status: ${drivingStatus}`);
      if (damage === "YES - NEW DAMAGE") issueDetails.push("New damage reported");
      if (tireStatus === "25-10%" || tireStatus === "BALD TIRE")
        issueDetails.push(`Tire status: ${tireStatus}`);
      if (tireReplacement === "Replace") issueDetails.push("Tire replacement needed");

      submissions.push({
        employeeId,
        date,
        weekKey: dateToWeekKey(date),
        issueFlagged: issueDetails.length > 0,
        issueDetails,
      });
    }

    const branches = Array.from(new Set(employees.map((e) => e.branch))).sort((a, b) =>
      a.localeCompare(b)
    );

    const now = new Date();
    const { isoYear, isoWeek } = getISOWeek(now);
    const currentWeekKey = weekKey(isoYear, isoWeek);
    const lastWeekDate = new Date(now);
    lastWeekDate.setUTCDate(lastWeekDate.getUTCDate() - 7);
    const lastWeekIso = getISOWeek(lastWeekDate);
    const lastWeekKey = weekKey(lastWeekIso.isoYear, lastWeekIso.isoWeek);

    const years = Array.from(
      new Set(submissions.map((s) => Number(s.weekKey.slice(0, 4))))
    ).sort();
    if (!years.includes(isoYear)) years.push(isoYear);

    return NextResponse.json({
      employees,
      submissions,
      branches,
      meta: {
        currentWeekKey,
        lastWeekKey,
        currentYear: isoYear,
        availableYears: years.sort(),
        generatedAt: now.toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
