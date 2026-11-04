import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { useTheme } from '../context/ThemeContext';
import type { Card, Lock, Handoff, TrackEvent, Project } from '@mergemate/contracts';
import type { ApiClient } from '../api/client';
import { AgentPanel, type AgentPanelProps } from './AgentPanel';
import * as Clipboard from 'expo-clipboard';
import { shortCardId } from './cardLabel';
import { PrivateNotes } from '../components/PrivateNotes';

export function BoardScreen({
  project,
  cards,
  trackEvents,
  locks,
  onSelectCard,
  loading,
  error,
  onRetry,
  onAddCard,
  onEditCard,
  onMoveCard,
  agent,
}: {
  project: Project;
  cards: Card[];
  trackEvents: TrackEvent[];
  locks: Map<string, Lock>;
  onSelectCard: (cardId: string) => void;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onAddCard?: () => void;
  onEditCard?: (card: Card) => void;
  onMoveCard?: (card: Card, delta: -1 | 1) => void;
  /** Enables Proceed / Plan with agent in the card detail. */
  agent?: { api: ApiClient; onChanged: () => void };
}) {
  const styles = useBrainStyles();
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const selectedCard = cards.find((c) => c.id === selectedCardId);
  const selectedLock = selectedCardId ? locks.get(selectedCardId) : null;
  const selectedEvents = selectedCardId ? trackEvents.filter((e) => e.cardId === selectedCardId) : [];

  if (error) {
    return <ErrorState title="Could not load" message={error.message} onRetry={onRetry} />;
  }

  if (loading) {
    return <LoadingState title="Loading" message="Fetching the latest board data." />;
  }

  if (cards.length === 0) {
    return <EmptyState icon="albums-outline" title="No cards yet" message={`${project.owner}/${project.repo} has no cards.`} actionTitle={onAddCard ? "Add a card" : undefined} onAction={onAddCard} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.projectName}>{project.repo}</Text>
          <Text style={styles.boardTitle}>START HERE</Text>
          <Text style={styles.cardCount}>{cards.length} cards</Text>
        </View>

        <View style={styles.cardsSection}>
          {cards.map((card, index) => {
            const lock = locks.get(card.id);
            const isSelected = selectedCardId === card.id;

            return (
              <View key={card.id} style={styles.cardLine}>
              <TouchableOpacity
                style={[styles.cardRow, styles.cardRowFlex, isSelected && styles.cardRowSelected]}
                onPress={() => setSelectedCardId(card.id)}
                accessibilityRole="button"
                accessibilityLabel={card.title}
              >
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {card.title}
                  </Text>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardPriority}>{card.priority}</Text>
                    <Text style={styles.cardIdSmall} numberOfLines={1}>{shortCardId(card.id)}</Text>
                  </View>
                  {lock && (
                    <Text style={styles.lockInfo}>
                      {lock.agent} · {lock.tool}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
              {onMoveCard && (
                <View style={styles.rowActions}>
                  <TouchableOpacity style={styles.iconButton} disabled={index === 0} onPress={() => onMoveCard(card, -1)} accessibilityRole="button" accessibilityLabel={`Move ${card.title} up`} accessibilityState={{ disabled: index === 0 }}>
                    <Text style={[styles.iconButtonText, index === 0 && styles.iconButtonDisabled]}>Up</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconButton} disabled={index === cards.length - 1} onPress={() => onMoveCard(card, 1)} accessibilityRole="button" accessibilityLabel={`Move ${card.title} down`} accessibilityState={{ disabled: index === cards.length - 1 }}>
                    <Text style={[styles.iconButtonText, index === cards.length - 1 && styles.iconButtonDisabled]}>Down</Text>
                  </TouchableOpacity>
                </View>
              )}
              {onEditCard && (
                <TouchableOpacity style={styles.iconButton} onPress={() => onEditCard(card)} accessibilityRole="button" accessibilityLabel={`Edit ${card.title}`}>
                  <Text style={styles.iconButtonText}>Edit</Text>
                </TouchableOpacity>
              )}
              </View>
            );
          })}
        </View>

        {trackEvents.length > 0 && (
          <View style={styles.timelineSection}>
            <Text style={styles.sectionLabel}>Recent Activity</Text>
            {trackEvents.slice(0, 5).map((event) => (
              <View key={event.id} style={styles.eventItem}>
                <Text style={styles.eventKind}>{event.kind}</Text>
                <Text style={styles.eventActor}>{event.actor}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          lock={selectedLock || null}
          trackEvents={selectedEvents}
          onClose={() => setSelectedCardId(null)}
          agent={agent ? { ...agent, project } : undefined}
        />
      )}
    </SafeAreaView>
  );
}

/** The card id as small secondary text that can be selected or copied. */
function CardIdLine({ id }: { id: string }) {
  const styles = useBrainStyles();
  const [note, setNote] = useState('Copy ID');
  const copy = async () => {
    try {
      setNote((await Clipboard.setStringAsync(id)) ? 'Copied' : 'Select the ID to copy');
    } catch {
      setNote('Select the ID to copy');
    }
  };
  return (
    <View style={styles.idLine}>
      <Text selectable style={styles.idText} numberOfLines={1}>ID {id}</Text>
      <TouchableOpacity style={styles.idCopy} onPress={() => void copy()} accessibilityRole="button" accessibilityLabel="Copy card ID">
        <Text style={styles.idCopyText}>{note}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function CardDetailModal({
  card,
  lock,
  trackEvents,
  onClose,
  agent,
}: {
  card: Card;
  lock: Lock | null;
  trackEvents: TrackEvent[];
  onClose: () => void;
  agent?: Omit<AgentPanelProps, 'card' | 'lock' | 'onLeave'>;
}) {
  const styles = useBrainStyles();
  return (
    <Modal visible={true} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.modalContainer} edges={['left', 'right', 'bottom']}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.closeTarget} accessibilityRole="button" accessibilityLabel="Back to board">
            <Text style={styles.closeButton}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle} numberOfLines={1} accessibilityRole="header">{card.title}</Text>
          <View style={styles.spacer} />
        </View>

        <ScrollView style={styles.modalContent}>
          <View style={styles.section}>
            <Text style={styles.title}>{card.title}</Text>
            <View style={styles.badges}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{card.priority}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{card.status}</Text>
              </View>
            </View>
            <CardIdLine id={card.id} />
          </View>

          {card.details && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Details</Text>
              <Text style={styles.text}>{card.details}</Text>
            </View>
          )}

          {card.doneWhen && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Done When</Text>
              <Text style={styles.text}>{card.doneWhen}</Text>
            </View>
          )}

          {lock && (
            <View style={[styles.section, styles.lockSection]}>
              <Text style={styles.sectionLabel}>Locked</Text>
              <Text style={styles.text}>Agent: {lock.agent}</Text>
              <Text style={styles.text}>Tool: {lock.tool}</Text>
              <Text style={styles.text}>
                Expires: {new Date(lock.expiresAt).toLocaleString()}
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.text}>Private to you: typed or recorded notes for this card. Not posted to GitHub.</Text>
            <PrivateNotes context={{ kind: 'card', projectId: card.projectId, cardId: card.id }} />
          </View>
          {trackEvents.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>History</Text>
              {trackEvents.map((event) => (
                <View key={event.id} style={styles.historyEvent}>
                  <Text style={styles.eventKind}>{event.kind.toUpperCase()}</Text>
                  <Text style={styles.eventActor}>{event.actor}</Text>
                  {event.text && <Text style={styles.text}>{event.text}</Text>}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
        {agent ? <AgentPanel {...agent} card={card} lock={lock} onLeave={onClose} /> : null}
      </SafeAreaView>
    </Modal>
  );
}

export function ProjectsListScreen({
  projects,
  selectedProjectId,
  onSelectProject,
  loading,
  error,
  onRetry,
  onNewBoard,
}: {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onNewBoard?: () => void;
}) {
  const styles = useBrainStyles();
  if (error) {
    return <ErrorState title="Could not load" message={error.message} onRetry={onRetry} />;
  }

  if (loading) {
    return <LoadingState title="Loading" message="Fetching the latest board data." />;
  }

  if (projects.length === 0) {
    return <EmptyState icon="albums-outline" title="No projects" message="Create a board for a repository to see it here." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Projects</Text>
        {onNewBoard ? (
          <TouchableOpacity style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 12 }} onPress={onNewBoard} accessibilityRole="button" accessibilityLabel="New board">
            <Text style={styles.headerTitle}>+ New board</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={projects}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.projectRow,
              selectedProjectId === item.id && styles.projectRowSelected,
            ]}
            onPress={() => onSelectProject(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open board for ${item.owner}/${item.repo}`}
          >
            <View style={styles.projectContent}>
              <Text style={styles.projectOwner}>{item.owner}</Text>
              <Text style={styles.projectRepo}>{item.repo}</Text>
            </View>
            <Text style={styles.projectArrow}>→</Text>
          </TouchableOpacity>
        )}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

export function TrackTimelineScreen({
  events,
  loading,
}: {
  events: TrackEvent[];
  loading: boolean;
}) {
  const styles = useBrainStyles();
  if (loading) {
    return <LoadingState title="Loading" message="Fetching the latest board data." />;
  }

  if (events.length === 0) {
    return <EmptyState icon="time-outline" title="No events" message="Nothing has been logged on this track yet." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Track Timeline</Text>
      </View>

      <FlatList
        data={events}
        renderItem={({ item }) => (
          <View style={styles.timelineEvent}>
            <View style={styles.timeline}>
              <View style={styles.dot} />
              <View style={styles.line} />
            </View>
            <View style={styles.eventContent}>
              <Text style={styles.eventKind}>{item.kind.toUpperCase()}</Text>
              <Text style={styles.eventActor}>{item.actor}</Text>
              {item.text && <Text style={styles.text}>{item.text}</Text>}
            </View>
          </View>
        )}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

type BrainColors = ReturnType<typeof useTheme>["colors"];

/** Theme-aware styles, so the board reads in light and dark mode. */
const makeStyles = (c: BrainColors) => StyleSheet.create({
  closeTarget: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: c.background,
  },
  content: {
    flex: 1,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  closeButton: {
    fontSize: 16,
    fontWeight: '600',
    color: c.brandLight,
  },
  spacer: {
    width: 60,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: c.text,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: c.text,
  },
  projectName: {
    fontSize: 14,
    fontWeight: '500',
    color: c.textSecondary,
  },
  boardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: c.text,
    marginTop: 4,
  },
  cardCount: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 4,
  },
  cardsSection: {
    padding: 16,
  },
  timelineSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.surface,
    marginTop: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  cardRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: c.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  cardLine: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cardRowFlex: {
    flex: 1,
  },
  rowActions: {
    flexDirection: 'column',
    marginLeft: 4,
    marginBottom: 8,
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 8,
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.brandLight,
  },
  iconButtonDisabled: {
    color: c.textMuted,
  },
  cardRowSelected: {
    backgroundColor: c.brandSubtle,
    borderColor: c.brandLight,
    borderWidth: 2,
  },
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  cardIdSmall: {
    fontSize: 11,
    color: c.textMuted,
    flexShrink: 1,
  },
  idLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  idText: {
    fontSize: 11,
    color: c.textMuted,
    flexShrink: 1,
  },
  idCopy: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  idCopyText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.brandLight,
  },
  cardPriority: {
    fontSize: 10,
    fontWeight: '600',
    color: c.brandLight,
    backgroundColor: c.brandSubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: c.text,
    lineHeight: 18,
  },
  lockInfo: {
    fontSize: 11,
    color: c.statusWarning,
    marginTop: 4,
    fontWeight: '500',
  },
  section: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.surface,
    marginBottom: 8,
  },
  lockSection: {
    backgroundColor: c.statusWarningBg,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: c.text,
    marginBottom: 8,
  },
  text: {
    fontSize: 14,
    color: c.text,
    lineHeight: 20,
    marginVertical: 4,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    backgroundColor: c.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: c.text,
  },
  historyEvent: {
    paddingVertical: 8,
    marginVertical: 4,
    borderLeftWidth: 2,
    borderLeftColor: c.borderLight,
    paddingLeft: 12,
  },
  eventKind: {
    fontSize: 11,
    fontWeight: '600',
    color: c.brandLight,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  eventActor: {
    fontSize: 13,
    fontWeight: '500',
    color: c.text,
  },
  eventItem: {
    paddingVertical: 6,
    marginBottom: 4,
  },
  timelineEvent: {
    flexDirection: 'row',
    paddingVertical: 12,
  },
  timeline: {
    alignItems: 'center',
    marginRight: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.brandLight,
  },
  line: {
    width: 2,
    height: 60,
    backgroundColor: c.borderLight,
    marginTop: 8,
  },
  eventContent: {
    flex: 1,
  },
  projectRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 8,
    marginBottom: 8,
    backgroundColor: c.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  projectRowSelected: {
    backgroundColor: c.brandSubtle,
    borderColor: c.brandLight,
    borderWidth: 2,
  },
  projectContent: {
    flex: 1,
  },
  projectOwner: {
    fontSize: 12,
    fontWeight: '500',
    color: c.textSecondary,
    marginBottom: 2,
  },
  projectRepo: {
    fontSize: 15,
    fontWeight: '600',
    color: c.text,
  },
  projectArrow: {
    fontSize: 18,
    fontWeight: '400',
    color: c.borderLight,
  },
  listContent: {
    paddingVertical: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  errorText: {
    fontSize: 16,
    color: c.statusAlert,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: c.brand,
    borderRadius: 6,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: c.textSecondary,
  },
  emptySubtext: {
    fontSize: 13,
    color: c.textMuted,
    marginTop: 4,
  },
  spinner: {
    marginTop: 40,
  },
});

export function useBrainStyles() {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [colors]);
}
