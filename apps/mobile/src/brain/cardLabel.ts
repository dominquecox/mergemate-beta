/** Board rows show the card title; the id is only secondary text. A UUID is cut to its first block so it stays small. */
export function shortCardId(id: string): string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id.slice(0, 8) : id.length > 16 ? `${id.slice(0, 16)}…` : id;
}
