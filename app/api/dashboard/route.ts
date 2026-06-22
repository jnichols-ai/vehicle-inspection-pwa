import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BOARD_ID = "18418816965"; // Vehicle Inspection Compliance
const MONDAY_API_URL = "https://api.monday.com/v2";

const COLUMN_IDS = [
  "color_mm4jypn", // Branch
  "text_mm4jw8hj", // Manager
  "date_mm4j510j", // Last Inspection Date
  "color_mm4jby1b", // Submitted This Week
  "color_mm4jskx9", // Issue Flagged
];

const QUERY = `
  query GetBoard($boardId: ID!, $columnIds: [String!]) {
    boards(ids: [$boardId]) {
      name
      groups {
        id
        title
      }
      items_page(limit: 500) {
        cursor
        items {
          id
          name
          group {
            id
            title
          }
          column_values(ids: $columnIds) {
            id
            text
          }
        }
      }
    }
  }
`;

const NEXT_PAGE_QUERY = `
  query NextPage($cursor: String!) {
    next_items_page(cursor: $cursor, limit: 500) {
      cursor
      items {
        id
        name
        group {
          id
          title
        }
        column_values {
          id
          text
        }
      }
    }
  }
`;

type MondayItem = {
  id: string;
  name: string;
  group: { id: string; title: string };
  column_values: { id: string; text: string | null }[];
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

function colVal(item: MondayItem, id: string): string {
  const col = item.column_values.find((c) => c.id === id);
  return col?.text ?? "";
}

export async function GET() {
  try {
    const data = await mondayFetch(QUERY, { boardId: BOARD_ID, columnIds: COLUMN_IDS });
    const board = data.boards[0];

    let items: MondayItem[] = board.items_page.items;
    let cursor = board.items_page.cursor;

    while (cursor) {
      const nextData = await mondayFetch(NEXT_PAGE_QUERY, { cursor });
      items = items.concat(nextData.next_items_page.items);
      cursor = nextData.next_items_page.cursor;
    }

    const branchMap: Record<
      string,
      {
        branch: string;
        total: number;
        submitted: number;
        notSubmitted: number;
        issuesFlagged: number;
        employees: {
          name: string;
          manager: string;
          lastInspectionDate: string;
          submitted: boolean;
          issueStatus: string;
        }[];
      }
    > = {};

    let totalSubmitted = 0;
    let totalIssues = 0;

    for (const item of items) {
      const branch = colVal(item, "color_mm4jypn") || item.group.title;
      if (!branch || branch === "Group Title") continue;

      const manager = colVal(item, "text_mm4jw8hj");
      const lastInspectionDate = colVal(item, "date_mm4j510j");
      const submittedStatus = colVal(item, "color_mm4jby1b");
      const issueStatus = colVal(item, "color_mm4jskx9");
      const submitted = submittedStatus === "Submitted";
      const flagged = issueStatus === "Issue Flagged";

      if (!branchMap[branch]) {
        branchMap[branch] = {
          branch,
          total: 0,
          submitted: 0,
          notSubmitted: 0,
          issuesFlagged: 0,
          employees: [],
        };
      }

      const b = branchMap[branch];
      b.total += 1;
      if (submitted) {
        b.submitted += 1;
        totalSubmitted += 1;
      } else {
        b.notSubmitted += 1;
      }
      if (flagged) {
        b.issuesFlagged += 1;
        totalIssues += 1;
      }
      b.employees.push({
        name: item.name,
        manager,
        lastInspectionDate,
        submitted,
        issueStatus: issueStatus || "N/A",
      });
    }

    const branches = Object.values(branchMap).sort((a, b) => a.branch.localeCompare(b.branch));

    const summary = {
      totalEmployees: items.length,
      totalSubmitted,
      totalNotSubmitted: items.length - totalSubmitted,
      totalIssuesFlagged: totalIssues,
      submissionRate: items.length ? Math.round((totalSubmitted / items.length) * 100) : 0,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ summary, branches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
