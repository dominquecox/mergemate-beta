import {z} from "zod";
const RepoName=z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/).transform(s=>s.toLowerCase());
export const NoteContext=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("pr"),repo:RepoName,number:z.number().int().min(1).max(2147483647)}).strict(),
 z.object({kind:z.literal("highlight")}).strict(),
]);
export type NoteContext=z.infer<typeof NoteContext>;
export const PrivateNote=z.object({id:z.uuid(),context:NoteContext,text:z.string().trim().min(1).max(8000),createdAt:z.iso.datetime()});
export type PrivateNote=z.infer<typeof PrivateNote>;
export const SavePrivateNote=z.object({id:z.uuid(),context:NoteContext,text:z.string().trim().min(1).max(8000)}).strict();
export type SavePrivateNote=z.infer<typeof SavePrivateNote>;
export const PrivateNotes=z.object({items:z.array(PrivateNote).max(100)});
export const noteContextKey=(context:NoteContext):string=>context.kind==="highlight"?"highlight":`pr:${context.repo.toLowerCase()}:${context.number}`;
