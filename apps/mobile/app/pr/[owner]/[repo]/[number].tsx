import {useAuth} from '../../../../src/context/AuthContext';
import {usePrWorkspace} from '../../../../src/hooks/usePrWorkspace';
import {discussionGroups} from '../../../../src/workspace/state';
import {githubUrl} from '../../../../src/api/urls';
import {ReadoutControls} from "../../../../src/components/ReadoutControls";
import {narrationSentences} from "../../../../src/readout/text";
import { Avatar } from "../../../../src/components/Avatar";
import { relativeTime } from "../../../../src/format/activity";
import { SummarySection } from "../../../../src/components/SummarySection";
import React, { useState, useEffect, useRef } from "react";
import { View, ScrollView, TouchableOpacity, TextInput, StyleSheet, Linking, Share, Platform, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAndroidBackHandler } from "../../../../src/platform/android";
import { Text } from "../../../../src/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useLayout } from "../../../../src/layout/useLayout";
import { useTheme } from "../../../../src/context/ThemeContext";
import { aiNoticeAction } from "../../../../src/api/aiRetry";
import { useConsent } from "../../../../src/context/ConsentContext";
import { Header } from "../../../../src/components/Header";
import { StatusPill } from "../../../../src/components/StatusPill";
import { RiskBadge } from "../../../../src/components/RiskBadge";
import { riskAssessmentText } from "../../../../src/api/mappers";
import { AIBlock } from "../../../../src/components/AIBlock";
import { Button } from "../../../../src/components/Button";
import { EmptyState } from "../../../../src/components/EmptyState";
import { ErrorState } from "../../../../src/components/ErrorState";
import { LoadingState } from "../../../../src/components/LoadingState";
import { Icon } from "../../../../src/components/Icon";
import { DiffView } from "../../../../src/components/DiffView";
import { MergeStateChip } from "../../../../src/components/MergeStateChip";

export default function PrDetailScreen(){
 const {owner,repo,number}=useLocalSearchParams<{owner:string;repo:string;number:string}>(),{user}=useAuth();
 if(!owner||!repo||!number||!/^[-A-Za-z0-9_.]{1,100}$/.test(owner)||!/^[-A-Za-z0-9_.]{1,100}$/.test(repo)||[owner,repo].some(value=>value==='.'||value==='..')||!/^[1-9]\d{0,9}$/.test(number))return <View style={{flex:1}}><Header title="PR Review Detail" showBack/><ErrorState title="Invalid pull request" message="Open a valid pull request from your Inbox."/></View>;
 return user?<PrWorkspace key={`${user.id}:${owner}/${repo}#${number}`} owner={owner} repo={repo} number={number}/>:<LoadingState title="Checking your session..." message="Verifying access before showing this pull request."/>;
}
function PrWorkspace({owner,repo,number}:{owner:string;repo:string;number:string}){
  const { colors, typography, spacing, radius } = useTheme();
  const {isDesktop}=useLayout();
  const { aiConsentGranted } = useConsent();
  const router = useRouter();

  const [assessmentOpen,setAssessmentOpen]=useState(false);
  const [expandedFiles,setExpandedFiles]=useState<string[]>([]);
  const {detail,isLoading,isRefreshing,error,loadPr,loadPage,pageBusy,pageError,capped,fileCursor,commentCursor,checkCursor,retryAi,aiRetrying}=usePrWorkspace(owner,repo,Number(number),aiConsentGranted);
  const [fileWrap,setFileWrap]=useState<Record<string,boolean>>({}),[collapsedThreads,setCollapsedThreads]=useState<string[]>([]),[linkError,setLinkError]=useState<string|null>(null);
  const scroll=useRef<React.ComponentRef<typeof ScrollView>>(null),scrollOffset=useRef(0);
  useEffect(()=>{setExpandedFiles([]);setCollapsedThreads([]);},[detail?.headSha]);
  useEffect(()=>{if(!detail||isLoading)return;const frame=requestAnimationFrame(()=>scroll.current?.scrollTo({y:scrollOffset.current,animated:false}));return()=>cancelAnimationFrame(frame);},[isLoading]);
  const [notes, setNotes] = useState<string[]>([]);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [newNote, setNewNote] = useState("");
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === "web" ? 0 : insets.bottom;

  useAndroidBackHandler(() => {
    if (showNoteInput) {
      setShowNoteInput(false);
      return true;
    }
    if (assessmentOpen) {
      setAssessmentOpen(false);
      return true;
    }
    return false;
  }, showNoteInput || assessmentOpen);

  const handleShare = async () => {
    const url=githubUrl(detail?.htmlUrl);if(detail&&url){try{await Share.share({
        message: `${detail.title} (${detail.owner}/${detail.repo}#${detail.number})\n${url}`,
      });}catch{setLinkError("Sharing is unavailable. Open this PR in GitHub instead.");}
    }
  };

  const openLink=async(value:string|undefined)=>{setLinkError(null);const url=githubUrl(value);if(!url){setLinkError('This GitHub link is unavailable.');return;}try{await Linking.openURL(url);}catch{setLinkError('Could not open GitHub. Try again.');}};
  const openInGitHub=()=>void openLink(detail?.htmlUrl);

  const addLocalNote = () => {
    if (newNote.trim()) {
      setNotes((prev) => [...prev, newNote.trim()]);
      setNewNote("");
      setShowNoteInput(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.root, { backgroundColor: colors.background }]}>
      <Header
        title="PR Review Detail"
        showBack
        rightAction={
          <TouchableOpacity
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Share pull request"
            disabled={!detail?.htmlUrl}
            style={styles.shareBtn}
          >
            <Icon name="share-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        }
      />

      {isLoading ? (
        <LoadingState
          title="Loading pull request..."
          message="Checking GitHub access and pull request metadata."
        />
      ) : error&&!detail ? (
        <ErrorState
          title="Couldn't load pull request"
          message={error}
          onRetry={()=>void loadPr()}
        />
      ) : !detail ? (
        <EmptyState
          icon="document-text-outline"
          title="Pull request not found"
          message="This pull request may have been removed or moved in GitHub."
          actionTitle="Try Again"
          onAction={()=>void loadPr()}
        />
      ) : (
        <>
          <ScrollView testID="pr-workspace-scroll" ref={scroll} onScroll={event=>{scrollOffset.current=event.nativeEvent.contentOffset.y;}} scrollEventThrottle={16} contentContainerStyle={{ padding:isDesktop?24:spacing.base, paddingBottom:120 }}>
            <ReadoutControls label="Pull request summary" sentences={narrationSentences([...(detail.summary?[detail.summary.whatChanged,detail.summary.whyItMatters,...detail.summary.suggestedFocus]:[]),...(detail.risk?[`Risk level: ${detail.risk.level}.`,...detail.risk.reasons]:[])])}/>

            <Button title="Refresh workspace" variant="ghost" loading={isRefreshing} onPress={()=>void loadPr()}/>
            {(error||linkError)&&<Text accessibilityRole="alert" style={{color:colors.riskHigh,padding:12}}>{error??linkError}</Text>}
            {/* PR Header */}
            <View style={[styles.headerCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
              <View style={styles.topRow}>
                <Text style={[typography.caption, { color: colors.textMuted, fontFamily: typography.code.fontFamily }]}>
                  {detail.owner}/{detail.repo} · #{detail.number}
                </Text>
                <StatusPill status={detail.status} />
              </View>

              <Text
                style={[typography.title2, { color: colors.text, marginTop: spacing.xs }]}
                accessibilityRole="header"
              >
                {detail.title}
              </Text>
              {detail.mergeState && (
                <View style={{ marginTop: spacing.sm }}>
                  <MergeStateChip state={detail.mergeState} />
                </View>
              )}

            </View>
            <View style={{flexDirection:"row",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:12}}>
              <View style={{flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:10,paddingVertical:5,borderRadius:9999,backgroundColor:colors.surfaceElevated,maxWidth:"70%"}}><Icon name="git-branch-outline" size={14} color={colors.brandLight}/><Text style={[typography.code,{color:colors.brandLight,fontSize:11,flexShrink:1}]}>{detail.headBranch}</Text></View>
              <Icon name="arrow-forward" size={16} color={colors.textSecondary}/>
              <View style={{paddingHorizontal:10,paddingVertical:5,borderRadius:9999,backgroundColor:colors.surfaceElevated}}><Text style={[typography.code,{color:colors.textSecondary,fontSize:11}]}>{detail.baseBranch}</Text></View>
            </View>
            <View style={{flexDirection:"row",gap:8,alignItems:"center",marginVertical:16,flexWrap:"wrap"}}><Avatar login={detail.author} size={24}/><Text style={[typography.footnote,{color:colors.textSecondary}]}>{detail.author} · {relativeTime(detail.createdAt)}</Text><View style={{flexDirection:"row",gap:8,marginLeft:"auto"}}><Text style={[typography.code,{color:colors.riskLow}]}>+{detail.additions}</Text><Text style={[typography.code,{color:colors.riskHigh}]}>-{detail.deletions}</Text></View></View>

            {/* US-25: Secret Leak Warning Banner */}
            {detail.secretWarning && (
              <View
                style={[
                  styles.secretBanner,
                  {
                    backgroundColor: colors.secretWarningBg,
                    borderColor: colors.secretWarning,
                    borderRadius: radius.md,
                    marginTop: spacing.sm,
                  },
                ]}
                accessibilityRole="alert"
              >
                <View style={styles.secretTitleRow}>
                  <Icon name="warning" size={18} color={colors.secretWarning} />
                  <Text style={[typography.headline, { color: colors.secretWarning, fontWeight: "700" }]}>
                    POSSIBLE SECRET DETECTED
                  </Text>
                </View>
                <Text style={[typography.footnote, { color: colors.text, marginTop: 4, lineHeight: 18 }]}>
                  Pattern matched {detail.secretWarning.rule} at {detail.secretWarning.file}:
                  {detail.secretWarning.line}. Raw secret values are always masked and never sent to AI.
                </Text>
                <View style={[styles.codeBox, { backgroundColor: "rgba(0,0,0,0.45)", borderRadius: radius.sm, marginTop: 6 }]}>
                  <Text style={[typography.code, { color: "#FEE2E2" }]}>
                    {detail.secretWarning.maskedSnippet}
                  </Text>
                </View>
                {(detail.risk?.secretFindings?.length ?? 0) > 1 && (
                  <Text style={[typography.footnote, { color: colors.text, marginTop: 6 }]} selectable>
                    Also at {detail.risk!.secretFindings!.slice(1, 6).map((finding) => `${finding.file}:${finding.line}`).join(", ")}
                    {detail.risk!.secretFindings!.length > 6 ? ` and ${detail.risk!.secretFindings!.length - 6} more` : ""}.
                  </Text>
                )}
              </View>
            )}

            <View style={isDesktop ? styles.analysisGrid : undefined}>
            <View style={isDesktop ? {flex:1.45,minWidth:0} : undefined}>
            {/* AI Summary Card (US-09) */}
            {detail.summary && (
              <View style={{ marginTop: spacing.sm }}>
                <AIBlock title="AI Summary" coverage={detail.summary.coverage}>
                  <SummarySection title="What changed" icon="swap-horizontal-outline"><Text style={[typography.body,{color:colors.text}]}>{detail.summary.whatChanged}</Text></SummarySection>
                  <SummarySection title="Why it matters" icon="shield-outline"><Text style={[typography.body,{color:colors.text}]}>{detail.summary.whyItMatters}</Text></SummarySection>
                  <SummarySection title="Suggested focus" icon="scan-outline">{detail.summary.suggestedFocus.map((focus,index)=><Text key={index} style={[typography.body,{color:colors.text}]}>{focus}</Text>)}</SummarySection>
                </AIBlock>
              </View>
            )}

            {/* Why the AI parts are missing: not turned on, turned off, over the limit or unavailable */}
            {detail.aiNotice && (
              <View style={{ marginTop: spacing.sm }}>
                {detail.aiNotice.code === "consent_required" && !detail.summary ? (
                  <AIBlock title="AI Summary">
                    <Text style={[typography.body, { color: colors.text }]}>{detail.aiNotice.message}</Text>
                    <Button title="Open Settings" variant="secondary" onPress={()=>router.push("/(tabs)/settings")} style={{marginTop:12,alignSelf:"flex-start"}}/>
                  </AIBlock>
                ) : (
                  <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.lg }]}>
                    <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
                      AI summary unavailable
                    </Text>
                    <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4 }]} accessibilityLiveRegion="polite">
                      {detail.aiNotice.message}
                    </Text>
                    {aiNoticeAction(detail.aiNotice.code)==="retry" && <Button title="Try again" variant="secondary" loading={aiRetrying} onPress={retryAi} style={{marginTop:12,alignSelf:"flex-start"}} accessibilityLabel="Try the AI summary again"/>}
                    {aiNoticeAction(detail.aiNotice.code)==="settings" && <Button title="Open Settings" variant="secondary" onPress={()=>router.push("/(tabs)/settings")} style={{marginTop:12,alignSelf:"flex-start"}}/>}
                  </View>
                )}
              </View>
            )}

            </View>
            <View style={isDesktop ? {flex:1,minWidth:0} : undefined}>
            {/* Risk Assessment Card (US-10) */}
            {detail.risk && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.sm }]}>
                <View style={[styles.riskHeader,{flexWrap:"wrap",gap:8}]}>
                  <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
                    Risk Assessment
                  </Text>
                  <RiskBadge level={detail.risk.level} secretWarning={detail.secretWarning} />
                </View>

                <View style={{ marginTop: spacing.sm }}>
                  {detail.risk.reasons.map((reason: string, idx: number) => (
                    <View key={idx} style={styles.reasonRow}>
                      <Icon
                        name="ellipse"
                        size={8}
                        color={detail.risk!.level === "high" ? colors.riskHigh : detail.risk!.level === "medium" ? colors.riskMedium : colors.riskLow}
                        style={styles.reasonDot}
                      />
                      <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{reason}</Text>
                    </View>
                  ))}
                </View>

                {detail.risk.quality?.needsCloserLook && (
                  <View style={{marginTop:12}}>
                    <Text style={[typography.subhead,{color:colors.text,fontWeight:"600"}]} accessibilityRole="header">Needs a closer look</Text>
                    {detail.risk.quality.reasons.map((reason,idx)=><Text key={idx} style={[typography.footnote,{color:colors.textSecondary,marginTop:4}]}>{reason}</Text>)}
                  </View>
                )}

                <TouchableOpacity accessibilityRole="button" accessibilityLabel="How this was assessed" accessibilityState={{expanded:assessmentOpen}} aria-expanded={assessmentOpen} onPress={()=>setAssessmentOpen(open=>!open)} style={{flexDirection:"row",alignItems:"center",gap:8,minHeight:44,padding:12,marginTop:12,backgroundColor:colors.surfaceElevated,borderRadius:12}}><Icon name="information-circle-outline" size={18} color={colors.brandLight}/><Text style={[typography.footnote,{color:colors.textSecondary,flex:1}]}>How this was assessed</Text><Icon name={assessmentOpen?'chevron-up':'chevron-down'} size={16} color={colors.textSecondary}/></TouchableOpacity>
                {assessmentOpen && <Text style={[typography.footnote,{color:colors.textSecondary,padding:12}]}>{riskAssessmentText(detail.risk.assessedBy)}</Text>}
              </View>
            )}

            {/* CI Checks List */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.sm }]}>
              <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
                Checks ({detail.checks.filter((c) => c.conclusion === "success").length}/{detail.checks.length} loaded)
              </Text>
              {detail.checks.length === 0 ? (
                <Text style={[typography.footnote, { color: colors.textMuted, marginTop: spacing.xs }]}>
                  {checkCursor?"Checks are still being loaded. Continue checking all pages.":"No status checks have been reported for this pull request."}
                </Text>
              ) : (
                <View style={{ marginTop: spacing.xs }}>
                  {detail.checks.map((chk) => (
                    <View key={chk.id} style={styles.checkRow}>
                      <Icon
                        name={
                          chk.conclusion === "success"
                            ? "checkmark-circle"
                            : chk.conclusion === "failure"
                              ? "close-circle"
                              : "ellipsis-horizontal-circle-outline"
                        }
                        size={18}
                        color={chk.conclusion === "success" ? colors.riskLow : chk.conclusion === "failure" ? colors.riskHigh : colors.textMuted}
                      />
                      <Text style={[typography.subhead, { color: colors.text, flex: 1 }]}>{chk.name}</Text>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>{chk.status==='completed'?chk.conclusion:chk.status}</Text>{chk.url&&<Button title="Open check in GitHub" variant="ghost" onPress={()=>openLink(chk.url)}/>}
                    </View>
                  ))}
                </View>
              )}
              {checkCursor&&<Button title={detail.checks.length?'Load more checks':'Load checks'} loading={pageBusy.checks} onPress={()=>loadPage('checks')} variant="ghost"/>}
              {pageError.checks&&<Text accessibilityRole="alert" style={{color:colors.riskHigh}}>{pageError.checks}</Text>}
              {capped.checks&&<Text style={{color:colors.textSecondary}}>Check pagination limit reached. Open this PR in GitHub for the full history.</Text>}
            </View>

            </View>
            </View>
            {/* Changed Files List */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.sm }]}>
              <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
                Files Changed ({detail.changedFilesCount})
              </Text>
              {detail.files.length === 0 ? (
                <Text style={[typography.footnote, { color: colors.textMuted, marginTop: spacing.xs }]}>
                  {detail.changedFilesCount ? "Load changed files when you are ready to review them." : "No changed files reported for this pull request."}
                </Text>
              ) : (
                <View style={{ marginTop: spacing.xs }}>
                  {detail.files.map((file) => (
                    <View testID={`workspace-file-${file.filename}`} key={file.filename} style={{marginTop:12,backgroundColor:colors.surfaceElevated,borderRadius:8,overflow:"hidden"}}>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Toggle diff for ${file.filename}`} accessibilityState={{expanded:expandedFiles.includes(file.filename)}} aria-expanded={expandedFiles.includes(file.filename)} onPress={()=>setExpandedFiles(prev=>prev.includes(file.filename)?prev.filter(name=>name!==file.filename):[...prev,file.filename])} style={{flexDirection:"row",alignItems:"center",padding:12,gap:8,minHeight:48}}><Icon name={expandedFiles.includes(file.filename)?"chevron-down":"chevron-forward"} size={16} color={colors.textSecondary}/><Text style={[typography.code,{color:colors.text,flex:1}]}>{file.filename} · {file.status}</Text><Text style={[typography.code,{color:colors.riskLow,fontSize:11}]}>+{file.additions}</Text><Text style={[typography.code,{color:colors.riskHigh,fontSize:11}]}>-{file.deletions}</Text></TouchableOpacity>
                      {file.previousPath&&<Text style={{color:colors.textSecondary,paddingHorizontal:12}}>Previously: {file.previousPath}</Text>}
                      {expandedFiles.includes(file.filename)&&file.patchState==='partial'&&<Text accessibilityRole="alert" style={{color:colors.textSecondary,padding:12}}>Partial patch: this is not the complete diff. Open this PR in GitHub for the full file.</Text>}
                      {expandedFiles.includes(file.filename) && (file.patchSnippet ? <DiffView patch={file.patchSnippet} wrap={fileWrap[file.filename]??true} onWrapChange={wrap=>setFileWrap(old=>({...old,[file.filename]:wrap}))}/> : <Text style={[typography.code,{color:colors.textSecondary,padding:12,borderTopWidth:1,borderTopColor:colors.border}]}>Patch unavailable: the file may be binary, empty or too large for GitHub to include. Open this PR in GitHub.</Text>)}
                    </View>
                  ))}
                </View>
              )}
            </View>

            {fileCursor && <Button title={detail.files.length?'Load more files':'Load files'} loading={pageBusy.files} onPress={()=>loadPage('files')} variant="secondary"/>}
            {capped.files&&<Text style={{color:colors.textSecondary}}>File pagination limit reached. Open this PR in GitHub for remaining files.</Text>}
            {pageError.files && <Text accessibilityRole="alert" style={[typography.footnote,{color:colors.riskHigh,padding:16}]}>{pageError.files}</Text>}
            <View style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border,borderRadius:radius.lg,marginTop:16}]}>
              <Text accessibilityRole="header" style={[typography.headline,{color:colors.text}]}>Conversation</Text>
              {discussionGroups(detail.comments).map(group=><View key={group.id} style={{paddingVertical:12,borderBottomWidth:1,borderBottomColor:colors.border}}><TouchableOpacity accessibilityRole="button" accessibilityLabel={group.kind==='conversation'?'Toggle PR conversation':group.kind==='review-summary'?`Toggle submitted review by ${group.comments[0]?.author??'reviewer'}`:`Toggle review discussion for ${group.path??'file unavailable'}${group.line?` line ${group.line}`:''}`} accessibilityState={{expanded:!collapsedThreads.includes(group.id)}} aria-expanded={!collapsedThreads.includes(group.id)} onPress={()=>setCollapsedThreads(old=>old.includes(group.id)?old.filter(id=>id!==group.id):[...old,group.id])} style={{minHeight:44,justifyContent:'center'}}><Text style={[typography.subhead,{color:colors.text}]}>{group.kind==='conversation'?'PR conversation':group.kind==='review-summary'?`Review: ${(group.reviewState??'submitted').toLowerCase().replaceAll('_',' ')}`:`Review discussion · ${group.path??'file unavailable'}${group.line?`:${group.line}`:''}${group.outdated?' (outdated)':''}`}</Text></TouchableOpacity>{!collapsedThreads.includes(group.id)&&group.comments.map(comment=><View key={comment.id} style={{paddingVertical:8}}><Text style={[typography.footnote,{color:colors.textSecondary}]}>@{comment.author} · {relativeTime(comment.createdAt)}</Text><Text selectable style={[typography.body,{color:colors.text,marginTop:4}]}>{comment.body||'No review message.'}</Text></View>)}</View>)}
              {commentCursor?<Button title="Load comments" loading={pageBusy.comments} onPress={()=>loadPage('comments')} variant="ghost"/>:detail.comments.length===0?<Text style={[typography.footnote,{color:colors.textSecondary}]}>No comments.</Text>:null}
              {capped.comments&&<Text style={{color:colors.textSecondary}}>Discussion pagination limit reached. Open this PR in GitHub for the full history.</Text>}
              {pageError.comments && <Text accessibilityRole="alert" style={[typography.footnote,{color:colors.riskHigh,paddingTop:12}]}>{pageError.comments}</Text>}
            </View>

            {/* Inline Note Editor */}
            {showNoteInput && (
              <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.sm }]}>
                <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
                  Add Private Note
                </Text>
                <TextInput
                  value={newNote}
                  onChangeText={setNewNote}
                  placeholder="Write a personal review note..."
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Personal review note"
                  style={[
                    styles.noteInput,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                      borderRadius: radius.md,
                      marginTop: spacing.xs,
                    },
                  ]}
                />
                <View style={styles.noteActions}>
                  <Button
                    title="Cancel"
                    onPress={() => {
                      setShowNoteInput(false);
                      setNewNote("");
                    }}
                    variant="secondary"
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Save Note"
                    onPress={addLocalNote}
                    variant="primary"
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            )}

            {/* Local Notes */}
            {notes.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.sm }]}>
                <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
                  My Notes ({notes.length})
                </Text>
                {notes.map((note, idx) => (
                  <Text key={idx} style={[typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
                    • {note}
                  </Text>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Bottom Bar: Open in GitHub and Add note. STRICTLY NO MERGE, APPROVE, OR COMMENT CONTROLS ON GITHUB (US-12) */}
          <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: 16 + bottomInset }]}>
            <Button
              title={showNoteInput ? "Hide Note" : "Add Note"}
              onPress={() => setShowNoteInput((prev) => !prev)}
              variant="secondary"
              style={{ flex: 1 }}
            />
            <Button
              title="Open in GitHub ↗"
              onPress={openInGitHub}
              disabled={!detail.htmlUrl}
              variant="primary"
              style={{ flex: 2 }}
            />
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  analysisGrid: { flexDirection:"row",gap:16,alignItems:"flex-start" },
  root: {
    flex: 1,
  },
  shareBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCard: {
    padding: 4,
    borderWidth: 0,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
  secretBanner: {
    padding: 14,
    borderWidth: 1,
  },
  secretTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reasonDot: {
    marginTop: 6,
  },
  codeBox: {
    padding: 8,
  },
  card: {
    padding: 16,
    borderWidth: 1,
  },
  riskHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 4,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  noteInput: {
    fontFamily: "Geist_400Regular",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  noteActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
});
