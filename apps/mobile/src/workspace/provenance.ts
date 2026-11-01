/**
 * Agent Provenance detection for AI-generated and agent-co-authored PRs.
 * Detects whether coding agents (Claude, Cursor, Codex, Jules, Copilot, Antigravity)
 * authored or contributed to the PR so automated regression guardrails can be signaled.
 */

export interface AgentProvenance {
  isAgentAuthored: boolean;
  agentName: string | null;
  badgeLabel: string;
  signalReason: string | null;
}

const AGENT_BRANCH_PATTERN = /^(claude|cursor|codex|jules|agy|antigravity|copilot|devin|sweep)\/|feat\/J-/i;
const AGENT_AUTHOR_PATTERN = /(bot|claude|cursor|codex|jules|antigravity|copilot|devin|sweep)/i;
const AGENT_TITLE_PATTERN = /(\[bot\]|\[agent\]|\[claude\]|\[codex\]|\[cursor\]|\[jules\]|docs\(cos\):|feat\(agent\):)/i;

function formatAgentName(identifier: string): string {
  const lower = identifier.toLowerCase();
  if (lower.includes("claude")) return "Claude";
  if (lower.includes("cursor")) return "Cursor";
  if (lower.includes("codex")) return "Codex";
  if (lower.includes("jules")) return "Jules";
  if (lower.includes("agy") || lower.includes("antigravity")) return "Antigravity";
  if (lower.includes("copilot")) return "Copilot";
  if (lower.includes("devin")) return "Devin";
  if (lower.includes("dependabot")) return "Dependabot";
  if (lower.includes("github-actions")) return "GitHub Actions";
  if (lower.includes("bot")) return "Bot";
  return "AI Agent";
}

export function detectAgentProvenance(pr: {
  author?: string;
  headBranch?: string;
  title?: string;
}): AgentProvenance {
  const author = (pr.author ?? "").trim();
  const headBranch = (pr.headBranch ?? "").trim();
  const title = (pr.title ?? "").trim();

  let agentName: string | null = null;
  let signalReason: string | null = null;

  if (AGENT_BRANCH_PATTERN.test(headBranch)) {
    const prefix = headBranch.split("/")[0].toLowerCase();
    agentName = formatAgentName(prefix);
    signalReason = `Branch: ${headBranch}`;
  } else if (AGENT_AUTHOR_PATTERN.test(author)) {
    agentName = formatAgentName(author);
    signalReason = `Author: @${author}`;
  } else if (AGENT_TITLE_PATTERN.test(title)) {
    agentName = "AI Agent";
    signalReason = "PR title metadata";
  }

  const isAgentAuthored = agentName !== null;

  return {
    isAgentAuthored,
    agentName,
    badgeLabel: isAgentAuthored
      ? `Co-authored by ${agentName} · Guardrails Active`
      : "",
    signalReason,
  };
}
