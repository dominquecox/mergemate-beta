import {QaEvidenceCard} from "../../../../src/components/QaEvidenceCard";
import {useNoteKeyboardScroll} from "../../../../src/hooks/useNoteKeyboardScroll";
import {MetaTelemetryModal} from '../../../../src/components/MetaTelemetryModal';
import {useAgentGuardrails} from '../../../../src/hooks/useAgentGuardrails';
import {PrRiskPanel} from "../../../../src/components/PrRiskPanel";
import {PrSecretBanner} from "../../../../src/components/PrSecretBanner";
import {ExecutiveActionBar} from "../../../../src/components/ExecutiveActionBar";
import {PrVisualDiffSection} from "../../../../src/components/PrVisualDiffSection";
import {PrivateNotes} from "../../../../src/components/PrivateNotes";
import {useAuth} from '../../../../src/context/AuthContext';
import {usePrWorkspace} from '../../../../src/hooks/usePrWorkspace';
import {discussionGroups} from '../../../../src/workspace/state';
import {githubUrl} from '../../../../src/api/urls';
import {AudioCommuteBar} from "../../../../src/components/AudioCommuteBar";
import {prExecutiveNarration} from "../../../../src/readout/narration";
import { Avatar } from "../../../../src/components/Avatar";
import { relativeTime } from "../../../../src/format/activity";
import { AskPrCard, ReviewPlanCard } from "../../../../src/components/ReviewCopilot";
import { BlastRadiusChips } from "../../../../src/components/BlastRadiusChips";
import { SummarySection, ExecutiveSummaryText } from "../../../../src/components/SummarySection";
import { GitMetadataCard } from "../../../../src/components/GitMetadataCard";
import React, { useState, useEffect, useRef } from "react";
import { View, ScrollView, TouchableOpacity, TextInput, StyleSheet, Linking, Share, Platform, KeyboardAvoidingView } from "react-native";
import { useAndroidBackHandler } from "../../../../src/platform/android";
import { Text } from "../../../../src/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useLayout } from "../../../../src/layout/useLayout";
import { useTheme } from "../../../../src/context/ThemeContext";
import { aiNoticeAction } from "../../../../src/api/aiRetry";
import { useConsent } from "../../../../src/context/ConsentContext";
import { Header } from "../../../../src/components/Header";
import { StatusPill } from "../../../../src/components/StatusPill";
import { riskBanner, riskiestFile } from "../../../../src/workspace/risk";
import { detectAgentProvenance } from "../../../../src/workspace/provenance";
import { getExecutiveVerdict } from "../../../../src/workspace/executiveVerdict";
import { ExecutiveVerdictCard } from "../../../../src/components/ExecutiveVerdictCard";
import { AIBlock, AIBlockSkeleton } from "../../../../src/components/AIBlock";
import { Button } from "../../../../src/components/Button";
import { EmptyState } from "../../../../src/components/EmptyState";
import { ErrorState } from "../../../../src/components/ErrorState";
import { LoadingState } from "../../../../src/components/LoadingState";
import { Icon } from "../../../../src/components/Icon";
import { DemoTour } from "../../../../src/components/DemoTour";
import { PrivacyStrip } from "../../../../src/components/PrivacyStrip";
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
  const { aiConsentGranted, aiSummaries } = useConsent();
  const router = useRouter();
  const [tourClosed,setTourClosed]=useState(false);
  const {tour}=useLocalSearchParams<{tour?:string}>(),{isDemo}=useAuth();

  const [assessmentOpen,setAssessmentOpen]=useState(false);
  const [expandedFiles,setExpandedFiles]=useState<string[]>([]);
  const {detail,isLoading,isRefreshing,error,loadPr,loadPage,pageBusy,pageError,capped,fileCursor,commentCursor,checkCursor,retryAi,aiRetrying}=usePrWorkspace(owner,repo,Number(number),aiConsentGranted&&aiSummaries);
  const guardrailFiles=useAgentGuardrails(detail);
  const [fileWrap,setFileWrap]=useState<Record<string,boolean>>({}),[collapsedThreads,setCollapsedThreads]=useState<string[]>([]),[linkError,setLinkError]=useState<string|null>(null);
  const scroll=useRef<React.ComponentRef<typeof ScrollView>>(null),scrollOffset=useRef(0),fileRows=useRef<Record<string,React.ComponentRef<typeof View>|null>>({});
  const jumpToFile=(name:string)=>{setExpandedFiles(prev=>prev.includes(name)?prev:[...prev,name]);const row=fileRows.current[name],host=scroll.current as unknown as {getInnerViewNode?:()=>unknown}|null;if(!row||!host)return;requestAnimationFrame(()=>{try{row.measureLayout((host.getInnerViewNode?.()??scroll.current) as never,(_x:number,y:number)=>scroll.current?.scrollTo({y:Math.max(0,y-16),animated:true}),()=>{});}catch{/* no measurement support: the file stays expanded in place */}});};
  useEffect(()=>{setExpandedFiles([]);setCollapsedThreads([]);},[detail?.headSha]);
  useEffect(()=>{if(!detail||isLoading)return;const frame=requestAnimationFrame(()=>scroll.current?.scrollTo({y:scrollOffset.current,animated:false}));return()=>cancelAnimationFrame(frame);},[isLoading]);
  const [showNoteInput, setShowNoteInput] = useState(false),[noteFocus,setNoteFocus]=useState(0);
  const noteKeyboard=useNoteKeyboardScroll(scroll,showNoteInput);


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


  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.root, { backgroundColor: colors.background }]}>
      <Header
        title="PR Review Detail"
        onBack={()=>{if(router.canGoBack())router.back();else router.replace("/(tabs)/inbox");}}
        showBack
        rightAction={
          <View style={{flexDirection:"row",alignItems:"center"}}>{detail&&<AudioCommuteBar sentences={prExecutiveNarration({...detail,files:guardrailFiles})}/>}<TouchableOpacity
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Share pull request"
            disabled={!detail?.htmlUrl}
            style={styles.shareBtn}
          >
            <Icon name="share-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity></View>
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
          <ScrollView onContentSizeChange={noteKeyboard.onContentSizeChange} keyboardDismissMode={Platform.OS==="ios"?"interactive":"on-drag"} keyboardShouldPersistTaps="handled" testID="pr-workspace-scroll" ref={scroll} onScroll={event=>{scrollOffset.current=event.nativeEvent.contentOffset.y;}} scrollEventThrottle={16} contentContainerStyle={{ padding:isDesktop?24:spacing.base, paddingBottom:24 }}>
            {!!(error||linkError)&&<Text accessibilityRole="alert" style={{color:colors.riskHigh,padding:12}}>{error??linkError}</Text>}
            {isDemo&&tour==="1"&&!tourClosed&&<DemoTour onClose={()=>setTourClosed(true)}/>}
            {/* Unified Modern PR Header Surface */}
            <View style={[styles.headerCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24, padding: 20 }]}>
              <Text style={[typography.code,{color:colors.brandLight,fontSize:10,letterSpacing:1.2,marginBottom:12}]}>PR WORKSPACE</Text>
              <View style={styles.topRow}>
                <TouchableOpacity onPress={()=>void loadPr()} disabled={isRefreshing} accessibilityRole="button" accessibilityLabel="Refresh workspace" style={{minHeight:44,minWidth:44,alignItems:"center",justifyContent:"center"}}><Icon name="refresh-outline" size={18} color={colors.textMuted}/></TouchableOpacity>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
                  <Icon name="folder-outline" size={13} color={colors.textMuted} />
                  <Text style={[typography.caption, { color: colors.textMuted, fontFamily: typography.code.fontFamily }]} numberOfLines={1}>
                    {detail.owner}/{detail.repo} · #{detail.number}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <StatusPill status={detail.status} />
                  {detail.mergeState && <MergeStateChip state={detail.mergeState} />}
                </View>
              </View>

              <Text
                style={[typography.headline, { color: colors.text, marginTop: 10, fontSize: 22, lineHeight: 28, fontWeight: "700" }]}
                accessibilityRole="header"
              >
                {detail.title}
              </Text>

              <MetaTelemetryModal compact telemetry={detail.risk?.telemetry??detail.summary?.telemetry} sample={isDemo}/>
              <GitMetadataCard
                inline
                baseBranch={detail.baseBranch}
                headBranch={detail.headBranch}
                headSha={detail.headSha}
                author={detail.author}
                createdAt={detail.createdAt}
                additions={detail.additions}
                deletions={detail.deletions}
                fileCount={detail.files?.length ?? detail.changedFilesCount}
              />
            </View>

            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Configure an agent workflow for this pull request" onPress={()=>router.push({pathname:'/workflows',params:{target:detail.htmlUrl,mode:'review'}})} style={{minHeight:60,padding:14,borderRadius:18,backgroundColor:colors.brandSubtle,borderWidth:1,borderColor:colors.brandMuted,flexDirection:'row',alignItems:'center',gap:12}}><Icon name="git-network-outline" size={22} color={colors.brandLight}/><View style={{flex:1}}><Text style={[typography.subhead,{color:colors.text,fontWeight:'600'}]}>Put agents on the next step</Text><Text style={[typography.caption,{color:colors.textSecondary,marginTop:3}]}>Configure a workflow with this PR's context</Text></View><Icon name="arrow-forward-outline" size={18} color={colors.brandLight}/></TouchableOpacity>
            <PrivacyStrip onOpenSettings={()=>router.push("/(tabs)/settings")}/>
            <PrSecretBanner detail={detail}/>
            {/* 5-Second Executive Verdict & Agent Provenance Hero */}
            {(() => {
              const provenance = detectAgentProvenance({
                author: detail.author,
                headBranch: detail.headBranch,
                title: detail.title,
              });
              const verdict = getExecutiveVerdict({
                risk: detail.risk,
                headSha: detail.headSha,
                files: guardrailFiles,
                checks: detail.checks, checkCursor,
                secretWarning: detail.secretWarning,
                changedFilesCount: detail.changedFilesCount,
              });
              const hasVisualAssets = (detail.files ?? []).some((f) =>
                /\.(png|jpe?g|webp|svg|gif)$/i.test(f.filename)
              );
              const riskiest = detail.files ? riskiestFile(detail.files)?.filename : null;

              return (
                <ExecutiveVerdictCard
                  verdict={verdict}
                  files={guardrailFiles} totalFiles={detail.changedFilesCount}
                  provenance={provenance}
                  hasVisualAssets={hasVisualAssets}
                  onOpenVisualAudit={() => router.push("/highlight")}
                  riskiestFile={riskiest}
                  onJumpToFile={(file) => jumpToFile(file)}
                />
              );
            })()}

            {(() => {
              const hasAiInsights = Boolean(detail.summary || detail.risk || detail.secretWarning || detail.aiNotice);

              const renderChecksCard = () => <QaEvidenceCard key={detail.headSha??"unknown"} repository={`${owner}/${repo}`} number={Number(number)} headSha={detail.headSha} checks={detail.checks} sample={isDemo} runnable={detail.status === "open" || detail.status === "draft"} cursor={checkCursor} busy={pageBusy.checks} error={pageError.checks} capped={capped.checks} onLoadMore={() => loadPage("checks")} onOpen={url => void openLink(url)}/>;

              if (!hasAiInsights) {
                const hasBlast = Boolean(detail.files && detail.files.length > 0);
                const hasChecks = true;
                if (!hasBlast && !hasChecks) return null;

                return (
                  <View style={{ marginTop: spacing.xs, gap: 10 }}>
                    {hasBlast && <BlastRadiusChips files={detail.files!} />}
                    {hasChecks && renderChecksCard()}
                  </View>
                );
              }

              return (
                <View style={isDesktop ? styles.analysisGrid : undefined}>
                  <View style={isDesktop ? { flex: 1.45, minWidth: 0 } : undefined}>
                    {/* Blast Radius Analysis (Impact Domains) */}
                    {detail.files && detail.files.length > 0 && (
                      <BlastRadiusChips files={detail.files} />
                    )}

                    {/* AI Summary Card (US-09) */}
                    {detail.summary && (
                      <View style={{ marginTop: spacing.sm }}>
                        <AIBlock title="AI Summary" coverage={detail.summary.coverage} model={detail.summary.model}>
                          {/* Executive Impact Callout */}
                          {!!detail.summary.whyItMatters && (
                            <View
                              style={{
                                backgroundColor: colors.brandSubtle,
                                borderLeftWidth: 3,
                                borderLeftColor: colors.brandLight,
                                borderRadius: radius.md,
                                padding: 12,
                                marginBottom: 4,
                              }}
                            >
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                <Icon name="shield-checkmark-outline" size={14} color={colors.brandLight} />
                                <Text style={[typography.caption, { color: colors.brandLight, fontWeight: "700", letterSpacing: 0.5 }]}>
                                  EXECUTIVE IMPACT
                                </Text>
                              </View>
                              <Text style={[typography.callout, { color: colors.text, lineHeight: 20 }]}>
                                {detail.summary.whyItMatters.replace(/^[\s•\-*]+/, "").trim()}
                              </Text>
                            </View>
                          )}

                          {!!detail.summary.whatChanged && (
                            <SummarySection title="What changed" icon="swap-horizontal-outline">
                              <ExecutiveSummaryText text={detail.summary.whatChanged} />
                            </SummarySection>
                          )}

                          {detail.summary.suggestedFocus.length > 0 && (
                            <SummarySection title="Suggested focus" icon="scan-outline">
                              <View style={{ gap: 8 }}>
                                {detail.summary.suggestedFocus.slice(0, 3).map((focus, index) => {
                                  const cleanFocus = focus.replace(/^[\s•\-*]+/, "").trim();
                                  return (
                                    <View
                                      key={index}
                                      style={{
                                        flexDirection: "row",
                                        alignItems: "flex-start",
                                        gap: 10,
                                        paddingVertical: 10,
                                        paddingHorizontal: 12,
                                        backgroundColor: colors.surfaceElevated,
                                        borderRadius: radius.md,
                                        borderWidth: 1,
                                        borderColor: colors.border,
                                      }}
                                    >
                                      <View
                                        style={{
                                          width: 20,
                                          height: 20,
                                          borderRadius: 10,
                                          backgroundColor: colors.brandSubtle,
                                          alignItems: "center",
                                          justifyContent: "center",
                                          marginTop: 1,
                                        }}
                                      >
                                        <Icon name="search-outline" size={12} color={colors.brandLight} />
                                      </View>
                                      <Text style={[typography.callout, { color: colors.text, flex: 1, lineHeight: 20 }]}>
                                        {cleanFocus}
                                      </Text>
                                    </View>
                                  );
                                })}
                              </View>
                            </SummarySection>
                          )}
                        </AIBlock>
                      </View>
                    )}

                    {/* Reviewer co-pilot: read-only, built on request */}
                    {detail.summary && aiConsentGranted && aiSummaries && (
                      <>
                        <ReviewPlanCard
                          key={`plan-${detail.headSha}`}
                          owner={owner}
                          repo={repo}
                          number={Number(number)}
                          files={detail.files}
                          prTitle={detail.title}
                        />
                        <AskPrCard key={`ask-${detail.headSha}`} owner={owner} repo={repo} number={Number(number)} files={detail.files.map((file) => file.filename)} />
                      </>
                    )}

                    {/* AI is on and the summary is still being written */}
                    {aiConsentGranted && aiSummaries && !detail.summary && !detail.aiNotice && (
                      <View style={{ marginTop: spacing.sm }}><AIBlockSkeleton /></View>
                    )}

                    {/* Why the AI parts are missing: not turned on, turned off, over the limit or unavailable */}
                    {detail.aiNotice && (
                      <View style={{ marginTop: spacing.sm }}>
                        {detail.aiNotice.code === "consent_required" && !detail.summary ? (
                          <AIBlock title="AI Summary">
                            <Text style={[typography.body, { color: colors.text }]}>{detail.aiNotice.message}</Text>
                            <Button title="Open Settings" variant="secondary" onPress={() => router.push("/(tabs)/settings")} style={{ marginTop: 12, alignSelf: "flex-start" }} />
                          </AIBlock>
                        ) : (
                          <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.lg }]}>
                            <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
                              AI summary unavailable
                            </Text>
                            <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4 }]} accessibilityLiveRegion="polite">
                              {detail.aiNotice.message}
                            </Text>
                            {aiNoticeAction(detail.aiNotice.code) === "retry" && <Button title="Try again" variant="secondary" loading={aiRetrying} onPress={retryAi} style={{ marginTop: 12, alignSelf: "flex-start" }} accessibilityLabel="Try the AI summary again" />}
                            {aiNoticeAction(detail.aiNotice.code) === "settings" && <Button title="Open Settings" variant="secondary" onPress={() => router.push("/(tabs)/settings")} style={{ marginTop: 12, alignSelf: "flex-start" }} />}
                          </View>
                        )}
                      </View>
                    )}
                  </View>

                  <View style={isDesktop ? { flex: 1, minWidth: 0 } : undefined}>
                    <PrRiskPanel detail={detail} assessmentOpen={assessmentOpen} setAssessmentOpen={setAssessmentOpen} jumpToFile={jumpToFile}/>
                    {renderChecksCard()}
                  </View>
                </View>
              );
            })()}

            <PrVisualDiffSection detail={detail}/>
            {/* Changed Files List */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.sm }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
                  Files Changed ({detail.changedFilesCount})
                </Text>
                {detail.files.length > 0 && (
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    +{detail.additions} / -{detail.deletions}
                  </Text>
                )}
              </View>
              {detail.files.length === 0 ? (
                <View style={{ paddingVertical: 12, alignItems: "center", gap: 8 }}>
                  <Text style={[typography.footnote, { color: colors.textMuted }]}>
                    {pageBusy.files ? "Loading files..." : "No changed files loaded yet."}
                  </Text>
                  {!!fileCursor && (
                    <Button
                      title="Load files"
                      loading={pageBusy.files}
                      onPress={() => loadPage("files")}
                      variant="secondary"
                      style={{ minWidth: 140, alignSelf: "center", marginTop: 4 }}
                    />
                  )}
                </View>
              ) : (
                <View style={{ marginTop: spacing.xs }}>
                  {detail.files.map((file) => (
                    <View testID={`workspace-file-${file.filename}`} ref={(node) => { fileRows.current[file.filename] = node; }} key={file.filename} style={{ marginTop: 12, backgroundColor: colors.surfaceElevated, borderRadius: 8, overflow: "hidden" }}>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Toggle diff for ${file.filename}`} accessibilityState={{ expanded: expandedFiles.includes(file.filename) }} aria-expanded={expandedFiles.includes(file.filename)} onPress={() => setExpandedFiles((prev) => prev.includes(file.filename) ? prev.filter((name) => name !== file.filename) : [...prev, file.filename])} style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8, minHeight: 48 }}><Icon name={expandedFiles.includes(file.filename) ? "chevron-down" : "chevron-forward"} size={16} color={colors.textSecondary} /><Text style={[typography.code, { color: colors.text, flex: 1 }]}>{file.filename} · {file.status}</Text><Text style={[typography.code, { color: colors.riskLow, fontSize: 11 }]}>+{file.additions}</Text><Text style={[typography.code, { color: colors.riskHigh, fontSize: 11 }]}>-{file.deletions}</Text></TouchableOpacity>
                      {!!file.previousPath && <Text style={{ color: colors.textSecondary, paddingHorizontal: 12 }}>Previously: {file.previousPath}</Text>}
                      {expandedFiles.includes(file.filename) && file.patchState === "partial" && <Text accessibilityRole="alert" style={{ color: colors.textSecondary, padding: 12 }}>Partial patch: this is not the complete diff. Open this PR in GitHub for the full file.</Text>}
                      {expandedFiles.includes(file.filename) && (file.patchSnippet ? <DiffView patch={file.patchSnippet} wrap={Object.prototype.hasOwnProperty.call(fileWrap, file.filename) ? fileWrap[file.filename] ?? true : true} onWrapChange={(wrap) => setFileWrap((old) => ({ ...old, [file.filename]: wrap }))} /> : <Text style={[typography.code, { color: colors.textSecondary, padding: 12, borderTopWidth: 1, borderTopColor: colors.border }]}>Patch unavailable: the file may be binary, empty or too large for GitHub to include. Open this PR in GitHub.</Text>)}
                    </View>
                  ))}
                  {!!fileCursor && (
                    <View style={{ marginTop: 14, alignItems: "center" }}>
                      <Button
                        title={detail.files.length ? "Load more files" : "Load files"}
                        loading={pageBusy.files}
                        onPress={() => loadPage("files")}
                        variant="secondary"
                        style={{ minWidth: 160, alignSelf: "center" }}
                      />
                    </View>
                  )}
                </View>
              )}
              {capped.files && <Text style={{ color: colors.textSecondary, marginTop: 8 }}>File pagination limit reached. Open this PR in GitHub for remaining files.</Text>}
              {!!pageError.files && <Text accessibilityRole="alert" style={[typography.footnote, { color: colors.riskHigh, padding: 16 }]}>{pageError.files}</Text>}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: 16 }]}>
              <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>Conversation</Text>
              {discussionGroups(detail.comments).map((group) => <View key={group.id} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}><TouchableOpacity accessibilityRole="button" accessibilityLabel={group.kind === "conversation" ? "Toggle PR conversation" : group.kind === "review-summary" ? `Toggle submitted review by ${group.comments[0]?.author ?? "reviewer"}` : `Toggle review discussion for ${group.path ?? "file unavailable"}${group.line ? ` line ${group.line}` : ""}`} accessibilityState={{ expanded: !collapsedThreads.includes(group.id) }} aria-expanded={!collapsedThreads.includes(group.id)} onPress={() => setCollapsedThreads((old) => old.includes(group.id) ? old.filter((id) => id !== group.id) : [...old, group.id])} style={{ minHeight: 44, justifyContent: "center" }}><Text style={[typography.subhead, { color: colors.text }]}>{group.kind === "conversation" ? "PR conversation" : group.kind === "review-summary" ? `Review: ${(group.reviewState ?? "submitted").toLowerCase().replaceAll("_", " ")}` : `Review discussion · ${group.path ?? "file unavailable"}${group.line ? `:${group.line}` : ""}${group.outdated ? " (outdated)" : ""}`}</Text></TouchableOpacity>{!collapsedThreads.includes(group.id) && group.comments.map((comment) => <View key={comment.id} style={{ paddingVertical: 8 }}><Text style={[typography.footnote, { color: colors.textSecondary }]}>@{comment.author} · {relativeTime(comment.createdAt)}</Text><Text selectable style={[typography.body, { color: colors.text, marginTop: 4 }]}>{comment.body || "No review message."}</Text></View>)}</View>)}
              {commentCursor ? (
                <View style={{ marginTop: 12, alignItems: "center" }}>
                  <Button
                    title="Load comments"
                    loading={pageBusy.comments}
                    onPress={() => loadPage("comments")}
                    variant="ghost"
                    style={{ minWidth: 160, alignSelf: "center" }}
                  />
                </View>
              ) : detail.comments.length === 0 ? (
                <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 8 }]}>No comments.</Text>
              ) : null}
              {capped.comments && <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Discussion pagination limit reached. Open this PR in GitHub for the full history.</Text>}
              {!!pageError.comments && <Text accessibilityRole="alert" style={[typography.footnote, { color: colors.riskHigh, paddingTop: 12 }]}>{pageError.comments}</Text>}
            </View>

            {showNoteInput && <View><PrivateNotes onInputFocus={noteKeyboard.onFocus} onInputBlur={noteKeyboard.onBlur} focusRequest={noteFocus} onClose={()=>setShowNoteInput(false)} context={{kind:'pr',repo:`${owner}/${repo}`,number:Number(number)}}/></View>}
          </ScrollView>

          <ExecutiveActionBar detail={{...detail,checkCursor,files:guardrailFiles}} onOpenGitHub={openInGitHub} onAddNote={()=>{setShowNoteInput(true);setNoteFocus(n=>n+1);if(showNoteInput)noteKeyboard.onFocus();}}/>
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
    padding: 16,
    borderWidth: 1,
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
