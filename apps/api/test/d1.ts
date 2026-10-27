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

  private numbered() {
    // node:sqlite treats D1's ?1/?2 bindings as named parameters, not positional ones.
    return Object.fromEntries(this.params.map((value, index) => [`?${index + 1}`, value]));
  }

  async first<T>() {
    const statement = this.db.prepare(this.sql);
    const row = /\?\d+/.test(this.sql) ? statement.get(this.numbered()) : statement.get(...this.params);
    return (row as T | undefined) ?? null;
  }

  async all<T>() {
    const statement = this.db.prepare(this.sql);
    const rows = /\?\d+/.test(this.sql) ? statement.all(this.numbered()) : statement.all(...this.params);
    return { results: rows as T[], success: true };
  }

  async run() {
    return this.runSync();
  }

  runSync() {
    const statement = this.db.prepare(this.sql);
    const info = /\?\d+/.test(this.sql) ? statement.run(this.numbered()) : statement.run(...this.params);
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

  /** Like D1, a batch is one atomic unit: nothing else runs between its statements. */
  async batch(statements: Statement[]) {
    this.sqlite.exec("BEGIN");
    try {
      const out = [];
      for (const s of statements) out.push(s.runSync());
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
