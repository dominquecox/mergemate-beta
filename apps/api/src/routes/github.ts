import {readBoundedBody} from '../lib/bounded-body';
import {
  type CheckState,
  type Installation,
  type InstallationList,
  type PrCheck,
  type MergeState,
  type PrDetail,
  type PrStatus,
  type PrThread,
  type RepoPage,
  RepoWatchRequest,
} from "@mergemate/contracts";
import { type Context, Hono } from "hono";
import { requireBinding, requireVar } from "../config";
import type { AppEnv, Deps } from "../env";
import { ApiError } from "../errors";
import { base64url,sha256Hex } from "../lib/crypto";
import { GITHUB_WEB, githubGet } from "../lib/github";
import { getAccessToken } from "../lib/github-tokens";
import { parseBody } from "../lib/validate";
import { DEMO_INSTALLATIONS, DEMO_PRS, DEMO_REPOS } from "./github.fixtures";

const PAGE_SIZE = 50;
const FILE_PAGES = 3; // up to 300 files
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

const userToken = (c: Context<AppEnv>) => {
  const { userId } = c.get("session");
  if (!userId) throw new ApiError("forbidden", "Not available in the demo.");
  return getAccessToken(c.env, userId, c.get("deps").now());
};

function workspaceDeps(c:Context<AppEnv>):Deps{
 const deps=c.get('deps'),deadline=AbortSignal.timeout(20_000);
 return {...deps,fetch:async(input,init)=>{const response=await deps.fetch(input,{...init,signal:AbortSignal.any([deadline,c.req.raw.signal,...(init?.signal?[init.signal]:[])])});const body=await readBoundedBody(response,4*1024*1024);return new Response(body,{status:response.status,headers:response.headers});}};
}

interface GhInstallation {
  id: number;
  account: { login: string; type: string } | null;
  suspended_at: string | null;
  html_url: string;
}

const listInstallations = async (c: Context<AppEnv>, token: string) => {
  const res = await githubGet<{ installations: GhInstallation[] }>(c.get("deps"), token, "/user/installations?per_page=100");
  return res.installations;
};

const installUrl = (c: Context<AppEnv>) =>
  `${GITHUB_WEB}/apps/${encodeURIComponent(requireVar(c.env, "GITHUB_APP_SLUG"))}/installations/new`;

interface RepoCursor {
  i: number;
  p: number;
  size?: number;
}

const encodeCursor = (cursor: RepoCursor) => base64url(new TextEncoder().encode(JSON.stringify(cursor)));

const decodeCursor = (value: string | undefined): RepoCursor => {
  if (!value) return { i: 0, p: 1 };
  try {
    const parsed = JSON.parse(atob(value.replace(/-/g, "+").replace(/_/g, "/"))) as RepoCursor;
    if ((parsed.size === undefined || (Number.isInteger(parsed.size) && parsed.size >= 1 && parsed.size <= 50)) && Number.isInteger(parsed.i) && Number.isInteger(parsed.p) && parsed.i >= 0 && parsed.p >= 1 && parsed.p <= 1000) {
      return parsed;
    }
  } catch {
    // fall through
  }
  throw new ApiError("validation_failed", "The cursor is not valid.");
};

interface GhPull {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  draft?: boolean;
  merged_at: string | null;
  user: { login: string } | null;
  base: { ref: string };
  head: { ref: string; sha: string };
  additions: number;
  deletions: number;
  changed_files: number;
  created_at: string;
  updated_at: string;
  html_url: string;
  /** null while GitHub computes mergeability in the background. */
  mergeable?: boolean | null;
  mergeable_state?: string;
}

interface GhFile {
  filename: string;
  previous_filename?:string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface GhCheckRun {
  head_sha?:string;
  started_at?:string|null;
  completed_at?:string|null;
  app?:{name?:string}|null;
  id?:number;
  name: string;
  status: "queued" | "in_progress" | "completed" | string;
  conclusion: string | null;
  html_url: string | null;
}

interface GhStatus {
  context: string;
  state: "error" | "failure" | "pending" | "success";
  target_url: string | null;
}

interface GhComment {
  id: number;
  user: { login: string } | null;
  body: string;
  created_at: string;
  path?: string;
  line?: number | null;
  in_reply_to_id?: number;
  original_line?:number|null;
  submitted_at?:string;
  state?:string;
}

/** Maps GitHub's mergeability onto MergeState. Only open pull requests have one. */
export const mergeStateOf = (pr: Pick<GhPull, "state" | "merged_at" | "mergeable" | "mergeable_state">): MergeState | undefined => {
  if (pr.state !== "open" || pr.merged_at) return undefined;
  if (pr.mergeable === false || pr.mergeable_state === "dirty") return "conflicts";
  if (pr.mergeable === null || pr.mergeable === undefined) return "unknown";
  switch (pr.mergeable_state) {
    case "clean":
    case "has_hooks":
      return "clean";
    case "blocked":
      return "blocked";
    case "behind":
      return "behind";
    case "unstable":
      return "unstable";
    default:
      return "unknown";
  }
};

export const prStatus = (pr: { state: string; draft?: boolean; merged_at?: string | null }): PrStatus => {
  if (pr.merged_at) return "merged";
  if (pr.state === "closed") return "closed";
  return pr.draft ? "draft" : "open";
};

const checkRunState = (run: GhCheckRun): CheckState => {
  if (run.status !== "completed") return run.status === "in_progress" ? "in_progress" : "queued";
  switch (run.conclusion) {
    case "success":
      return "success";
    case "neutral":
      return "neutral";
    case "skipped":
      return "skipped";
    case "cancelled":
      return "cancelled";
    default:
      return "failure";
  }
};

const STATUS_STATE: Record<GhStatus["state"], CheckState> = {
  success: "success",
  pending: "queued",
  failure: "failure",
  error: "failure",
};

const httpsUrl=(value:string|null)=>{try{const url=new URL(value??'');return url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='github.com'||url.hostname.endsWith('.github.com'))?{url:url.toString()}:{};}catch{return {};}};
const checkTime=(value:string|null|undefined)=>typeof value==="string"&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():undefined;
const runCheck=(run:GhCheckRun,index:number):PrCheck=>({source:"check_run",...(run.head_sha&&/^[a-f0-9]{40}$/.test(run.head_sha)?{headSha:run.head_sha}:{}),...(run.app?.name?.trim()?{provider:run.app.name.replace(/[\p{Cc}\p{Cf}]/gu," ").trim().slice(0,120)}:{}),...(checkTime(run.started_at)?{startedAt:checkTime(run.started_at)}:{}),...(checkTime(run.completed_at)?{completedAt:checkTime(run.completed_at)}:{}),id:`run:${run.id??`${run.name}:${index}`}`,name:run.name,state:checkRunState(run),...httpsUrl(run.html_url)});
const statusCheck=(status:GhStatus):PrCheck=>({source:"status",id:`status:${status.context}`,name:status.context,state:STATUS_STATE[status.state],...httpsUrl(status.target_url)});
export function workspaceFile(file:GhFile,cap=true){
 const patch=cap?file.patch?.slice(0,65536):file.patch;let adds=0,deletes=0,inHunk=false;
 for(const line of (patch??'').split('\n')){if(/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(line))inHunk=true;else if(inHunk&&line.startsWith('+'))adds++;else if(inHunk&&line.startsWith('-'))deletes++;}
 return {path:file.filename,status:file.status,additions:file.additions,deletions:file.deletions,...(file.previous_filename?{previousPath:file.previous_filename}:{}),...(patch?{patch}:{}),patchState:!patch?'unavailable' as const:patch.length!==(file.patch?.length??0)||adds!==file.additions||deletes!==file.deletions?'partial' as const:'available' as const};
}

const toThreads = (review: GhComment[], conversation: GhComment[]): PrThread[] => {
  const comment = (c: GhComment) => ({
    id: String(c.id),
    author: c.user?.login ?? "ghost",
    body: c.body,
    createdAt: c.created_at,
  });
  const threads = new Map<number, PrThread>();
  for (const c of review) {
    const root = c.in_reply_to_id ?? c.id;
    const thread:PrThread = threads.get(root) ?? {id:String(root),kind:"review",path:c.path??null,line:c.line??c.original_line??null,outdated:c.line===null&&c.original_line!=null,comments:[]};
    thread.comments.push(comment(c));
    threads.set(root, thread);
  }
  const result = [...threads.values()];
  if (conversation.length) result.unshift({ id: "conversation",kind:"conversation", path: null, line: null, comments: conversation.map(comment) });
  return result;
};

/**
 * Fetches pull request detail with the user's own token, so GitHub enforces
 * their access to the repository. Up to 300 files with patches, plus checks
 * and threads.
 */
export const fetchPrDetail = async (
  deps: Deps,
  token: string,
  owner: string,
  repo: string,
  number: number,
  lazy = false,
  includeChecks=true,
): Promise<PrDetail> => {
  const base = `/repos/${owner}/${repo}`;
  const pull = await githubGet<GhPull>(deps, token, `${base}/pulls/${number}`);

  const filePages = lazy ? 0 : Math.min(FILE_PAGES, Math.max(1, Math.ceil(pull.changed_files / 100)));
  const [files, checkRuns, statuses, review, conversation] = await Promise.all([
    Promise.all(
      Array.from({ length: filePages }, (_, i) =>
        githubGet<GhFile[]>(deps, token, `${base}/pulls/${number}/files?per_page=100&page=${i + 1}`),
      ),
    ).then((pages) => pages.flat()),
    includeChecks?githubGet<{check_runs:GhCheckRun[]}>(deps,token,`${base}/commits/${pull.head.sha}/check-runs?per_page=100`):Promise.resolve({check_runs:[]}),
    includeChecks?githubGet<{statuses:GhStatus[]}>(deps,token,`${base}/commits/${pull.head.sha}/status?per_page=100`):Promise.resolve({statuses:[]}),
    lazy ? Promise.resolve([] as GhComment[]) : githubGet<GhComment[]>(deps, token, `${base}/pulls/${number}/comments?per_page=100`),
    lazy ? Promise.resolve([] as GhComment[]) : githubGet<GhComment[]>(deps, token, `${base}/issues/${number}/comments?per_page=100`),
  ]);

  const checks:PrCheck[]=[...checkRuns.check_runs.map(runCheck),...statuses.statuses.map(statusCheck)];
  return {
    repo: `${owner}/${repo}`,
    number: pull.number,
    title: pull.title,
    body: pull.body ?? "",
    author: pull.user?.login ?? "ghost",
    status: prStatus(pull),
    baseBranch: pull.base.ref,
    headBranch: pull.head.ref,
    headSha: pull.head.sha,
    additions: pull.additions,
    deletions: pull.deletions,
    changedFiles: pull.changed_files,
    files:files.map(file=>workspaceFile(file,false)),
    checks,
    checkCursor:!includeChecks?"checks:1":checkRuns.check_runs.length===100||statuses.statuses.length===100?"checks:5":null,
    threads: toThreads(review, conversation),
    createdAt: pull.created_at,
    updatedAt: pull.updated_at,
    htmlUrl: pull.html_url,
    ...(mergeStateOf(pull) ? { mergeState: mergeStateOf(pull) } : {}),
  };
};

export const github = new Hono<AppEnv>()
  .get("/me/installations", async (c) => {
    if (c.get("session").demo) {
      const demo: InstallationList = { items: DEMO_INSTALLATIONS, installUrl: installUrl(c) };
      return c.json(c.req.query("lazy")==="1"?{...demo,files:[],threads:[]}:demo);
    }
    const token = await userToken(c);
    const items: Installation[] = (await listInstallations(c, token)).flatMap((inst) =>
      inst.account
        ? [
            {
              id: String(inst.id),
              account: inst.account.login,
              accountType: inst.account.type === "Organization" ? ("Organization" as const) : ("User" as const),
              status: inst.suspended_at ? ("suspended" as const) : ("active" as const),
              manageUrl: inst.html_url,
            },
          ]
        : [],
    );
    const res: InstallationList = { items, installUrl: installUrl(c) };
    return c.json(res);
  })

  .get("/repos", async (c) => {
    const cursor = decodeCursor(c.req.query("cursor"));
    const limit=Number(c.req.query('limit') ?? cursor.size ?? PAGE_SIZE);
    if(!Number.isInteger(limit) || limit<1 || limit>50 || (cursor.size!==undefined && cursor.size!==limit))throw new ApiError('validation_failed','Invalid page limit.');
    if (c.get("session").demo) {
      const offset=(cursor.p-1)*limit;
      const demo: RepoPage = {items:DEMO_REPOS.slice(offset,offset+limit),nextCursor:offset+limit<DEMO_REPOS.length?encodeCursor({i:0,p:cursor.p+1,size:limit}):null};
      return c.json(demo);
    }
    const token = await userToken(c);
    const deps = c.get("deps");
    const installations = (await listInstallations(c, token)).filter((inst) => !inst.suspended_at);
    const inst = installations[cursor.i];
    if (!inst) return c.json({ items: [], nextCursor: null } satisfies RepoPage);

    const page = await githubGet<{
      total_count: number;
      repositories: { id: number; full_name: string; private: boolean }[];
    }>(deps, token, `/user/installations/${inst.id}/repositories?per_page=${limit}&page=${cursor.p}`);

    const ids = page.repositories.map((r) => String(r.id));
    const watch = new Map<string, boolean>();
    if (ids.length) {
      const rows = await requireBinding(c.env, "DB")
        .prepare(
          `SELECT repo_id, watching FROM repo_watch WHERE user_id = ? AND repo_id IN (${ids.map(() => "?").join(",")})`,
        )
        .bind(c.get("session").userId, ...ids)
        .all<{ repo_id: string; watching: number }>();
      for (const row of rows.results) watch.set(row.repo_id, row.watching === 1);
    }

    const next: RepoCursor | null =
      cursor.p * limit < page.total_count
        ? { i: cursor.i, p: cursor.p + 1, size:limit }
        : cursor.i + 1 < installations.length
          ? { i: cursor.i + 1, p: 1, size:limit }
          : null;
    const res: RepoPage = {
      items: page.repositories.map((r) => ({
        id: String(r.id),
        fullName: r.full_name,
        private: r.private,
        watching: watch.get(String(r.id)) ?? true,
      })),
      nextCursor: next ? encodeCursor(next) : null,
    };
    return c.json(res);
  })

  .put("/repos/:id/watch", async (c) => {
    const id = c.req.param("id");
    if (!/^[1-9]\d{0,19}$/.test(id)) throw new ApiError("validation_failed", "The repository id is not valid.");
    const body = await parseBody(c, RepoWatchRequest);
    const token = await userToken(c);
    // Confirms the user can see this repository through MergeMate before storing anything for it.
    const repo = await githubGet<{ id: number; full_name: string }>(c.get("deps"), token, `/repositories/${id}`);
    await requireBinding(c.env, "DB")
      .prepare(
        `INSERT INTO repo_watch (user_id, repo_id, full_name, watching, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, repo_id) DO UPDATE SET full_name = excluded.full_name, watching = excluded.watching,
           updated_at = excluded.updated_at`,
      )
      .bind(c.get("session").userId, String(repo.id), repo.full_name, body.watching ? 1 : 0, c.get("deps").now().toISOString())
      .run();
    return c.json({ id: String(repo.id), fullName: repo.full_name, watching: body.watching });
  })

  .get('/prs/:owner/:repo/:number/pages/:section',async c=>{
    const {owner,repo,number,section}=c.req.param();
    if(!NAME.test(owner)||!NAME.test(repo)||[owner,repo].some(value=>value==='.'||value==='..')||!/^[1-9]\d{0,9}$/.test(number)||!['files','comments','checks'].includes(section))throw new ApiError('validation_failed','Invalid pull request page.');
    const modern=c.req.query('v')==='2',raw=c.req.query('cursor')??(section==='files'?'1':section==='checks'?'checks:1':'review:1');
    let source=section==='files'?'files':raw.split(':')[0]??'',page=Number(section==='files'?raw:raw.split(':')[1]),revision:string|undefined,scope:string|undefined;
    if(modern&&!/^\d+$|^(review|conversation|reviews|checks):\d+$/.test(raw)){
      try{if(raw.length>1024)throw new Error();const value:unknown=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')));if(!value||typeof value!=='object'||!('source'in value)||typeof value.source!=='string'||!('page'in value)||typeof value.page!=='number'||!('head'in value)||typeof value.head!=='string'||!('scope'in value)||typeof value.scope!=='string')throw new Error();source=value.source;page=value.page;revision=value.head;scope=value.scope;}catch{throw new ApiError('validation_failed','Invalid workspace cursor.');}
    }
    const sources=section==='files'?['files']:section==='checks'?['checks']:modern?['review','conversation','reviews']:['review','conversation'];
    if(!sources.includes(source)||!Number.isInteger(page)||page<1||page>120)throw new ApiError('validation_failed','Invalid workspace cursor.');
    if(c.get('session').demo){const detail=DEMO_PRS.find(pr=>pr.repo===`${owner}/${repo}`&&pr.number===Number(number));if(!detail)throw new ApiError('not_found','Pull request not found.');return c.json({items:section==='files'?detail.files:section==='checks'?detail.checks:detail.threads,nextCursor:null,headSha:detail.headSha,capped:false});}
    const token=await userToken(c),deps=workspaceDeps(c),base=`/repos/${owner}/${repo}`,limit=25;
    // Revalidate PR access and revision for every source, including issue comments.
    const pull=await githubGet<GhPull>(deps,token,`${base}/pulls/${number}`);
    const bound=await sha256Hex(JSON.stringify([c.get('session').userId,owner,repo,number,section]));
    if(scope!==undefined&&scope!==bound)throw new ApiError('validation_failed','Cursor belongs to another workspace.');
    if((revision&&revision!==pull.head.sha)||(c.req.query('head')&&c.req.query('head')!==pull.head.sha))throw new ApiError('pr_changed','This PR changed. Refresh the workspace.');
    let items:unknown[],length:number;
    if(section==='files'){const rows=await githubGet<GhFile[]>(deps,token,`${base}/pulls/${number}/files?per_page=${limit}&page=${page}`);length=rows.length;items=rows.map(file=>workspaceFile(file));}
    else if(section==='checks'){
      const [runs,statuses]=await Promise.all([githubGet<{check_runs:GhCheckRun[]}>(deps,token,`${base}/commits/${pull.head.sha}/check-runs?per_page=${limit}&page=${page}`),githubGet<{statuses:GhStatus[]}>(deps,token,`${base}/commits/${pull.head.sha}/status?per_page=${limit}&page=${page}`)]);
      length=Math.max(runs.check_runs.length,statuses.statuses.length);items=[...runs.check_runs.map((row,index)=>runCheck(row,(page-1)*limit+index)),...statuses.statuses.map(statusCheck)];
    }else if(source==='reviews'){
      const rows=await githubGet<GhComment[]>(deps,token,`${base}/pulls/${number}/reviews?per_page=${limit}&page=${page}`);length=rows.length;items=rows.filter(row=>row.state!=='PENDING'&&(row.submitted_at||row.created_at)).map(row=>({id:`review-${row.id}`,kind:'review-summary',reviewState:row.state,path:null,line:null,comments:[{id:String(row.id),author:row.user?.login??'ghost',body:row.body??'',createdAt:row.submitted_at??row.created_at}]}));
    }else{const rows=await githubGet<GhComment[]>(deps,token,`${base}/${source==='review'?'pulls':'issues'}/${number}/comments?per_page=${limit}&page=${page}`);length=rows.length;items=toThreads(source==='review'?rows:[],source==='conversation'?rows:[]);}
    const capped=length===limit&&page===120,index=sources.indexOf(source),nextSource=length===limit&&page<120?source:sources[index+1],nextPage=nextSource===source?page+1:1;
    const nextCursor=!nextSource?null:modern?base64url(new TextEncoder().encode(JSON.stringify({source:nextSource,page:nextPage,head:pull.head.sha,scope:bound}))):nextSource==='files'?String(nextPage):`${nextSource}:${nextPage}`;
    return c.json({items,nextCursor,headSha:pull.head.sha,capped});
  })

  .get("/prs/:owner/:repo/:number", async (c) => {
    const { owner, repo, number } = c.req.param();
    if (!NAME.test(owner) || !NAME.test(repo) || [owner,repo].some(value=>value==="."||value==="..") || !/^[1-9]\d{0,9}$/.test(number)) {
      throw new ApiError("validation_failed", "The pull request reference is not valid.");
    }
    const fullName = `${owner}/${repo}`;
    if (c.get("session").demo) {
      const demo = DEMO_PRS.find((p) => p.repo === fullName && p.number === Number(number));
      if (!demo) throw new ApiError("not_found", "Not found.");
      return c.json(c.req.query("lazy")==="1"?{...demo,files:[],threads:[]}:demo);
    }

    // The user's own token: GitHub enforces their access to this repository.
    const token = await userToken(c);
    return c.json(await fetchPrDetail(workspaceDeps(c), token, owner, repo, Number(number), c.req.query("lazy") === "1",c.req.query("workspace")!=="1"));
  });
