import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { Card, Project } from '@mergemate/contracts';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Header } from '../components/Header';
import { Text } from '../components/Text';
import { PrivateNotes } from '../components/PrivateNotes';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { VoiceNoteRecorder } from '../components/VoiceNoteRecorder';
import { BoardPicker } from './BoardPicker';
import { AddToBoard, cardTitle } from './AddToBoard';

/** Voice or text capture. Nothing free-roams: it becomes a new card on a board, or a private note on one of its cards. */
export function CaptureNoteScreen({ kind }: { kind: 'voice' | 'text' }) {
  const { colors, typography, spacing, radius } = useTheme();
  const { user, isDemo } = useAuth();
  const params = useLocalSearchParams<{ project?: string }>();
  const [board, setBoard] = useState<Project | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [cardsError, setCardsError] = useState(false);
  const [reload, setReload] = useState(0);
  const [target, setTarget] = useState<Card | 'new'>('new');
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    setCards(null); setCardsError(false); setTarget('new');
    if (!board) return;
    let live = true;
    api.getBrainBoard(board.id).then((res) => { if (live) setCards(res.cards.filter((card) => card.status === 'open' || card.status === 'active')); }, () => { if (live) { setCards([]); setCardsError(true); } });
    return () => { live = false; };
  }, [board, reload]);

  const title = kind === 'voice' ? 'Voice note' : 'Text note';
  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <TouchableOpacity key={label} onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={label}
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: selected ? colors.brandLight : colors.border, backgroundColor: selected ? colors.brandSubtle : colors.surface }}>
      <Text numberOfLines={1} style={[typography.body, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title={title} showBack />
      <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60, gap: spacing.md, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
        {!user || isDemo ? (
          <EmptyState icon="lock-closed-outline" title="Sign in to capture" message="Sign in with GitHub to capture notes for your boards. Nothing is saved in the demo." />
        ) : (
          <>
            <BoardPicker defaultProjectId={typeof params.project === 'string' ? params.project : undefined} value={board} onChange={setBoard} />
            {board ? (
              <View style={{ gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel="Where this note goes">
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Goes to</Text>
                {chip('A new card', target === 'new', () => setTarget('new'))}
                {cards === null ? <LoadingState title="Loading cards…" message="Getting the open cards on this board." />
                  : cardsError ? <ErrorState title="Could not load this board's cards" message="You can still add the note as a new card, or try again." onRetry={() => setReload((n) => n + 1)} retryLabel="Try again" />
                  : cards.map((card) => chip(`Card: ${card.title}`, target !== 'new' && target.id === card.id, () => setTarget(card)))}
              </View>
            ) : null}
            {board && target !== 'new' ? (
              <View style={{ gap: 6 }}>
                <Text style={[typography.body, { color: colors.textSecondary }]}>Saved as a private note on this card. Not posted to GitHub.</Text>
                <PrivateNotes context={{ kind: 'card', projectId: board.id, cardId: target.id }} />
              </View>
            ) : board ? (
              <View style={{ gap: 8 }}>
                <Text style={[typography.body, { color: colors.textSecondary }]}>
                  {kind === 'voice' ? 'Record, transcribe, review the text, then add it to the board as a new card.' : 'Write the note, then add it to the board as a new card.'}
                </Text>
                {kind === 'voice' ? <VoiceNoteRecorder onTranscript={(value) => setText((old) => (old ? `${old}\n${value}` : value))} onBusyChange={setRecording} /> : null}
                <TextInput value={text} onChangeText={setText} multiline maxLength={8000} editable={!recording} placeholder={kind === 'voice' ? 'The transcript appears here. Edit it before adding.' : 'What should the agent or team know?'}
                  placeholderTextColor={colors.textMuted} accessibilityLabel="Note text"
                  style={{ minHeight: 120, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, backgroundColor: colors.surfaceElevated, textAlignVertical: 'top' }} />
                {text.trim() ? (
                  <AddToBoard defaultProjectId={board.id} draft={() => ({ title: cardTitle(text.trim(), title), details: text.trim() })} />
                ) : (
                  <Text style={[typography.caption, { color: colors.textMuted }]}>{kind === 'voice' ? 'Transcribe a recording or type to add it.' : 'Type a note to add it.'}</Text>
                )}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
