import { Hono } from "hono";
import type { NoteListContext, NoteListItem } from "@mergemate/contracts";
import { requireBinding } from "../config";
import { ApiError } from "../errors";
import type { AppEnv } from "../env";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const CURSOR = /^([0-9T:.+\-Z]{10,40})\|([A-Za-z0-9-]{1,100})$/;

type Row = { id: string; context_json: string; text: string; created_at: string };

const short = (value: unknown): string | undefined => (typeof value === "string" && value.length > 0 && value.length <= 256 ? value : undefined);

/** Reads a stored context without failing on kinds this build does not know yet. */
function lenientContext(json: string): NoteListContext {
  try {
    const value = JSON.parse(json) as Record<string, unknown>;
    if (value.kind === "pr" && typeof value.repo === "string" && value.repo.length <= 200 && Number.isInteger(value.number) && (value.number as number) >= 1) {
      return { kind: "pr", repo: value.repo, number: value.number as number };
    }
    if (value.kind === "highlight") return { kind: "highlight" };
    if (value.kind === "card") {
      const projectId = short(value.projectId), cardId = short(value.cardId);
      return { kind: "card", ...(projectId ? { projectId } : {}), ...(cardId ? { cardId } : {}) };
    }
  } catch {
    // Falls through to "other".
  }
  return { kind: "other" };
}

export const notesAll = new Hono<AppEnv>();
notesAll.use(async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });

/** GET /v1/notes/all?limit=50&cursor= : the signed-in user's own notes, newest first, one bounded page at a time. */
notesAll.get("/notes/all", async (c) => {
  const session = c.get("session");
  if (session.demo || !session.userId) throw new ApiError("forbidden", "Private notes are unavailable in demo mode.");
  const raw = Number(c.req.query("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isInteger(raw) ? Math.min(Math.max(raw, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  const cursorText = c.req.query("cursor");
  const cursor = cursorText ? CURSOR.exec(cursorText) : null;
  if (cursorText && !cursor) throw new ApiError("validation_failed", "That page cursor is not valid. Reload the list.");
  const db = requireBinding(c.env, "DB");
  const base = "SELECT id,context_json,text,created_at FROM private_notes WHERE user_id=?";
  const order = " ORDER BY created_at DESC, id DESC LIMIT ?";
  const rows = cursor
    ? await db.prepare(`${base} AND (created_at<? OR (created_at=? AND id<?))${order}`).bind(session.userId, cursor[1], cursor[1], cursor[2], limit + 1).all<Row>()
    : await db.prepare(`${base}${order}`).bind(session.userId, limit + 1).all<Row>();
  const page = (rows.results ?? []).slice(0, limit);
  const more = (rows.results ?? []).length > limit;
  const last = page[page.length - 1];
  const items: NoteListItem[] = page.map((row) => ({ id: row.id, context: lenientContext(row.context_json), text: row.text, createdAt: row.created_at }));
  return c.json({ items, nextCursor: more && last ? `${last.created_at}|${last.id}` : null });
});
