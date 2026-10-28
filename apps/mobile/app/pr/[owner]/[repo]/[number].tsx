import { Avatar } from "../../../../src/components/Avatar";
import { relativeTime } from "../../../../src/format/activity";
import { SummarySection } from "../../../../src/components/SummarySection";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, ScrollView, TouchableOpacity, TextInput, StyleSheet, Linking, Share, Platform, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAndroidBackHandler } from "../../../../src/platform/android";
import { Text } from "../../../../src/components/Text";
import { useLocalSearchParams } from "expo-router";
import { useLayout } from "../../../../src/layout/useLayout";
import { useTheme } from "../../../../src/context/ThemeContext";
import { api } from "../../../../src/api";
import { toUserMessage } from "../../../../src/api/errors";
import { useConsent } from "../../../../src/context/ConsentContext";
import { PrDetail } from "../../../../src/types";
import { Header } from "../../../../src/components/Header";
import { StatusPill } from "../../../../src/components/StatusPill";
import { RiskBadge } from "../../../../src/components/RiskBadge";
import { AIBlock } from "../../../../src/components/AIBlock";
import { Button } from "../../../../src/components/Button";
import { EmptyState } from "../../../../src/components/EmptyState";
import { ErrorState } from "../../../../src/components/ErrorState";
import { LoadingState } from "../../../../src/components/LoadingState";
import { Icon } from "../../../../src/components/Icon";
import { DiffView } from "../../../../src/components/DiffView";
import { MergeStateChip } from "../../../../src/components/MergeStateChip";

export default function PrDetailScreen() {
  const { owner, repo, number } = useLocalSearchParams<{
    owner: string;
    repo: string;
    number: string;
  }>();

  const { colors, typography, spacing, radius } = useTheme();
  const {isDesktop}=useLayout();
  const { aiConsentGranted } = useConsent();

  const [assessmentOpen,setAssessmentOpen]=useState(false);
  const [expandedFiles,setExpandedFiles]=useState<string[]>([]);
  const [detail, setDetail] = useState<PrDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  // Files and comments page independently: loading one never shows a spinner on, blocks, or reports an error for the other.
  type PageSection='files'|'comments';
  const pageLock=useRef<Record<PageSection,boolean>>({files:false,comments:false});
  const routeVersion=useRef(0);
  const [pageBusy,setPageBusy]=useState<Record<PageSection,boolean>>({files:false,comments:false});
  const [pageError,setPageError]=useState<Record<PageSection,string|null>>({files:null,comments:null});
  const [fileCursor,setFileCursor]=useState<string|null>('1');
  const [commentCursor,setCommentCursor]=useState<string|null>('review:1');
  const loadPage=async(section:PageSection)=>{
    if(pageLock.current[section])return;
    const cursor=section==='files'?fileCursor:commentCursor;
    if(!cursor)return;
    pageLock.current[section]=true;setPageBusy(b=>({...b,[section]:true}));setPageError(e=>({...e,[section]:null}));
    const version=routeVersion.current;
    try{
      if(section==='files'){
        const page=await api.getPrFilePage(owner,repo,Number(number),cursor);
        if(version!==routeVersion.current)return;
        setDetail(prev=>prev?{...prev,files:[...new Map([...prev.files,...page.items].map(file=>[file.filename,file])).values()]}:prev);setFileCursor(page.nextCursor);
      }else{
        const page=await api.getPrCommentPage(owner,repo,Number(number),cursor);
        if(version!==routeVersion.current)return;
        setDetail(prev=>prev?{...prev,comments:[...new Map([...prev.comments,...page.items].map(comment=>[comment.id,comment])).values()]}:prev);setCommentCursor(page.nextCursor);
      }
    }catch(e){if(version===routeVersion.current){const message=toUserMessage(e,'Could not load this page.');setPageError(prev=>({...prev,[section]:message}));}}
    finally{if(version===routeVersion.current){pageLock.current[section]=false;setPageBusy(b=>({...b,[section]:false}));}}
  };
  useEffect(()=>{routeVersion.current++;pageLock.current={files:false,comments:false};setPageBusy({files:false,comments:false});setPageError({files:null,comments:null});setFileCursor('1');setCommentCursor('review:1');return()=>{routeVersion.current++;};},[owner,repo,number]);

  const loadPr = useCallback(async () => {
    const version=routeVersion.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getPrDetail(owner || "owner", repo || "repo", parseInt(number || "1", 10));
      if(version===routeVersion.current)setDetail(data);
    } catch (e) {
      if(version===routeVersion.current)setError(toUserMessage(e, "We couldn't load this pull request right now. Please try again."));
    } finally {
      if(version===routeVersion.current)setIsLoading(false);
    }
    // Reload when AI is switched on or off, so the summary and risk appear or go.
  }, [owner, repo, number, aiConsentGranted]);

  useEffect(() => {
    loadPr();
  }, [loadPr]);

  // GitHub computes mergeability in the background. While it reports "unknown", re-read the PR a few times.
  const [mergeRechecks, setMergeRechecks] = useState(0);
  useEffect(() => {
    if (detail?.mergeState !== "unknown" || mergeRechecks >= 3) return;
    const timer = setTimeout(async () => {
      setMergeRechecks((count) => count + 1);
      try {
        const fresh = await api.getPrMetadata(owner || "owner", repo || "repo", parseInt(number || "1", 10));
        setDetail((current) => (current ? { ...current, mergeState: fresh.mergeState } : current));
      } catch {
        // Keep showing "Checking merge status"; it never claims ready.
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [detail?.mergeState, mergeRechecks, owner, repo, number]);

  const handleShare = async () => {
    if (detail) {
      await Share.share({
        message: `${detail.title} (${detail.owner}/${detail.repo}#${detail.number})\n${detail.htmlUrl}`,
      });
    }
  };

  const openInGitHub = () => {
    if (detail?.htmlUrl) {
      Linking.openURL(detail.htmlUrl);
    }
  };

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
            style={styles.shareBtn}
          >
            <Icon name="share-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        }
      />

      {isLoading ? (
        <LoadingState
          title="Loading pull request..."
          message="Fetching AI summary, risk checks, and changed files."
        />
      ) : error ? (
        <ErrorState
          title="Couldn't load pull request"
          message={error}
          onRetry={loadPr}
        />
      ) : !detail ? (
        <EmptyState
          icon="document-text-outline"
          title="Pull request not found"
          message="This pull request may have been removed or moved in GitHub."
          actionTitle="Try Again"
          onAction={loadPr}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding:isDesktop?24:spacing.base, paddingBottom:120 }}>
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
                  </AIBlock>
                ) : (
                  <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.lg }]}>
                    <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
                      AI summary unavailable
                    </Text>
                    <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
                      {detail.aiNotice.message}
                    </Text>
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
                        color={detail.risk!.level === "high" ? colors.riskHigh : colors.riskMedium}
                        style={styles.reasonDot}
                      />
                      <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{reason}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity accessibilityRole="button" accessibilityLabel="How this was assessed" accessibilityState={{expanded:assessmentOpen}} aria-expanded={assessmentOpen} onPress={()=>setAssessmentOpen(open=>!open)} style={{flexDirection:"row",alignItems:"center",gap:8,minHeight:44,padding:12,marginTop:12,backgroundColor:colors.surfaceElevated,borderRadius:12}}><Icon name="information-circle-outline" size={18} color={colors.brandLight}/><Text style={[typography.footnote,{color:colors.textSecondary,flex:1}]}>How this was assessed</Text><Icon name={assessmentOpen?'chevron-up':'chevron-down'} size={16} color={colors.textSecondary}/></TouchableOpacity>
                {assessmentOpen && <Text style={[typography.footnote,{color:colors.textSecondary,padding:12}]}>Evaluated against sensitive file boundaries, migrations, authentication middleware, and secret patterns. This is review guidance, not a security guarantee.</Text>}
              </View>
            )}

            {/* CI Checks List */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.sm }]}>
              <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
                Checks ({detail.checks.filter((c) => c.conclusion === "success").length}/{detail.checks.length})
              </Text>
              {detail.checks.length === 0 ? (
                <Text style={[typography.footnote, { color: colors.textMuted, marginTop: spacing.xs }]}>
                  No status checks have been reported for this pull request yet.
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
                      <Text style={[typography.caption, { color: colors.textMuted }]}>{chk.conclusion}</Text>
                    </View>
                  ))}
                </View>
              )}
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
                  {detail.files.map((file, idx) => (
                    <View key={file.filename} style={{marginTop:12,backgroundColor:colors.surfaceElevated,borderRadius:8,overflow:"hidden"}}>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Toggle diff for ${file.filename}`} accessibilityState={{expanded:expandedFiles.includes(file.filename)}} aria-expanded={expandedFiles.includes(file.filename)} onPress={()=>setExpandedFiles(prev=>prev.includes(file.filename)?prev.filter(name=>name!==file.filename):[...prev,file.filename])} style={{flexDirection:"row",alignItems:"center",padding:12,gap:8,minHeight:48}}><Icon name={expandedFiles.includes(file.filename)?"chevron-down":"chevron-forward"} size={16} color={colors.textSecondary}/><Text style={[typography.code,{color:colors.text,flex:1}]}>{file.filename}</Text><Text style={[typography.code,{color:colors.riskLow,fontSize:11}]}>+{file.additions}</Text><Text style={[typography.code,{color:colors.riskHigh,fontSize:11}]}>-{file.deletions}</Text></TouchableOpacity>
                      {expandedFiles.includes(file.filename) && (file.patchSnippet ? <DiffView patch={file.patchSnippet}/> : <Text style={[typography.code,{color:colors.textSecondary,padding:12,borderTopWidth:1,borderTopColor:colors.border}]}>Diff unavailable. Open this pull request in GitHub.</Text>)}
                    </View>
                  ))}
                </View>
              )}
            </View>

            {fileCursor && <Button title={detail.files.length?'Load more files':'Load files'} loading={pageBusy.files} onPress={()=>loadPage('files')} variant="secondary"/>}
            {pageError.files && <Text accessibilityRole="alert" style={[typography.footnote,{color:colors.riskHigh,padding:16}]}>{pageError.files}</Text>}
            <View style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border,borderRadius:radius.lg,marginTop:16}]}>
              <Text accessibilityRole="header" style={[typography.headline,{color:colors.text}]}>Conversation</Text>
              {detail.comments.map(comment=><View key={comment.id} style={{paddingVertical:12,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={[typography.footnote,{color:colors.textSecondary}]}>@{comment.author}</Text><Text style={[typography.body,{color:colors.text,marginTop:4}]}>{comment.body}</Text></View>)}
              {commentCursor?<Button title="Load comments" loading={pageBusy.comments} onPress={()=>loadPage('comments')} variant="ghost"/>:detail.comments.length===0?<Text style={[typography.footnote,{color:colors.textSecondary}]}>No comments.</Text>:null}
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
