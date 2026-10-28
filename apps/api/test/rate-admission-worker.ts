import { createApp } from "../src/app";
import type { Env } from "../src/env";
// Local runtime fixture only; the production entry exports RateAdmission, never this subclass/router.
import { RateAdmission } from '../src/rate-admission';
import type { AdmissionScope } from '../src/rate-policy';
export class TestRateAdmission extends RateAdmission {
  private testTime:number|undefined;
  protected override currentTime(){return this.testTime??Date.now();}
  setTestTime(value:number){this.testTime=value;}
  inspect(){return {count:this.ctx.storage.sql.exec<{count:number}>('SELECT count(*) AS count FROM admissions').one().count};}
  async cleanup(){await this.alarm();}
}
const app=createApp();
export default {
  async fetch(request:Request,env:Omit<Env,"RATE_ADMISSION">&{RATE_ADMISSION:DurableObjectNamespace<TestRateAdmission>},ctx:ExecutionContext) {
    if(new URL(request.url).pathname.startsWith("/v1/"))return app.fetch(request,env,ctx);
    const body=await request.json<{name:string;scope:AdmissionScope;action?:string;now?:number}>();
    const stub=env.RATE_ADMISSION.getByName(body.name);
    if(body.action==='clock'&&typeof body.now==='number'){await stub.setTestTime(body.now);return Response.json({ok:true});}
    if(body.action==='inspect')return Response.json(await stub.inspect());
    if(body.action==='cleanup'){await stub.cleanup();return Response.json({ok:true});}
    return Response.json(await stub.admit(body.scope));
  },
};
