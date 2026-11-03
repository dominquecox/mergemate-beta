import { describe, it, expect } from 'vitest';
import { WorkflowDefinition } from '@mergemate/contracts';
import { AGENT_TEMPLATES, makeAgentTemplate, moveAgentStep, toggleAgentStep, targetFromPrUrl, safeDraftPrLink, isRunActive, evidenceText } from '../src/workflows/agent-model';
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
 it('treats waiting as active, blocked/failed as terminal, and bounds output text',()=>{
  expect(isRunActive('waiting_executor')).toBe(true);expect(isRunActive('blocked')).toBe(false);expect(isRunActive('failed')).toBe(false);
  expect(evidenceText('x'.repeat(5000))).toHaveLength(4000);
 });
});
