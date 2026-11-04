import React, { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import type { WorkflowRun } from '@mergemate/contracts';
import { Text } from '../components/Text';
import { Icon, type IconName } from '../components/Icon';
import { Button } from '../components/Button';
import { useTheme } from '../context/ThemeContext';
import { AGENT_STEP_META, displayRunStatus, evidenceText, isRunActive, safeDraftPrLink } from './agent-model';
import type { PatchProposalValue } from './api';
import { allPatchFilesReviewed } from './patch-review';

export function AgentRunPanel({ run, cancelling, passkeyBusy, passkeysAvailable, proposal, onCancel, onRetry, onRegisterPasskey, onApprovePatch, onOpenWebApproval }: { run: WorkflowRun; cancelling: boolean; passkeyBusy:boolean; passkeysAvailable:boolean; proposal:PatchProposalValue|null; onCancel: () => void; onRetry: () => void; onRegisterPasskey:()=>void; onApprovePatch:()=>void; onOpenWebApproval:()=>void }) {
  const { colors, typography } = useTheme();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [reviewedPatchPaths,setReviewedPatchPaths]=useState<string[]>([]);
  useEffect(()=>setReviewedPatchPaths([]),[proposal?.patchHash]);
  const complete = run.steps.filter(step => step.status === 'succeeded' || step.status === 'skipped').length;
  const statusColor = run.status === 'succeeded' ? colors.riskLow : run.status === 'failed' ? colors.riskHigh : colors.brandLight;
  const patchReviewed=allPatchFilesReviewed(proposal,reviewedPatchPaths);
  return <View style={{ gap: 10 }}>
    <View style={{ padding: 14, backgroundColor: colors.brandSubtle, borderColor: colors.brandMuted, borderWidth: 1, borderRadius: 16, gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="pulse-outline" size={14} color={colors.brandLight} />
          <Text style={[typography.code, { color: colors.brandLight, fontSize: 10 }]}>EXECUTION RECEIPT</Text>
        </View>
        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: statusColor, fontWeight: '700' }]}>{displayRunStatus(run.status)}</Text>
        </View>
      </View>
      <Text accessibilityRole="header" style={[typography.title2, { color: colors.text }]}>{run.definition.name}</Text>
      <Text style={[typography.caption, { color: colors.textSecondary }]}>{complete} of {run.steps.length} steps finished · {run.definition.target.owner}/{run.definition.target.repo}</Text>
      <Text selectable style={[typography.code, { color: colors.textSecondary, fontSize: 11 }]}>Pinned target commit {run.headSha}</Text>
      <Text selectable style={[typography.caption, { color: colors.textSecondary }]}>Run {run.id}</Text>
      {!!run.error && <Text accessibilityRole="alert" style={[typography.footnote, { color: colors.riskHigh }]}>{run.error}</Text>}
      {run.status==='waiting_approval'&&<View style={{gap:10,padding:12,borderRadius:12,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.brandMuted}}>
        <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Icon name="finger-print-outline" size={20} color={colors.brandLight}/><Text style={[typography.subhead,{color:colors.text,fontWeight:'700'}]}>Approve the exact generated patch</Text></View>
        {proposal?<>
          <Text style={[typography.footnote,{color:colors.textSecondary}]}>{proposal.summary}</Text>
          <View style={{gap:3,padding:10,borderRadius:10,backgroundColor:colors.surfaceElevated}}>
            <Text selectable style={[typography.code,{color:colors.textSecondary,fontSize:11}]}>Repository {proposal.repository}</Text>
            <Text selectable style={[typography.code,{color:colors.textSecondary,fontSize:11}]}>Pinned head {proposal.headSha}</Text>
            <Text style={[typography.code,{color:colors.textSecondary,fontSize:11}]}>Action QA and create a draft PR</Text>
            <Text selectable style={[typography.code,{color:colors.textSecondary,fontSize:10}]}>Patch {proposal.patchHash}</Text>
          </View>
          <View style={{gap:8}}>{proposal.changes.map((change,index)=>{const open=reviewedPatchPaths.includes(change.path);return <View key={change.path} style={{borderWidth:1,borderColor:open?colors.brandMuted:colors.border,borderRadius:10,overflow:'hidden'}}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${open?'Hide reviewed':'Review'} generated file ${change.path}`} accessibilityState={{expanded:open}} onPress={()=>setReviewedPatchPaths(old=>old.includes(change.path)?old.filter(path=>path!==change.path):[...old,change.path])} style={{minHeight:44,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:colors.surfaceElevated}}>
              <Icon name={open?'checkmark-circle-outline':'document-text-outline'} size={18} color={open?colors.riskLow:colors.brandLight}/>
              <Text numberOfLines={2} style={[typography.code,{color:colors.text,flex:1,fontSize:11}]}>{index+1}. {change.path}</Text>
              <Icon name={open?'chevron-up':'chevron-down'} size={16} color={colors.textSecondary}/>
            </Pressable>
            {open&&<View style={{padding:10,borderTopWidth:1,borderTopColor:colors.border,backgroundColor:colors.background}}><Text selectable style={[typography.code,{color:colors.text,fontSize:11}]}>{change.content}</Text></View>}
          </View>;})}</View>
          <Text accessibilityLiveRegion="polite" style={[typography.caption,{color:patchReviewed?colors.riskLow:colors.textSecondary}]}>{reviewedPatchPaths.length} of {proposal.changes.length} exact files inspected</Text>
        </>:<Text style={[typography.footnote,{color:colors.textSecondary}]}>Loading the patch contents and binding...</Text>}
        {passkeysAvailable?<View style={{gap:8}}><Button title="Approve exact patch" disabled={!patchReviewed||passkeyBusy} loading={passkeyBusy} onPress={onApprovePatch}/><Button title="Register a passkey" variant="secondary" disabled={passkeyBusy} onPress={onRegisterPasskey}/></View>:<Button title="Open web app to inspect and approve" disabled={!proposal} onPress={onOpenWebApproval}/>}<Text style={[typography.caption,{color:colors.textSecondary}]}>Approval binds this repository, commit and patch hash. MergeMate publishes only a draft PR after QA passes.</Text>
      </View>}
      {isRunActive(run.status) ? <Button title="Cancel run" variant="secondary" loading={cancelling} onPress={onCancel} /> : ['failed','blocked','cancelled'].includes(run.status) ? <Button title="Review and retry workflow" variant="secondary" onPress={onRetry} /> : null}
    </View>
    {run.steps.map((step, index) => {
      const open = expanded.includes(step.id);
      const meta = AGENT_STEP_META[step.kind];
      const draftLink = safeDraftPrLink(step.evidence?.draftPrUrl, run.definition.target);
      const hasDetails = !!(step.output || step.error || step.evidence);
      return <View key={step.id}>
        {index > 0 && <View style={{ marginLeft: 28, height: 14, borderLeftWidth: 1.5, borderStyle: 'dashed', borderColor: colors.brandMuted }} />}
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: step.status === 'running' ? colors.brandLight : colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }}>
              <Icon name={(step.status === 'succeeded' ? 'checkmark-outline' : step.status === 'failed' ? 'alert-outline' : meta.icon) as IconName} size={17} color={step.status === 'failed' ? colors.riskHigh : step.status === 'succeeded' ? colors.riskLow : colors.brandLight} />
            </View>
            <View style={{ flex: 1 }}><Text style={[typography.subhead, { color: colors.text, fontWeight: '700' }]}>{step.title}</Text><Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>{displayRunStatus(step.status)}</Text></View>
            {hasDetails && <Pressable accessibilityRole="button" accessibilityLabel={`${open ? 'Hide' : 'Inspect'} ${step.title} result`} accessibilityState={{ expanded: open }} onPress={() => setExpanded(old => old.includes(step.id) ? old.filter(id => id !== step.id) : [...old, step.id])} style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name={open ? 'chevron-up' : 'chevron-down'} size={17} color={colors.textSecondary} /></Pressable>}
          </View>
          {!!step.error && <Text accessibilityRole="alert" style={[typography.footnote, { color: colors.riskHigh }]}>{step.error}</Text>}
          {open && <View style={{ gap: 8 }}>
            {!!step.output && <Text selectable style={[typography.footnote, { color: colors.textSecondary }]}>{evidenceText(step.output)}</Text>}
            {!!step.evidence && <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: 10, padding: 10, gap: 6 }}><Text style={[typography.caption, { color: colors.brandLight }]}>Evidence reported by the runtime</Text><Text selectable style={[typography.code, { color: colors.textSecondary, fontSize: 11 }]}>{evidenceText(step.evidence)}</Text></View>}
          </View>}
          {draftLink && <Button title="Open generated draft PR" variant="secondary" onPress={() => Linking.openURL(draftLink)} />}
        </View>
      </View>;
    })}
    <Text style={[typography.caption, { color: colors.textSecondary }]}>Results come from the configured backend and executor. Existing GitHub checks and newly executed tests are separate evidence. A completed run never merges a PR.</Text>
  </View>;
}
