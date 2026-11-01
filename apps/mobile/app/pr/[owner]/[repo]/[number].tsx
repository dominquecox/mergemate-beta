import {PrivateNotes} from "../../../../src/components/PrivateNotes";
import {useAuth} from '../../../../src/context/AuthContext';
import {usePrWorkspace} from '../../../../src/hooks/usePrWorkspace';
import {discussionGroups} from '../../../../src/workspace/state';
import {githubUrl} from '../../../../src/api/urls';
import {ReadoutControls} from "../../../../src/components/ReadoutControls";
import {narrationSentences} from "../../../../src/readout/text";
import { Avatar } from "../../../../src/components/Avatar";
import { relativeTime } from "../../../../src/format/activity";
import { AskPrCard, ReviewPlanCard } from "../../../../src/components/ReviewCopilot";
import { BlastRadiusChips } from "../../../../src/components/BlastRadiusChips";
import { SummarySection, ExecutiveSummaryText } from "../../../../src/components/SummarySection";
import { GitMetadataCard } from "../../../../src/components/GitMetadataCard";
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
import { riskBanner, riskEvidence, riskiestFile } from "../../../../src/workspace/risk";
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
  const [fileWrap,setFileWrap]=useState<Record<string,boolean>>({}),[collapsedThreads,setCollapsedThreads]=useState<string[]>([]),[linkError,setLinkError]=useState<string|null>(null);
  const scroll=useRef<React.ComponentRef<typeof ScrollView>>(null),scrollOffset=useRef(0),fileRows=useRef<Record<string,React.ComponentRef<typeof View>|null>>({});
  const jumpToFile=(name:string)=>{setExpandedFiles(prev=>prev.includes(name)?prev:[...prev,name]);const row=fileRows.current[name],host=scroll.current as unknown as {getInnerViewNode?:()=>unknown}|null;if(!row||!host)return;requestAnimationFrame(()=>{try{row.measureLayout((host.getInnerViewNode?.()??scroll.current) as never,(_x:number,y:number)=>scroll.current?.scrollTo({y:Math.max(0,y-16),animated:true}),()=>{});}catch{/* no measurement support: the file stays expanded in place */}});};
  useEffect(()=>{setExpandedFiles([]);setCollapsedThreads([]);},[detail?.headSha]);
  useEffect(()=>{if(!detail||isLoading)return;const frame=requestAnimationFrame(()=>scroll.current?.scrollTo({y:scrollOffset.current,animated:false}));return()=>cancelAnimationFrame(frame);},[isLoading]);
  const [showNoteInput, setShowNoteInput] = useState(false),[noteFocus,setNoteFocus]=useState(0),noteY=useRef(0);
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


  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.root, { backgroundColor: colors.background }]}>
      <Header
        title="PR Review Detail"
        onBack={()=>{if(router.canGoBack())router.back();else router.replace("/(tabs)/inbox");}}
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

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <PrivacyStrip onOpenSettings={()=>router.push("/(tabs)/settings")}/>
              <TouchableOpacity onPress={()=>void loadPr()} disabled={isRefreshing} accessibilityRole="button" accessibilityLabel="Refresh workspace" accessibilityState={{busy:isRefreshing,disabled:isRefreshing}} style={{flexDirection:"row",alignItems:"center",gap:6,minHeight:32,paddingHorizontal:4}}><Icon name="refresh-outline" size={13} color={colors.textMuted}/><Text style={[typography.caption,{color:colors.textMuted}]}>{isRefreshing?"Refreshing...":"Refresh"}</Text></TouchableOpacity>
            </View>
            {!!(error||linkError)&&<Text accessibilityRole="alert" style={{color:colors.riskHigh,padding:12}}>{error??linkError}</Text>}
            {isDemo&&tour==="1"&&!tourClosed&&<DemoTour onClose={()=>setTourClosed(true)}/>}
            {/* Unified Modern PR Header Surface */}
            <View style={[styles.headerCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: 16 }]}>
              <View style={styles.topRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
                  <Icon name="folder-outline" size={13} color={colors.textMuted} />
                  <Text style={[typography.caption, { color: colors.textMuted, fontFamily: typography.code.fontFamily }]} numberOfLines={1}>
                    {detail.owner}/{detail.repo} · #{detail.number}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <StatusPill status={detail.status} />
                  {detail.mergeState && <MergeStateChip state={detail.mergeState} />}
                  {detail.risk && <RiskBadge level={detail.risk.level} compact />}
                </View>
              </View>

              <Text
                style={[typography.headline, { color: colors.text, marginTop: 10, fontSize: 18, lineHeight: 24, fontWeight: "700" }]}
                accessibilityRole="header"
              >
                {detail.title}
              </Text>

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

            {/* 5-Second Executive Verdict & Agent Provenance Hero */}
            {(() => {
              const provenance = detectAgentProvenance({
                author: detail.author,
                headBranch: detail.headBranch,
                title: detail.title,
              });
              const verdict = getExecutiveVerdict({
                risk: detail.risk,
                files: detail.files,
                checks: detail.checks,
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

              const renderChecksCard = () => {
                if (detail.checks.length === 0 && !checkCursor) return null;
                return (
                  <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.sm, padding: 14 }]}>
                    <Text style={[typography.headline, { color: colors.text, fontSize: 15 }]} accessibilityRole="header">
                      Checks ({detail.checks.filter((c) => c.conclusion === "success").length}/{detail.checks.length} loaded)
                    </Text>
                    {detail.checks.length === 0 ? (
                      <Text style={[typography.footnote, { color: colors.textMuted, marginTop: spacing.xs }]}>
                        {checkCursor ? "Checks loading..." : "No status checks reported."}
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
                            <Text style={[typography.caption, { color: colors.textMuted }]}>{chk.status === "completed" ? chk.conclusion : chk.status}</Text>
                            {!!chk.url && (
                              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open check in GitHub" onPress={() => openLink(chk.url)} style={styles.shareBtn}>
                                <Icon name="open-outline" size={18} color={colors.textSecondary} />
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                    {!!checkCursor && (
                      <View style={{ marginTop: 10, alignItems: "center" }}>
                        <Button title={detail.checks.length ? "Load more checks" : "Load checks"} loading={pageBusy.checks} onPress={() => loadPage("checks")} variant="ghost" style={{ minWidth: 140, alignSelf: "center" }} />
                      </View>
                    )}
                    {!!pageError.checks && <Text accessibilityRole="alert" style={{ color: colors.riskHigh, marginTop: 4 }}>{pageError.checks}</Text>}
                    {capped.checks && <Text style={{ color: colors.textSecondary, marginTop: 4 }}>Check pagination limit reached. Open this PR in GitHub for the full history.</Text>}
                  </View>
                );
              };

              if (!hasAiInsights) {
                const hasBlast = Boolean(detail.files && detail.files.length > 0);
                const hasChecks = detail.checks.length > 0 || Boolean(checkCursor);
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
                    {/* Risk Assessment Card (US-10) */}
                    {detail.risk && (
                      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.sm }]}>
                        <View style={[styles.riskHeader, { flexWrap: "wrap", gap: 8 }]}>
                          <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
                            Why this risk
                          </Text>
                          <RiskBadge level={detail.risk.level} secretWarning={detail.secretWarning} />
                        </View>

                        <View style={{ marginTop: spacing.sm, gap: 8 }}>
                          {riskEvidence(detail.risk, detail.files, detail.checks)
                            .filter((item, _, all) => all.length === 1 || !item.reason.startsWith("No rule-based risk signals"))
                            .slice(0, 3)
                            .map(({ reason, file, check }, idx) => {
                              const cleanReason = reason.replace(/^[\s•\-*]+/, "").trim();
                              const isHigh = detail.risk!.level === "high";
                              const isMedium = detail.risk!.level === "medium";
                              const badgeBg = isHigh ? colors.riskHighBg : isMedium ? colors.riskMediumBg : colors.riskLowBg;
                              const badgeColor = isHigh ? colors.riskHigh : isMedium ? colors.riskMedium : colors.riskLow;
                              const iconName = isHigh ? "alert-circle" : isMedium ? "warning" : "checkmark-circle";
                              return (
                                <View
                                  key={idx}
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
                                  testID="risk-reason"
                                >
                                  <View
                                    style={{
                                      width: 22,
                                      height: 22,
                                      borderRadius: 11,
                                      backgroundColor: badgeBg,
                                      alignItems: "center",
                                      justifyContent: "center",
                                      marginTop: 1,
                                    }}
                                  >
                                    <Icon name={iconName} size={14} color={badgeColor} />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={[typography.callout, { color: colors.text, lineHeight: 20 }]}>
                                      {cleanReason}
                                    </Text>
                                    {!!file && (
                                      <TouchableOpacity
                                        accessibilityRole="button"
                                        accessibilityLabel={`Open ${file}, the file behind this reason`}
                                        onPress={() => jumpToFile(file)}
                                        style={{ minHeight: 32, justifyContent: "center", marginTop: 4 }}
                                      >
                                        <Text style={[typography.caption, { color: colors.brandLight, fontWeight: "600" }]} numberOfLines={1}>
                                          View {file} ↗
                                        </Text>
                                      </TouchableOpacity>
                                    )}
                                    {!!check && (
                                      <Text style={[typography.caption, { color: colors.riskHigh, marginTop: 4 }]}>
                                        Failing check: {check}
                                      </Text>
                                    )}
                                  </View>
                                </View>
                              );
                            })}
                        </View>

                        {detail.risk.quality?.needsCloserLook && (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 8,
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                              backgroundColor: colors.surfaceElevated,
                              borderRadius: radius.md,
                              borderWidth: 1,
                              borderColor: colors.border,
                              marginTop: 8,
                            }}
                          >
                            <Icon name="eye-outline" size={16} color={colors.textSecondary} />
                            <Text style={[typography.footnote, { color: colors.textSecondary, flex: 1 }]}>
                              {detail.risk.quality.reasons.join(" · ")}
                            </Text>
                          </View>
                        )}

                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="How this was assessed" accessibilityState={{ expanded: assessmentOpen }} aria-expanded={assessmentOpen} onPress={() => setAssessmentOpen((open) => !open)} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, padding: 12, marginTop: 12, backgroundColor: colors.surfaceElevated, borderRadius: 12 }}><Icon name="information-circle-outline" size={18} color={colors.brandLight} /><Text style={[typography.footnote, { color: colors.textSecondary, flex: 1 }]}>How this was assessed</Text><Icon name={assessmentOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.textSecondary} /></TouchableOpacity>
                        {assessmentOpen && <Text style={[typography.footnote, { color: colors.textSecondary, padding: 12 }]}>{riskAssessmentText(detail.risk.assessedBy)}</Text>}
                      </View>
                    )}

                    {renderChecksCard()}
                  </View>
                </View>
              );
            })()}

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

            {showNoteInput && <View onLayout={event=>{noteY.current=event.nativeEvent.layout.y;if(noteFocus>0)scroll.current?.scrollTo({y:Math.max(0,noteY.current-16),animated:true});}}><PrivateNotes focusRequest={noteFocus} onClose={()=>setShowNoteInput(false)} context={{kind:'pr',repo:`${owner}/${repo}`,number:Number(number)}}/></View>}
          </ScrollView>

          {/* Bottom Bar: Open in GitHub and Add note. STRICTLY NO MERGE, APPROVE, OR COMMENT CONTROLS ON GITHUB (US-12) */}
          <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: 16 + bottomInset }]}>
            <Button
              title="Add Note"
              onPress={() => {
                setShowNoteInput(true);
                setNoteFocus((n) => n + 1);
                if (showNoteInput) scroll.current?.scrollTo({ y: Math.max(0, noteY.current - 16), animated: true });
              }}
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
