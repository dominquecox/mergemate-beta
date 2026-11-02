import type {
  CheckState,
  Installation,
  InstallationList as ContractInstallationList,
  Post,
  PostSummary,
  PrDetail as ContractPrDetail,
  PrFile as ContractPrFile,
} from "@mergemate/contracts";
import type {
  BillingPlan as ContractBillingPlan,
  HighlightResult as ContractHighlightResult,
} from "@mergemate/contracts";
import type {
  BillingPlan,
  HighlightResult,
  InstallationList,
  OrgInstallation,
  PrCheck,
  PrComment,
  PrDetail,
  PrFile,
  PrRisk,
  PublicPost,
  SecretLeakWarning,
} from "../types";
import { githubUrl } from "./urls";

const githubAvatar = (login: string) => `https://github.com/${encodeURIComponent(login)}.png?size=80`;

export const SECRET_PLACEHOLDER = "•••••••• value hidden: never shown, stored or sent to AI";

export function mapCheck(check: ContractPrDetail["checks"][number], index: number): PrCheck {
  const state: CheckState = check.state;
  const base = { id:check.id??`${index}:${check.name}`,name:check.name,...(githubUrl(check.url)?{url:githubUrl(check.url)??undefined}:{}) };
  switch (state) {
    case "success":
      return { ...base, status: "completed", conclusion: "success" };
    case "failure":
      return { ...base, status: "completed", conclusion: "failure" };
    case "neutral":
      return { ...base, status: "completed", conclusion: "neutral" };
    case "skipped":
    case "cancelled":
      return {...base,status:"completed",conclusion:state};
    case "in_progress":
      return { ...base, status: "in_progress", conclusion: "pending" };
    case "queued":
    default:
      return { ...base, status: "queued", conclusion: "pending" };
  }
}

function mapFileStatus(status: string): PrFile["status"] {
  if (status === "added") return "added";
  if (status === "removed") return "removed";
  switch(status){case "modified":case "renamed":case "copied":case "changed":return status;default:return "unknown";}
}

export function mapFile(file: ContractPrFile): PrFile {
  return {
    filename: file.path,
    previousPath:file.previousPath,patchState:file.patchState,
    status: mapFileStatus(file.status),
    additions: file.additions,
    deletions: file.deletions,
    ...(file.patch ? { patchSnippet: file.patch } : {}),
  };
}

/** Review threads and the conversation, flattened to the comment list the screen shows. */
export function mapComments(threads: ContractPrDetail["threads"]): PrComment[] {
  return threads.flatMap((thread) =>
    thread.comments.map((comment) => ({
      id:`${thread.kind??(thread.id==='conversation'?'conversation':'review')}:${comment.id}`,
      threadId:`${thread.kind??(thread.id==='conversation'?'conversation':'review')}:${thread.id}`,
      kind:thread.kind??(thread.id==='conversation'?'conversation':'review'),path:thread.path,line:thread.line,outdated:thread.outdated,reviewState:thread.reviewState,
      author: comment.author,
      avatarUrl: githubAvatar(comment.author),
      body: comment.body,
      createdAt: comment.createdAt,
    })),
  );
}

export function mapPrDetail(detail: ContractPrDetail): PrDetail {
  const [owner = "", repo = ""] = detail.repo.split("/");
  return {
    owner,
    repo,
    number: detail.number,
    title: detail.title,
    author: detail.author,
    authorAvatar: githubAvatar(detail.author),
    status: detail.status,
    headSha:detail.headSha,checkCursor:detail.checkCursor,
    headBranch: detail.headBranch,
    baseBranch: detail.baseBranch,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    additions: detail.additions,
    deletions: detail.deletions,
    changedFilesCount: detail.changedFiles,
    // Only a GitHub link may be opened from "Open in GitHub".
    htmlUrl: githubUrl(detail.htmlUrl) ?? "",
    ...(detail.mergeState ? { mergeState: detail.mergeState } : {}),
    checks: detail.checks.map(mapCheck),
    files: detail.files.map(mapFile),
    comments: mapComments(detail.threads),
  };
}

/** The API reports file and line only; the secret value itself never reaches the app. */
export function secretWarningFromRisk(risk: PrRisk | undefined): SecretLeakWarning | undefined {
  const findings = risk?.secretFindings;
  const first = findings?.[0];
  if (!first) return undefined;
  const more = findings.length > 1 ? ` (+${findings.length - 1} more)` : "";
  return { file: first.file, line: first.line, rule: first.rule, maskedSnippet: `${SECRET_PLACEHOLDER}${more}` };
}

export function mapInstallations(list: ContractInstallationList): InstallationList {
  const items: OrgInstallation[] = list.items.map((inst: Installation) => ({
    id: inst.id,
    org: inst.account,
    avatarUrl: githubAvatar(inst.account),
    status: inst.status,
    manageUrl: githubUrl(inst.manageUrl) ?? undefined,
  }));
  return { items, installUrl: githubUrl(list.installUrl) ?? "https://github.com/settings/installations" };
}

export function mapBillingPlan(plan: ContractBillingPlan): BillingPlan {
  return {
    plan: plan.plan,
    status: plan.status,
    trialEligible: plan.trialEligible,
    canManage: plan.canManage,
    ...(plan.renewsAt ? { renewsAt: plan.renewsAt } : {}),
    ...(plan.cancelAt ? { cancelAt: plan.cancelAt } : {}),
  };
}

/** The list endpoint returns summaries; the excerpt stands in for the body in the news and changelog lists. */
export function mapPostSummary(post: PostSummary | Post): PublicPost {
  const raw = "body" in post ? post.body : post.excerpt;
  const content = raw ? raw.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\r") : "";
  const summary = post.excerpt ? post.excerpt.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\r") : "";
  return {
    slug: post.slug,
    type: post.type,
    title: post.title,
    date: post.publishedAt.slice(0, 10),
    summary,
    content,
  };
}

/** Regions arrive as boxes on a 0 to 1000 scale. The card shows where each one is as a share of the image. */
export function mapHighlight(result: ContractHighlightResult): HighlightResult {
  return {
    insight: result.insight,
    ...(result.telemetry?{telemetry:result.telemetry}:{}),
    ...(result.segments?{segments:result.segments}:{}),
    requestId: result.requestId,
    regions: result.regions.map((box, index) => ({
      id: `region-${index}`,
      x: box.xMin,
      y: box.yMin,
      width: box.xMax - box.xMin,
      height: box.yMax - box.yMin,
      label: box.label,
      comment: "",
    })),
  };
}

/** "How this was assessed", matching what actually ran for this answer. */
export function riskAssessmentText(assessedBy: PrRisk["assessedBy"]): string {
  const rules =
    "Fixed rules check for possible secrets, failing checks, sensitive areas (auth, payments, migrations), missing tests and very large diffs.";
  const guidance = "This is review guidance, not a security guarantee.";
  if (assessedBy === "rules") return `${rules} Only these rules ran this time: the AI review was unavailable. ${guidance}`;
  return `${rules} Meta AI then reads the change and adds its own reasons. AI can raise the level, never lower what the rules found. ${guidance}`;
}
