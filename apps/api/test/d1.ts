import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

type Value = SQLInputValue;

/** Minimal D1 stand-in over node:sqlite, running the real migrations. Tests only. */
class Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    readonly params: Value[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params.map((p) => (p === undefined ? null : (p as Value))));
  }

  async first<T>() {
    return (this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null;
  }

  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[], success: true };
  }

  async run() {
    const info = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(info.changes) } };
  }
}

export class TestD1 {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    const dir = join(import.meta.dirname, "..", "migrations");
    for (const file of readdirSync(dir).sort()) this.sqlite.exec(readFileSync(join(dir, file), "utf8"));
  }

  prepare(sql: string) {
    return new Statement(this.sqlite, sql);
  }

  async batch(statements: Statement[]) {
    this.sqlite.exec("BEGIN");
    try {
      const out = [];
      for (const s of statements) out.push(await s.run());
      this.sqlite.exec("COMMIT");
      return out;
    } catch (err) {
      this.sqlite.exec("ROLLBACK");
      throw err;
    }
  }

  rows<T>(sql: string, ...params: Value[]) {
    return this.sqlite.prepare(sql).all(...params) as T[];
  }
}
