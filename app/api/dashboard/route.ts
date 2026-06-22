import { NextResponse } from "next/server";
import { dateToWeekKey, getISOWeek, weekKey } from "@/lib/weeks";

export const dynamic = "force-dynamic";

const MONDAY_API_URL = "https://api.monday.com/v2";

// Employee Directory — roster (branch/office, manager, active status)
const EMPLOYEE_BOARD_ID = "18003250999";
const EMPLOYEE_COLUMN_IDS = ["status", "color_mkvyytff", "people"];

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
            id
            text
            value
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
          id
          text
          value
        }
      }
    }
  }
`;

type MondayItem = {
  id: string;
  name: string;
  column_values: { id: string; text: string | null; value: string | null }[];
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
  if (!col?.value) return null;
  try {
    const parsed = JSON.parse(col.value);
    const linked = parsed?.linkedPulseIds?.[0]?.linkedPulseId;
    return linked ? String(linked) : null;
  } catch {
    return null;
  }
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
        return {
          id: item.id,
          name: item.name,
          branch: branch || "Unassigned",
          manager: manager || "",
          active: status === "Active",
        };
      })
      .filter((e) => e.active && e.branch !== "Unassigned");

    const employeeById = new Map(employees.map((e) => [e.id, e]));

    const submissions: {
      employeeId: string;
      date: string;
      weekKey: string;
      issueFlagged: boolean;
    }[] = [];

    for (const item of inspectionItems) {
      const employeeId = linkedEmployeeId(item, "board_relation_mkyeka3z");
      const date = colVal(item, "date_mkyex2ej");
      if (!employeeId || !date || !employeeById.has(employeeId)) continue;

      const drivingStatus = colVal(item, "color_mkye5y90");
      const damage = colVal(item, "color_mkye38zd");
      const tireStatus = colVal(item, "color_mkyetmm4");
      const tireReplacement = colVal(item, "color_mkye1k0g");
      const issueFlagged =
        drivingStatus === "Needs Repair" ||
        damage === "YES - NEW DAMAGE" ||
        tireStatus === "25-10%" ||
        tireStatus === "BALD TIRE" ||
        tireReplacement === "Replace";

      submissions.push({
        employeeId,
        date,
        weekKey: dateToWeekKey(date),
        issueFlagged,
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
