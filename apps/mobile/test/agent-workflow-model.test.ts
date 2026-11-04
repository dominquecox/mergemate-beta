import { describe, it, expect } from 'vitest';
import { WorkflowDefinition } from '@mergemate/contracts';
import { AGENT_TEMPLATES, makeAgentTemplate, moveAgentStep, toggleAgentStep, targetFromPrUrl, targetFromUrl, sameTarget, safeDraftPrLink, isRunActive, evidenceText, isRepositoryPickerTarget, approvalCopy, runPollDelay } from '../src/workflows/agent-model';
const target={owner:'owner',repo:'repo',number:7};
describe('agent builder model',()=>{
 it('creates executable validated review and code-fix templates without claiming execution',()=>{
  for(const t of AGENT_TEMPLATES){const d=makeAgentTemplate(t.id,target);expect(WorkflowDefinition.safeParse(d).success).toBe(true);expect(d.mode).toBe(t.mode);expect(d.steps[0]?.kind).toBe('context');}
 });
 it('keeps context first and code patch/test/publish dependencies ordered',()=>{
  const fix=makeAgentTemplate('fix',target);
  expect(toggleAgentStep(fix,'context')).toBeNull();expect(toggleAgentStep(fix,'qa')).toBeNull();
  expect(moveAgentStep(fix,0,1)).toBeNull();expect(moveAgentStep(fix,fix.steps.findIndex(x=>x.kind==='qa'),-1)).toBeNull();
  expect(toggleAgentStep(fix,'risk')?.steps.find(x=>x.kind==='risk')?.enabled).toBe(false);
 });
 it('parses only direct bounded PR targets and safe draft PR destinations',()=>{
  expect(targetFromPrUrl('https://github.com/owner/repo/pull/7')).toEqual(target);
  expect(targetFromPrUrl('https://github.com.evil.test/owner/repo/pull/7')).toBeNull();
  expect(safeDraftPrLink('https://github.com/owner/repo/pull/8',target)).toBe('https://github.com/owner/repo/pull/8');
  for(const url of ['https://github.com/other/repo/pull/8','javascript:alert(1)','https://github.com/owner/repo/pull/8?token=x'])expect(safeDraftPrLink(url,target)).toBeNull();
 });
 it('accepts issue/repository coding targets while requiring PRs for review templates',()=>{
  const issue=targetFromUrl('https://github.com/owner/repo/issues/9')!;
  const repo=targetFromUrl('https://github.com/owner/repo')!;
  expect(issue).toEqual({owner:'owner',repo:'repo',kind:'issue',number:9});
  expect(repo).toEqual({owner:'owner',repo:'repo',kind:'repository'});
  expect(isRepositoryPickerTarget(repo)).toBe(true);expect(isRepositoryPickerTarget(target)).toBe(false);
  for(const t of [issue,repo]){const fix=makeAgentTemplate('fix',t);expect(fix.steps.map(s=>s.kind)).toEqual(['context','patch','qa','draft_pr','route']);}
  expect(()=>makeAgentTemplate('review',issue)).toThrow();
  for(const url of ['https://github.com/owner/repo/issues/0','https://github.com/owner/repo?token=x','https://github.com/owner/repo/tree/main','https://github.com/owner/repo/pull/1#x'])expect(targetFromUrl(url)).toBeNull();
  expect(sameTarget({owner:'Owner',repo:'Repo',kind:'repository'},repo)).toBe(true);
 });
 it('treats waiting as active, blocked/failed as terminal, and bounds output text',()=>{
  expect(isRunActive('waiting_executor')).toBe(true);expect(isRunActive('blocked')).toBe(false);expect(isRunActive('failed')).toBe(false);
  expect(evidenceText('x'.repeat(5000))).toHaveLength(4000);
 });
});
describe('approval copy for board card runs',()=>{
 const steps=(qaTitle:string)=>[{id:'qa',kind:'qa' as const,title:qaTitle,status:'pending' as const}];
 it('says no tests run for a board card run, and keeps the QA line for other runs',()=>{
  const board={definition:{name:'Board card: Fix README'} as never,steps:steps('Tests (not run in this version)')};
  expect(approvalCopy(board).action).toBe('Action create a draft PR (no tests are run in this beta)');
  expect(approvalCopy(board).note).not.toMatch(/after QA passes/);
  const other={definition:{name:'Board card: look-alike'} as never,steps:steps('Run tests')};
  expect(approvalCopy(other).action).toBe('Action QA and create a draft PR');
  expect(approvalCopy({definition:{name:'Fix bug'} as never,steps:steps('Tests (not run in this version)')}).note).toMatch(/after QA passes/);
 });
});
describe('run polling',()=>{
 it('polls a run waiting for approval every 15 seconds and a working run every 2 seconds',()=>{
  expect(runPollDelay('waiting_approval')).toBe(15000);
  expect(runPollDelay('running')).toBe(2000);
  expect(runPollDelay('queued')).toBe(2000);
 });
});
