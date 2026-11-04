import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Card, Project } from '@mergemate/contracts';
import { useAuth } from '../../src/context/AuthContext';
import { useFeatureFlags } from '../../src/hooks/useFeatureFlags';
import { useTheme } from '../../src/context/ThemeContext';
import { api } from '../../src/api';
import { BoardScreen, ProjectsListScreen, TrackTimelineScreen } from '../../src/brain/screens';
import { useBrainActions, useBrainBoard, useProjectsList } from '../../src/brain/hooks';
import { CardEditor, RulesEditor } from '../../src/brain/editors';
import { movedPosition } from '../../src/brain/cardForm';
import { LoadingState } from '../../src/components/LoadingState';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';

/** Brain tab: projects, board and track timeline. Shown only when the "brain" flag is on. */
export default function BrainTab() {
  const { user } = useAuth();
  const flags = useFeatureFlags();
  const [selected, setSelected] = useState<Project | null>(null);

  if (!user || !flags.brain) {
    return <EmptyState icon="lock-closed-outline" title="Board is not available" message="This feature is not enabled for your account." />;
  }
  return selected ? <BoardView project={selected} onBack={() => setSelected(null)} /> : <ProjectsView onSelect={setSelected} />;
}

function ProjectsView({ onSelect }: { onSelect: (p: Project) => void }) {
  const { projects, loading, error, retry } = useProjectsList({ api });
  if (error) return <ErrorState title="Could not load projects" message={error.message} onRetry={retry} />;
  if (loading && projects.length === 0) return <LoadingState title="Loading projects" message="Fetching your boards." />;
  if (projects.length === 0) return <EmptyState icon="albums-outline" title="No projects" message="Create a board for a repository to see it here." />;
  return (
    <ProjectsListScreen
      projects={projects}
      selectedProjectId={null}
      onSelectProject={(id) => {
        const project = projects.find((p) => p.id === id);
        if (project) onSelect(project);
      }}
      loading={false}
      error={null}
      onRetry={retry}
    />
  );
}

function BoardView({ project, onBack }: { project: Project; onBack: () => void }) {
  const [tab, setTab] = useState<'board' | 'timeline'>('board');
  const board = useBrainBoard({ projectId: project.id, api });
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [editor, setEditor] = useState<'add' | 'rules' | Card | null>(null);
  const actions = useBrainActions({ api, projectId: project.id, onChanged: board.retry });
  const closeEditor = () => {
    actions.clearError();
    setEditor(null);
  };
  const move = (card: Card, delta: -1 | 1) => {
    const position = movedPosition(board.cards, card.id, delta);
    if (position !== null) void actions.moveCard(card.id, position);
  };
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.bar}>
        <TouchableOpacity style={styles.button} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to projects">
          <Text style={styles.label}>Back</Text>
        </TouchableOpacity>
        {(['board', 'timeline'] as const).map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.button, tab === value && styles.active]}
            onPress={() => setTab(value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === value }}
            accessibilityLabel={value === 'board' ? 'Board' : 'Timeline'}
          >
            <Text style={styles.label}>{value === 'board' ? 'Board' : 'Timeline'}</Text>
          </TouchableOpacity>
        ))}
        <View style={styles.spacer} />
        <TouchableOpacity style={styles.button} onPress={() => setEditor('add')} accessibilityRole="button" accessibilityLabel="Add card">
          <Text style={styles.label}>Add</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => setEditor('rules')} accessibilityRole="button" accessibilityLabel="Edit project rules">
          <Text style={styles.label}>Rules</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={() => void actions.proceed()}
          disabled={actions.busy}
          accessibilityRole="button"
          accessibilityLabel="Proceed with the track"
          accessibilityState={{ disabled: actions.busy, busy: actions.busy }}
        >
          <Text style={styles.label}>{actions.busy ? 'Working' : 'Proceed'}</Text>
        </TouchableOpacity>
      </View>
      {actions.proceeded ? (
        <View style={[styles.notice, styles.noticeGood]} accessibilityRole="summary" accessibilityLiveRegion="polite">
          <Text style={[styles.noticeText, styles.noticeGoodText]}>Locked {actions.proceeded.card.id}: {actions.proceeded.card.title}</Text>
          <TouchableOpacity style={styles.button} onPress={actions.dismissProceeded} accessibilityRole="button" accessibilityLabel="Dismiss locked card">
            <Text style={styles.label}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {actions.error && !editor ? (
        <View style={[styles.notice, styles.noticeAlert]} accessibilityRole="alert">
          <Text style={[styles.noticeText, styles.noticeAlertText]}>{actions.error}</Text>
          <TouchableOpacity style={styles.button} onPress={actions.clearError} accessibilityRole="button" accessibilityLabel="Dismiss error">
            <Text style={styles.label}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {board.error && !board.project ? (
        <ErrorState title="Could not load board" message={board.error.message} onRetry={board.retry} />
      ) : tab === 'board' ? (
        <BoardScreen
          project={board.project ?? project}
          cards={board.cards}
          trackEvents={board.trackEvents}
          locks={board.locks}
          onSelectCard={() => {}}
          loading={board.loading && !board.project}
          error={board.error}
          onRetry={board.retry}
          onAddCard={() => setEditor('add')}
          onEditCard={(card) => setEditor(card)}
          onMoveCard={move}
        />
      ) : (
        <TrackTimelineScreen events={board.trackEvents} loading={board.loading && !board.project} />
      )}
      {editor === 'rules' ? (
        <RulesEditor rules={(board.project ?? project).rules} busy={actions.busy} error={actions.error} onSave={actions.saveRules} onClose={closeEditor} />
      ) : editor ? (
        <CardEditor
          projectId={project.id}
          card={editor === 'add' ? undefined : editor}
          busy={actions.busy}
          error={actions.error}
          onCreate={actions.createCard}
          onUpdate={actions.updateCard}
          onClose={closeEditor}
        />
      ) : null}
    </SafeAreaView>
  );
}

const makeStyles = (c: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, justifyContent: 'center' },
  active: { borderBottomWidth: 2, borderBottomColor: c.brandLight },
  label: { fontSize: 15, fontWeight: '600', color: c.text },
  spacer: { flex: 1 },
  notice: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12 },
  noticeText: { flex: 1, fontSize: 14, fontWeight: '600' },
  noticeGood: { backgroundColor: c.statusGoodBg },
  noticeGoodText: { color: c.statusGood },
  noticeAlert: { backgroundColor: c.statusAlertBg },
  noticeAlertText: { color: c.statusAlert },
});
