import React, { useEffect, useState } from "react";
import type { AiEngineInfo } from "@mergemate/contracts";
import { api } from "../api";
import { modelDisplayName } from "../format/model";
import { SettingsGroup, SettingsRow } from "./SettingsRows";

const JOB_LABEL: Record<AiEngineInfo["jobs"][number]["task"], string> = {
  summary: "Summaries, risk and review plans",
  risk: "Risk check",
  highlight: "Screenshot explanations",
  segment: "Screenshot regions",
  decision: "Quality and triage decisions",
};

/** Read-only list of which model does which AI job. Hidden until the API answers; names only, never keys. */
export function AiEngineGroup() {
  const [engine, setEngine] = useState<AiEngineInfo | null>(null);
  useEffect(() => {
    let live = true;
    api.getAiEngine().then((value) => { if (live) setEngine(value); }, () => undefined);
    return () => { live = false; };
  }, []);
  if (!engine || engine.jobs.length === 0) return null;
  // Risk shares the summary route unless it has its own; show it only when it differs.
  const summary = engine.jobs.find((job) => job.task === "summary")?.model;
  const jobs = engine.jobs.filter((job) => !(job.task === "risk" && job.model === summary));
  return (
    <SettingsGroup title="AI engine">
      {jobs.map((job, index) => (
        <SettingsRow key={job.task} first={index === 0} label={JOB_LABEL[job.task]} detail={modelDisplayName(job.model) ?? job.model} icon="sparkles-outline" />
      ))}
      <SettingsRow label="Profile" detail={engine.profile === "hackathon" ? "Hackathon: Meta models first" : "Everyday: Workers AI by default"} icon="options-outline" />
    </SettingsGroup>
  );
}
