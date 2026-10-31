import React, { useRef, useState } from "react";
import { Platform, Pressable, Share, TextInput, View } from "react-native";
import type { PrAnswer, ReviewPlan } from "@mergemate/contracts";
import { api } from "../api";
import { ApiClientError, messageForCode } from "../api/errors";
import { useTheme } from "../context/ThemeContext";
import { modelDisplayName } from "../format/model";
import { narrationSentences } from "../readout/text";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { ReadoutControls } from "./ReadoutControls";
import { Text } from "./Text";

const SUGGESTED = ["What could break?", "Is this change tested?", "What should I read first?"];

const failure = (error: unknown): string =>
  error instanceof ApiClientError ? error.message : messageForCode("internal");

/** Web copies to the clipboard; native opens the share sheet. Nothing is ever sent to GitHub. */
async function copyText(text: string): Promise<"copied" | "shared"> {
  if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return "copied";
  }
  await Share.share({ message: text });
  return "shared";
}

function ModelChip({ label }: { label: string | undefined }) {
  const { colors, typography } = useTheme();
  const name = modelDisplayName(label);
  if (!name) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }} accessibilityLabel={`Made by ${name}`}>
      <Icon name="sparkles" size={12} color={colors.textMuted} />
      <Text style={[typography.caption, { color: colors.textMuted }]}>{name}</Text>
    </View>
  );
}

function Panel({ title, icon, children }: { title: string; icon: "list-outline" | "chatbubble-ellipses-outline"; children: React.ReactNode }) {
  const { colors, typography, radius, spacing } = useTheme();
  return (
    <View style={{ marginTop: spacing.sm, padding: spacing.base, gap: 8, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name={icon} size={16} color={colors.brandLight} />
        <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">{title}</Text>
      </View>
      {children}
    </View>
  );
}

/** Review plan: what to read first, what to verify, and a draft comment to copy. Built on request, cached per commit. */
export function ReviewPlanCard({ owner, repo, number }: { owner: string; repo: string; number: number }) {
  const { colors, typography } = useTheme();
  const [plan, setPlan] = useState<ReviewPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const build = async () => {
    setError(null);
    try {
      setPlan(await api.getReviewPlan(owner, repo, number));
    } catch (e) {
      setError(failure(e));
    }
  };
  const copy = async () => {
    if (!plan) return;
    try {
      setNote((await copyText(plan.draftComment)) === "copied" ? "Copied. Paste it into GitHub yourself; MergeMate never posts." : "");
    } catch {
      setNote("Could not copy. Select the text instead.");
    }
  };
  return (
    <Panel title="Review plan" icon="list-outline">
      {!plan ? (
        <>
          <Text style={[typography.callout, { color: colors.textSecondary }]}>
            Get a reading order, a checklist to verify before you approve, and a comment you can copy. Nothing is posted to GitHub.
          </Text>
          <Button title="Build review plan" onPress={build} style={{ alignSelf: "flex-start" }} />
        </>
      ) : (
        <>
          <ReadoutControls label="Review plan" sentences={narrationSentences([...plan.readingOrder.map((f) => `${f.file}. ${f.why}`), ...plan.verify])} />
          <Text style={[typography.caption, { color: colors.textMuted, letterSpacing: 0.4 }]}>READ IN THIS ORDER</Text>
          {plan.readingOrder.map((item, index) => (
            <View key={item.file} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={[typography.callout, { color: colors.brandLight, width: 18 }]}>{index + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[typography.callout, { color: colors.text }]}>{item.file}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>{item.why}</Text>
              </View>
            </View>
          ))}
          <Text style={[typography.caption, { color: colors.textMuted, letterSpacing: 0.4, marginTop: 4 }]}>VERIFY BEFORE APPROVING</Text>
          {plan.verify.map((item, index) => (
            <View key={index} style={{ flexDirection: "row", gap: 8 }}>
              <Icon name="checkmark-circle-outline" size={16} color={colors.textMuted} />
              <Text style={[typography.callout, { color: colors.text, flex: 1 }]}>{item}</Text>
            </View>
          ))}
          <Text style={[typography.caption, { color: colors.textMuted, letterSpacing: 0.4, marginTop: 4 }]}>DRAFT COMMENT</Text>
          <Text selectable style={[typography.callout, { color: colors.text, padding: 10, borderRadius: 8, backgroundColor: colors.surfaceSecondary }]}>{plan.draftComment}</Text>
          <Button title={Platform.OS === "web" ? "Copy comment" : "Share comment"} variant="secondary" onPress={copy} style={{ alignSelf: "flex-start" }} />
          {!!note && <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.textSecondary }]}>{note}</Text>}
          <ModelChip label={plan.model} />
        </>
      )}
      {!!error && <Text accessibilityRole="alert" style={[typography.callout, { color: colors.riskHigh }]}>{error}</Text>}
    </Panel>
  );
}

/** Ask this PR: one question at a time, answered from the PR with citations limited to its files. */
export function AskPrCard({ owner, repo, number }: { owner: string; repo: string; number: number }) {
  const { colors, typography } = useTheme();
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState<PrAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const ask = async (text: string) => {
    const q = text.trim();
    if (q.length < 3 || busy) return;
    const mine = ++generation.current;
    setBusy(true);
    setError(null);
    setAsked(q);
    setAnswer(null);
    try {
      const result = await api.askPr(owner, repo, number, q);
      if (mine === generation.current) setAnswer(result);
    } catch (e) {
      if (mine === generation.current) setError(failure(e));
    } finally {
      if (mine === generation.current) setBusy(false);
    }
  };
  return (
    <Panel title="Ask about this PR" icon="chatbubble-ellipses-outline">
      <TextInput
        value={question}
        onChangeText={setQuestion}
        maxLength={300}
        editable={!busy}
        accessibilityLabel="Question about this pull request"
        placeholder="e.g. Does this change the auth flow?"
        placeholderTextColor={colors.textMuted}
        returnKeyType="send"
        onSubmitEditing={() => void ask(question)}
        style={{ minHeight: 44, paddingHorizontal: 12, color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 8 }}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {SUGGESTED.map((text) => (
          <Pressable
            key={text}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => { setQuestion(text); void ask(text); }}
            style={{ minHeight: 36, justifyContent: "center", paddingHorizontal: 12, borderRadius: 18, backgroundColor: colors.brandSubtle, opacity: busy ? 0.5 : 1 }}
          >
            <Text style={[typography.caption, { color: colors.brandLight }]}>{text}</Text>
          </Pressable>
        ))}
      </View>
      <Button title="Ask" onPress={() => ask(question)} loading={busy} disabled={question.trim().length < 3} style={{ alignSelf: "flex-start" }} />
      {!!error && <Text accessibilityRole="alert" style={[typography.callout, { color: colors.riskHigh }]}>{error}</Text>}
      {answer && (
        <View accessibilityLiveRegion="polite" style={{ gap: 6 }}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{asked}</Text>
          <Text selectable style={[typography.callout, { color: colors.text }]}>{answer.answer}</Text>
          {answer.citations.length > 0 && (
            <Text style={[typography.caption, { color: colors.textSecondary }]}>From: {answer.citations.map((c) => c.file).join(", ")}</Text>
          )}
          <ModelChip label={answer.model} />
        </View>
      )}
    </Panel>
  );
}
