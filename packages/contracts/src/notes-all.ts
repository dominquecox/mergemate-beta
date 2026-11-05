import { z } from "zod";

/**
 * GET /v1/notes/all: every private note the signed-in user wrote, newest first.
 * The context is read leniently so a note kind added later still lists (as "other").
 */
export const NoteListContext = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pr"), repo: z.string().min(1).max(200), number: z.number().int().min(1) }).strict(),
  z.object({ kind: z.literal("highlight") }).strict(),
  z.object({ kind: z.literal("card"), projectId: z.string().max(256).optional(), cardId: z.string().max(256).optional() }).strict(),
  z.object({ kind: z.literal("other") }).strict(),
]);
export type NoteListContext = z.infer<typeof NoteListContext>;

export const NoteListItem = z.object({
  id: z.string().min(1).max(100),
  context: NoteListContext,
  text: z.string().max(8000),
  createdAt: z.string().min(1).max(64),
}).strict();
export type NoteListItem = z.infer<typeof NoteListItem>;

export const NoteListPage = z.object({
  items: z.array(NoteListItem).max(100),
  nextCursor: z.string().max(200).nullable(),
}).strict();
export type NoteListPage = z.infer<typeof NoteListPage>;
