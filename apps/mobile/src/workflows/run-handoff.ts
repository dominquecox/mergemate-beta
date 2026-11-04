const RUN_ID=/^[a-z\d_-]{1,100}$/i;

export const workflowRunParam=(value:unknown)=>typeof value==='string'&&RUN_ID.test(value)?value:'';
export const workflowApprovalUrl=(origin:string,runId:string)=>`${origin}/workflows?run=${encodeURIComponent(workflowRunParam(runId))}`;
