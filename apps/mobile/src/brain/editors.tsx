import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Card, CreateCardRequest, UpdateCardRequest } from '@mergemate/contracts';
import { useTheme } from '../context/ThemeContext';
import { PRIORITIES, RULES_MAX, draftFromCard, emptyDraft, toCreateRequest, toUpdateRequest, validateRules, type CardDraft } from './cardForm';

interface ShellProps {
  title: string;
  busy: boolean;
  error: string | null;
  saveLabel: string;
  onSave: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

function EditorShell({ title, busy, error, saveLabel, onSave, onClose, children }: ShellProps) {
  const { styles } = useEditorStyles();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.bar}>
          <TouchableOpacity style={styles.barButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.barText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.barTitle} accessibilityRole="header">{title}</Text>
          <TouchableOpacity style={styles.barButton} onPress={onSave} disabled={busy} accessibilityRole="button" accessibilityLabel={saveLabel} accessibilityState={{ disabled: busy, busy }}>
            <Text style={[styles.barText, busy && styles.muted]}>{busy ? 'Saving' : saveLabel}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          {error ? (
            <View style={styles.error} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.errorHint}>Fix the field or press {saveLabel} to try again.</Text>
            </View>
          ) : null}
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Field({ label, value, onChange, multiline, max }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; max: number }) {
  const { colors, styles } = useEditorStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        maxLength={max}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

export interface CardEditorProps {
  projectId: string;
  /** Present when editing; absent when adding. */
  card?: Card;
  busy: boolean;
  error: string | null;
  onCreate: (request: CreateCardRequest) => Promise<boolean>;
  onUpdate: (request: UpdateCardRequest) => Promise<boolean>;
  onClose: () => void;
}

export function CardEditor({ projectId, card, busy, error, onCreate, onUpdate, onClose }: CardEditorProps) {
  const { styles } = useEditorStyles();
  const [draft, setDraft] = useState<CardDraft>(card ? draftFromCard(card) : emptyDraft());
  const [problem, setProblem] = useState<string | null>(null);
  const set = <K extends keyof CardDraft>(key: K, value: CardDraft[K]) => {
    setProblem(null);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    const request = card ? toUpdateRequest(projectId, card, draft) : toCreateRequest(projectId, draft);
    if (!request.ok) return setProblem(request.error);
    const saved = card ? await onUpdate(request.value as UpdateCardRequest) : await onCreate(request.value as CreateCardRequest);
    if (saved) onClose();
  };

  return (
    <EditorShell title={card ? 'Edit card' : 'Add card'} busy={busy} error={problem ?? error} saveLabel="Save" onSave={save} onClose={onClose}>
      <Field label="Title" value={draft.title} onChange={(value) => set('title', value)} max={160} />
      <Field label="Details" value={draft.details} onChange={(value) => set('details', value)} multiline max={20480} />
      <Field label="Done when" value={draft.doneWhen} onChange={(value) => set('doneWhen', value)} multiline max={2048} />
      <Text style={styles.label}>Priority</Text>
      <View style={styles.priorities} accessibilityRole="radiogroup">
        {PRIORITIES.map((priority) => (
          <TouchableOpacity
            key={priority}
            style={[styles.priority, draft.priority === priority && styles.priorityOn]}
            onPress={() => set('priority', priority)}
            accessibilityRole="radio"
            accessibilityState={{ checked: draft.priority === priority }}
            accessibilityLabel={`Priority ${priority}`}
          >
            <Text style={[styles.priorityText, draft.priority === priority && styles.priorityTextOn]}>{priority}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </EditorShell>
  );
}

export interface RulesEditorProps {
  rules: string;
  busy: boolean;
  error: string | null;
  onSave: (rules: string) => Promise<boolean>;
  onClose: () => void;
}

export function RulesEditor({ rules, busy, error, onSave, onClose }: RulesEditorProps) {
  const { styles } = useEditorStyles();
  const [text, setText] = useState(rules);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    const checked = validateRules(text);
    if (!checked.ok) return setProblem(checked.error);
    if (checked.value === rules.trim()) return setProblem('Nothing changed.');
    if (await onSave(checked.value)) onClose();
  };

  return (
    <EditorShell title="Project rules" busy={busy} error={problem ?? error} saveLabel="Save" onSave={save} onClose={onClose}>
      <Field label="Rules" value={text} onChange={(value) => { setProblem(null); setText(value); }} multiline max={RULES_MAX} />
      <Text style={styles.count}>{text.length} / {RULES_MAX}</Text>
    </EditorShell>
  );
}

type EditorColors = ReturnType<typeof useTheme>["colors"];

const makeStyles = (c: EditorColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.surface },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  barButton: { minHeight: 44, minWidth: 64, paddingHorizontal: 8, justifyContent: 'center' },
  barText: { fontSize: 16, fontWeight: '600', color: c.brandLight },
  barTitle: { fontSize: 16, fontWeight: '600', color: c.text },
  muted: { color: c.textSecondary },
  body: { padding: 16 },
  field: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: c.text, marginBottom: 4 },
  input: { minHeight: 44, borderWidth: 1, borderColor: c.textSecondary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: c.text },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  priorities: { flexDirection: 'row' },
  priority: { minHeight: 44, minWidth: 64, marginRight: 8, borderRadius: 8, borderWidth: 1, borderColor: c.textSecondary, alignItems: 'center', justifyContent: 'center' },
  priorityOn: { backgroundColor: c.brand, borderColor: c.brand },
  priorityText: { fontSize: 15, fontWeight: '600', color: c.text },
  priorityTextOn: { color: '#FFFFFF' },
  error: { backgroundColor: c.statusAlertBg, borderWidth: 1, borderColor: c.statusAlert, borderRadius: 8, padding: 12, marginBottom: 12 },
  errorText: { fontSize: 14, fontWeight: '600', color: c.statusAlert },
  errorHint: { fontSize: 13, color: c.statusAlert, marginTop: 2 },
  count: { fontSize: 12, color: c.textSecondary },
});

function useEditorStyles() {
  const { colors } = useTheme();
  return { colors, styles: useMemo(() => makeStyles(colors), [colors]) };
}
