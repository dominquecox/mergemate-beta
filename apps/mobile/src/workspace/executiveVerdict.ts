import {scanAgentGuardrails} from './agentGuardrails';
import type { PrCheck, PrFile, PrRisk, SecretLeakWarning } from "../types";
import type { IconName } from "../components/Icon";
import { riskiestFile } from "./risk";

export type ExecutiveVerdictLevel = "safe" | "caution" | "blocked";

export interface ExecutiveVerdict {
  level: ExecutiveVerdictLevel;
  headline: string;
  summary: string;
  reasons: string[];
  tone: "green" | "yellow" | "red";
  iconName: IconName;
}

const SENSITIVE_PATHS = /(auth|login|session|password|payment|billing|stripe|migrat)/i;

export function getExecutiveVerdict(params: {
  risk?: PrRisk;
  files?: readonly PrFile[];
  checks?: readonly PrCheck[];
  secretWarning?: SecretLeakWarning;
  changedFilesCount?: number;
}): ExecutiveVerdict {
  const { risk, files = [], checks = [], secretWarning } = params;

  const findings=scanAgentGuardrails(files);
  if(findings.some(f=>f.severity==='high'))return {level:'blocked',headline:'BLOCKED · AGENT GUARDRAILS ALERT',summary:'Potential security guard or permission regression detected.',reasons:findings.filter(f=>f.severity==='high').slice(0,2).map(f=>`${f.file}: ${f.message}`),tone:'red',iconName:'shield-outline'};

  // 1. Critical: Secret leak detected
  if (secretWarning) {
    return {
      level: "blocked",
      headline: "BLOCKED · POSSIBLE SECRET EXPOSURE",
      summary: `High risk: pattern matched ${secretWarning.rule} at ${secretWarning.file}:${secretWarning.line}.`,
      reasons: [
        "Raw credentials or API keys detected in diff",
        "Masked secret must be rotated before merging",
      ],
      tone: "red",
      iconName: "alert-circle",
    };
  }

  // 2. Critical: CI / Status Check failure
  const failingCheck = checks.find((c) => c.conclusion === "failure");
  if (failingCheck) {
    return {
      level: "blocked",
      headline: "BLOCKED · CI CHECKS FAILING",
      summary: `Automated status check "${failingCheck.name}" failed on this commit.`,
      reasons: [
        `Failing check: ${failingCheck.name}`,
        "Automated regression gate must pass before merge",
      ],
      tone: "red",
      iconName: "close-circle",
    };
  }

  // 3. High Risk: Sensitive blast radius or risk score high
  const hasSensitiveFile = files.some((f) => SENSITIVE_PATHS.test(f.filename));
  if (risk?.level === "high" || hasSensitiveFile) {
    const riskiest = riskiestFile(files);
    const topReason = risk?.reasons[0]?.trim() || "Touches sensitive domains (Auth, Billing, or Migrations).";
    return {
      level: "blocked",
      headline: "HIGH RISK · SENIOR REVIEW REQUIRED",
      summary: topReason,
      reasons: [
        riskiest ? `High blast radius file: ${riskiest.filename}` : "Sensitive core architecture touched",
        "Requires desktop code review and automated regression pass",
      ],
      tone: "red",
      iconName: "alert-circle",
    };
  }

  // 4. Medium Risk: Schema changes, large churn, or medium risk score
  if (risk?.level === "medium") {
    const topReason = risk.reasons[0]?.trim() || "Moderate blast radius or structural changes.";
    return {
      level: "caution",
      headline: "REVIEW ON DESKTOP · CAUTION",
      summary: topReason,
      reasons: [
        risk.reasons[1]?.trim() || "Structural changes detected",
        "Verify edge cases and test coverage on desktop",
      ],
      tone: "yellow",
      iconName: "warning",
    };
  }

  if(!risk || !checks.length || risk.coverage.skippedFiles>0 || risk.coverage.truncatedFiles>0 || checks.some(c=>c.status!=="completed"||!["success","neutral","skipped"].includes(c.conclusion))){
    return {level:"caution",headline:"REVIEW ON DESKTOP · EVIDENCE INCOMPLETE",summary:"Risk assessment or required check results are incomplete.",reasons:["Verify the latest revision and checks before deciding"],tone:"yellow",iconName:"warning"};
  }

  if(findings.length)return {level:'caution',headline:'REVIEW ON DESKTOP · AGENT GUARDRAILS',summary:'Potential dependency or mock regression needs review.',reasons:findings.slice(0,2).map(f=>`${f.file}: ${f.message}`),tone:'yellow',iconName:'warning'};

  // 5. Safe: Pure docs, tests, type hardening, or verified low risk
  const topReason = risk?.reasons[0]?.trim() || "Low blast radius change.";
  return {
    level: "safe",
    headline: "SAFE TO SHIP · LOW RISK",
    summary: risk ? `Low risk: ${topReason}` : "Safe to ship: zero sensitive blast radius detected.",
    reasons: [
      "Pure non-sensitive file changes",
      checks.length > 0 ? "All reported CI checks passing" : "No breaking signals found",
    ],
    tone: "green",
    iconName: "checkmark-circle",
  };
}
