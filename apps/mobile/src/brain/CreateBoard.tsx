import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import type { Project, Repo } from '@mergemate/contracts';
import type { ApiClient } from '../api/client';
import { ApiClientError } from '../api/errors';
import { useTheme } from '../context/ThemeContext';
import { EditorShell } from './editors';
import { findBoard, splitRepoName } from './boardForm';

/** Pick one of your repositories and create its board. A board that already exists is opened instead. */
export function CreateBoardDialog({ api, onOpened, onClose }: { api: ApiClient; onOpened: (project: Project) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.getRepos().then(
      (items) => live && setRepos(items),
      () => live && (setRepos([]), setError('Could not load your repositories. Close this and try again.')),
    );
    return () => { live = false; };
  }, [api]);

  const create = async () => {
    const target = picked ? splitRepoName(picked) : null;
    if (!target) return setError('Pick a repository first.');
    setBusy(true);
    setError(null);
    try {
      const { project } = await api.createBrainProject(target);
      onOpened(project);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'state_conflict') {
        try {
          const existing = findBoard((await api.getBrainProjects()).projects, target.owner, target.repo);
          if (existing) return onOpened(existing);
        } catch { /* fall through to the message */ }
      }
      setError(err instanceof Error ? err.message : 'Could not create the board. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <EditorShell title="Create board" busy={busy} error={error} saveLabel="Create board" onSave={() => void create()} onClose={onClose}>
      <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8 }}>Repository</Text>
      {repos === null ? <Text style={{ color: colors.textMuted }}>Loading repositories...</Text> : null}
      {repos?.length === 0 && !error ? <Text style={{ color: colors.textMuted }}>No repositories found.</Text> : null}
      {repos?.map((repo) => (
        <TouchableOpacity
          key={repo.id}
          style={[styles.row, { borderColor: colors.border }, picked === repo.fullName && { borderColor: colors.brandLight, borderWidth: 2 }]}
          onPress={() => { setPicked(repo.fullName); setError(null); }}
          accessibilityRole="radio"
          accessibilityState={{ checked: picked === repo.fullName }}
          accessibilityLabel={`Repository ${repo.fullName}`}
        >
          <Text style={{ color: colors.text }}>{repo.fullName}</Text>
        </TouchableOpacity>
      ))}
    </EditorShell>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: 8, marginBottom: 8 },
});
