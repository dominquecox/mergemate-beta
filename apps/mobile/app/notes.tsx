import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { NoteListItem } from '@mergemate/contracts';
import { api } from '../src/api';
import { toUserMessage } from '../src/api/errors';
import { errorDetailsOf, type ErrorDetails } from '../src/api/error-details';
import { useAuth } from '../src/context/AuthContext';
import { useFeatureFlags } from '../src/hooks/useFeatureFlags';
import { useTheme } from '../src/context/ThemeContext';
import { homeHref } from '../src/navigation/items';
import { noteContextHref, noteContextLabel } from '../src/notes/noteLabel';
import { Header } from '../src/components/Header';
import { Text } from '../src/components/Text';
import { Button } from '../src/components/Button';
import { EmptyState } from '../src/components/EmptyState';
import { ErrorState } from '../src/components/ErrorState';
import { LoadingState } from '../src/components/LoadingState';
import { CopyDetailsButton } from '../src/components/CopyDetailsButton';

/** All of the signed-in user's private notes, newest first. Tapping a note opens where it was written. */
export default function NotesScreen() {
  const { user } = useAuth();
  const flags = useFeatureFlags();
  const router = useRouter();
  const { colors, typography, spacing } = useTheme();
  const [items, setItems] = useState<NoteListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<{ message: string; info: ErrorDetails | null } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async (next: string | null) => {
    if (next) setMore(true); else setLoading(true);
    setError(null);
    try {
      const page = await api.getAllPrivateNotes(next);
      if (!alive.current) return;
      setItems((old) => (next ? [...old, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (cause) {
      if (alive.current) setError({ message: toUserMessage(cause, 'Could not load your notes.'), info: errorDetailsOf(cause) });
    } finally {
      if (alive.current) { setLoading(false); setMore(false); }
    }
  }, []);
  useEffect(() => { if (user) void load(null); }, [user, load]);

  const back = () => (router.canGoBack() ? router.back() : router.replace(homeHref(flags)));
  const body = loading ? (
    <LoadingState title="Loading notes" message="Fetching your private notes." />
  ) : error && items.length === 0 ? (
    <View>
      <ErrorState title="Could not load your notes" message={`${error.message} Check your connection and press Retry.`} onRetry={() => void load(null)} retryLabel="Retry" />
      <View style={{ paddingHorizontal: spacing.base }}>
        <CopyDetailsButton report={{ ...(error.info ?? {}), message: error.message, step: 'Load notes', at: error.info?.at ?? new Date() }} />
      </View>
    </View>
  ) : items.length === 0 ? (
    <EmptyState icon="create-outline" title="No notes yet" message="Notes you add on a pull request or a screenshot show up here." />
  ) : (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: spacing.base, gap: 8 }}
      renderItem={({ item }) => {
        const href = noteContextHref(item.context);
        const label = noteContextLabel(item.context);
        return (
          <Pressable
            accessibilityRole={href ? 'link' : 'text'}
            accessibilityLabel={`Note on ${label}: ${item.text.slice(0, 80)}`}
            disabled={!href}
            onPress={() => href && router.push(href as never)}
            style={{ minHeight: 44, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 4 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text numberOfLines={1} style={[typography.caption, { color: colors.brandLight, fontWeight: '600', flex: 1 }]}>{label}</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            </View>
            <Text numberOfLines={3} style={[typography.body, { color: colors.text }]}>{item.text}</Text>
          </Pressable>
        );
      }}
      ListFooterComponent={
        <View style={{ gap: 8, paddingTop: 8 }}>
          {error ? (
            <View accessibilityRole="alert" style={{ gap: 6 }}>
              <Text style={[typography.footnote, { color: colors.riskHigh }]}>{error.message} Press Load more to try again.</Text>
              <CopyDetailsButton report={{ ...(error.info ?? {}), message: error.message, step: 'Load more notes', at: error.info?.at ?? new Date() }} />
            </View>
          ) : null}
          {cursor ? <Button title={more ? 'Loading…' : 'Load more'} variant="secondary" disabled={more} onPress={() => void load(cursor)} /> : null}
        </View>
      }
    />
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="Notes" showBack onBack={back} />
      {user ? body : <LoadingState title="Checking your session..." message="Verifying access before loading notes." />}
    </View>
  );
}
