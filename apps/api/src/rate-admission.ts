import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { RATE_LIMITS, type Admission, type AdmissionScope } from "./rate-policy";
const WINDOW_MS = 60_000;

/** One object per hashed identity/scope. SQL and timestamps never contain the raw identity. */
export class RateAdmission extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS admissions(id INTEGER PRIMARY KEY, at_ms INTEGER NOT NULL)");
      this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS admissions_at ON admissions(at_ms)");
      this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS clock(singleton INTEGER PRIMARY KEY CHECK(singleton=1),last_ms INTEGER NOT NULL,scope TEXT CHECK(scope IN ('ip','session','support')))");
    });
  }
  protected currentTime(): number { return Date.now(); }
  #now(scope?:AdmissionScope): number {
    const prior=this.ctx.storage.sql.exec<{last_ms:number;scope:AdmissionScope|null}>("SELECT last_ms,scope FROM clock WHERE singleton=1").toArray()[0];
    if(scope&&prior?.scope&&scope!==prior.scope)throw new Error("Admission scope cannot change");
    const now=Math.max(this.currentTime(),prior?.last_ms??0);
    this.ctx.storage.sql.exec("INSERT INTO clock VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET last_ms=excluded.last_ms,scope=COALESCE(clock.scope,excluded.scope)",now,scope??null);
    return now;
  }
  async admit(scope: AdmissionScope): Promise<Admission> {
    if(typeof scope!=="string"||!Object.hasOwn(RATE_LIMITS,scope))throw new Error("Invalid admission scope");
    const result=this.ctx.storage.transactionSync(()=>{
      const now=this.#now(scope);
      this.ctx.storage.sql.exec("DELETE FROM admissions WHERE at_ms<=?",now-WINDOW_MS);
      const {count,oldest}=this.ctx.storage.sql.exec<{count:number;oldest:number|null}>("SELECT count(*) AS count,min(at_ms) AS oldest FROM admissions").one();
      if(count>=RATE_LIMITS[scope])return {success:false,retryAfter:Math.max(1,Math.ceil(((oldest??now)+WINDOW_MS-now)/1000)),alarm:(oldest??now)+WINDOW_MS};
      this.ctx.storage.sql.exec("INSERT INTO admissions(at_ms) VALUES(?)",now);
      return {success:true,retryAfter:0,alarm:(oldest??now)+WINDOW_MS};
    });
    // SQL admission is committed before any await; interleaving here cannot overshoot.
    await this.ctx.storage.setAlarm(result.alarm);
    return {success:result.success,retryAfter:result.retryAfter};
  }
  override async alarm(): Promise<void> {
    const next=this.ctx.storage.transactionSync(()=>{
      const now=this.#now();this.ctx.storage.sql.exec("DELETE FROM admissions WHERE at_ms<=?",now-WINDOW_MS);
      return this.ctx.storage.sql.exec<{oldest:number|null}>("SELECT min(at_ms) AS oldest FROM admissions").one().oldest;
    });
    if(next!==null)await this.ctx.storage.setAlarm(next+WINDOW_MS);
  }
}
