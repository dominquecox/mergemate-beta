import React, { useEffect, useRef, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Project } from '@mergemate/contracts';
import { api } from '../api';
import { toUserMessage } from '../api/errors';
import { Button } from '../components/Button';
import { Text } from '../components/Text';
import { useTheme } from '../context/ThemeContext';

/** A finding becomes a card an agent can act on. Only text is sent; images are never stored or uploaded here. */
export interface CardDraftText { title: string; details: string }

export const TITLE_MAX = 160;
export const cardTitle = (finding: string, fallback: string): string => {
  const first = finding.split(/(?<=[.!?])\s|\n/)[0]?.trim() ?? '';
  const text = first || fallback;
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1).trimEnd()}…` : text;
};

export function AddToBoard({ draft, defaultProjectId }: { draft: () => CardDraftText; defaultProjectId?: string }) {
  const { colors, typography } = useTheme();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState<{ project: Project } | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    if (!open || projects) return;
    let live = true;
    api.getBrainProjects().then((res) => { if (live) setProjects(res.projects); }, (cause) => { if (live) { setProjects([]); setError(toUserMessage(cause, 'Could not load your boards. Try again.')); } });
    return () => { live = false; };
  }, [open, projects]);

  const add = async (project: Project) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const { title, details } = draft();
      await api.createBrainCard({ projectId: project.id, title, details: details.slice(0, 20480) || title, priority: 'P2', doneWhen: 'The issue in the screenshot is fixed.' });
      setAdded({ project }); setOpen(false);
    } catch (cause) {
      setError(toUserMessage(cause, 'The card could not be added. Try again.'));
    } finally {
      lock.current = false; setBusy(false);
    }
  };

  if (added) {
    return (
      <View style={{ gap: 8 }} accessibilityLiveRegion="polite">
        <Text style={[typography.body, { color: colors.statusGood }]}>Card added to the {added.project.owner}/{added.project.repo} board.</Text>
        <Button title="Open board" variant="secondary" onPress={() => router.push(`/(tabs)/brain?project=${encodeURIComponent(added.project.id)}`)} />
      </View>
    );
  }
  const preferred = projects?.find((p) => p.id === defaultProjectId);
  return (
    <View style={{ gap: 8 }}>
      {!open ? (
        <Button title="Add to board" onPress={() => (preferred ? void add(preferred) : setOpen(true))} disabled={busy} loading={busy} />
      ) : projects === null ? (
        <Text style={[typography.caption, { color: colors.textSecondary }]}>Loading your boards…</Text>
      ) : projects.length === 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={[typography.body, { color: colors.textSecondary }]}>Create a board first, then add this to it.</Text>
          <Button title="Go to Board" variant="secondary" onPress={() => router.push('/(tabs)/brain')} />
        </View>
      ) : (
        <View style={{ gap: 6 }} accessibilityRole="list">
          <Text style={[typography.subhead, { color: colors.text }]}>{busy ? 'Adding to board…' : 'Choose a board'}</Text>
          {projects.map((project) => (
            <TouchableOpacity key={project.id} disabled={busy} onPress={() => void add(project)} accessibilityRole="button" accessibilityLabel={`Add to ${project.owner}/${project.repo} board`}
              style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, opacity: busy ? 0.6 : 1 }}>
              <Text style={[typography.body, { color: colors.text }]}>{project.owner}/{project.repo}</Text>
            </TouchableOpacity>
          ))}
          <Button title="Cancel" variant="ghost" disabled={busy} onPress={() => setOpen(false)} />
        </View>
      )}
      {error ? <Text accessibilityRole="alert" style={[typography.caption, { color: colors.statusAlert }]}>{error}</Text> : null}
    </View>
  );
}
