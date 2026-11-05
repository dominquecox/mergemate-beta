import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Project } from '@mergemate/contracts';
import { api } from '../api';
import { toUserMessage } from '../api/errors';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Button } from '../components/Button';
import { Text } from '../components/Text';

const storageKey = (userId: string) => `mergemate.lastBoard.${userId}`;
const readLast = (userId: string | undefined): string | null => {
  if (!userId || typeof localStorage === 'undefined') return null;
  try { return localStorage.getItem(storageKey(userId)); } catch { return null; }
};
const writeLast = (userId: string | undefined, projectId: string) => {
  if (!userId || typeof localStorage === 'undefined') return;
  try { localStorage.setItem(storageKey(userId), projectId); } catch { /* the last board is a convenience only */ }
};

/**
 * Every capture belongs to a board. Defaults to ?project=, then the last board this person used, then their first.
 * With no boards, it says so and links to the Board.
 */
export function BoardPicker({ defaultProjectId, value, onChange }: { defaultProjectId?: string; value: Project | null; onChange: (project: Project) => void }) {
  const { colors, typography } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    api.getBrainProjects().then((res) => {
      if (!live) return;
      setProjects(res.projects);
      const wanted = defaultProjectId || readLast(user?.id);
      const initial = res.projects.find((p) => p.id === wanted) ?? res.projects[0];
      if (initial && !value) onChange(initial);
    }, (cause) => { if (live) { setProjects([]); setError(toUserMessage(cause, 'Could not load your boards. Try again.')); } });
    return () => { live = false; };
    // Load once; the parent owns the selection afterwards.
  }, []);

  const choose = (project: Project) => { writeLast(user?.id, project.id); onChange(project); setOpen(false); };

  if (projects === null) return <Text style={[typography.caption, { color: colors.textSecondary }]}>Loading your boards…</Text>;
  if (projects.length === 0) {
    return (
      <View style={{ gap: 8 }}>
        <Text style={[typography.body, { color: colors.textSecondary }]}>{error || 'Every capture belongs to a board. Create a board first.'}</Text>
        <Button title="Go to Board" variant="secondary" onPress={() => router.push('/(tabs)/brain')} />
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Text style={[typography.caption, { color: colors.textSecondary }]}>Board</Text>
      <TouchableOpacity onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Board: ${value ? `${value.owner}/${value.repo}` : 'choose'}`}
        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
        <Text style={[typography.body, { color: colors.text }]}>{value ? `${value.owner}/${value.repo}` : 'Choose a board'}  ▾</Text>
      </TouchableOpacity>
      {open && projects.map((project) => (
        <TouchableOpacity key={project.id} onPress={() => choose(project)} accessibilityRole="button" accessibilityLabel={`${project.owner}/${project.repo}`} accessibilityState={{ selected: value?.id === project.id }}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: value?.id === project.id ? colors.brandSubtle : 'transparent' }}>
          <Text style={[typography.body, { color: colors.text }]}>{project.owner}/{project.repo}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
