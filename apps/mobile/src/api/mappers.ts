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

function mapCheck(check: ContractPrDetail["checks"][number], index: number): PrCheck {
  const state: CheckState = check.state;
  const base = { id: `${index}:${check.name}`, name: check.name };
  switch (state) {
    case "success":
      return { ...base, status: "completed", conclusion: "success" };
    case "failure":
      return { ...base, status: "completed", conclusion: "failure" };
    case "neutral":
    case "skipped":
    case "cancelled":
      return { ...base, status: "completed", conclusion: "neutral" };
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
  return "modified";
}

function mapFile(file: ContractPrFile): PrFile {
  return {
    filename: file.path,
    status: mapFileStatus(file.status),
    additions: file.additions,
    deletions: file.deletions,
    ...(file.patch ? { patchSnippet: file.patch.slice(0, 2000) } : {}),
  };
}

/** Review threads and the conversation, flattened to the comment list the screen shows. */
function mapComments(threads: ContractPrDetail["threads"]): PrComment[] {
  return threads.flatMap((thread) =>
    thread.comments.map((comment) => ({
      id: `${thread.id}:${comment.id}`,
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
    headBranch: detail.headBranch,
    baseBranch: detail.baseBranch,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    additions: detail.additions,
    deletions: detail.deletions,
    changedFilesCount: detail.changedFiles,
    // Only a GitHub link may be opened from "Open in GitHub".
    htmlUrl: githubUrl(detail.htmlUrl) ?? "",
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
    ...(plan.renewsAt ? { renewsAt: plan.renewsAt } : {}),
    ...(plan.cancelAt ? { cancelAt: plan.cancelAt } : {}),
  };
}

/** The list endpoint returns summaries; the excerpt stands in for the body in the news and changelog lists. */
export function mapPostSummary(post: PostSummary | Post): PublicPost {
  return {
    slug: post.slug,
    type: post.type,
    title: post.title,
    date: post.publishedAt.slice(0, 10),
    summary: post.excerpt,
    content: post.excerpt,
  };
}

/** Regions arrive as boxes on a 0 to 1000 scale. The card shows where each one is as a share of the image. */
export function mapHighlight(result: ContractHighlightResult): HighlightResult {
  return {
    insight: result.insight,
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
