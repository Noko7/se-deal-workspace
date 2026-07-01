import { NextResponse } from "next/server";
import { setContextInclusion, type ContextItemType } from "@/lib/data";
import { sanitizeField } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

const ITEM_TYPES: ContextItemType[] = [
  "opportunity",
  "contact",
  "note",
  "transcript",
  "task",
  "asset",
  "email",
];

type IncomingItem = { itemType?: unknown; itemId?: unknown; dealId?: unknown };
type Body = { dealId?: unknown; included?: unknown; items?: unknown };

// Soft-include/exclude ingested items from an account's Account-AI context.
// Never deletes the underlying record; only writes/removes exclusion rows.
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const dealId = sanitizeField(body.dealId, 64);
  if (!dealId) {
    return NextResponse.json({ ok: false, error: "Missing account id." }, { status: 400 });
  }

  const included = body.included === true;

  const rawItems = Array.isArray(body.items) ? (body.items as IncomingItem[]) : [];
  const items = rawItems
    .map((item) => {
      const owning = sanitizeField(item?.dealId, 64);
      return {
        itemType: sanitizeField(item?.itemType, 32) as ContextItemType,
        itemId: sanitizeField(item?.itemId, 64),
        // Falls back to the account's default deal when an item omits its owner.
        dealId: owning.length > 0 ? owning : dealId,
      };
    })
    .filter((item) => ITEM_TYPES.includes(item.itemType) && item.itemId.length > 0)
    .slice(0, 500);

  if (items.length === 0) {
    return NextResponse.json({ ok: false, error: "No valid items provided." }, { status: 400 });
  }

  try {
    await setContextInclusion({ dealId, items, included });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
