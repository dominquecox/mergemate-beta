import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Project } from '@mergemate/contracts';
import { useAuth } from '../../src/context/AuthContext';
import { useFeatureFlags } from '../../src/hooks/useFeatureFlags';
import { useTheme } from '../../src/context/ThemeContext';
import { api } from '../../src/api';
import { BoardScreen, ProjectsListScreen, TrackTimelineScreen } from '../../src/brain/screens';
import { useBrainBoard, useProjectsList } from '../../src/brain/hooks';
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
      </View>
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
        />
      ) : (
        <TrackTimelineScreen events={board.trackEvents} loading={board.loading && !board.project} />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (c: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, justifyContent: 'center' },
  active: { borderBottomWidth: 2, borderBottomColor: c.brandLight },
  label: { fontSize: 15, fontWeight: '600', color: c.text },
});
