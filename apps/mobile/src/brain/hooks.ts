import { useEffect, useState, useCallback } from 'react';
import type { Project, Card, Lock, Handoff, TrackEvent, CreateCardRequest, UpdateCardRequest } from '@mergemate/contracts';
import type { ApiClient } from '../api/client';

export interface UseBrainBoardOptions {
  projectId: string;
  api: ApiClient;
  enabled?: boolean;
}

export interface UseBrainBoardResult {
  project: Project | null;
  cards: Card[];
  locks: Map<string, Lock>;
  handoffs: Map<string, Handoff>;
  trackEvents: TrackEvent[];
  loading: boolean;
  error: Error | null;
  retry: () => void;
}

/** Hook to fetch board data from the brain API. Behind "brain" flag. */
export function useBrainBoard({
  projectId,
  api,
  enabled = true,
}: UseBrainBoardOptions): UseBrainBoardResult {
  const [project, setProject] = useState<Project | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [locks, setLocks] = useState<Map<string, Lock>>(new Map());
  const [handoffs, setHandoffs] = useState<Map<string, Handoff>>(new Map());
  const [trackEvents, setTrackEvents] = useState<TrackEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchBoard = useCallback(async () => {
    if (!enabled || !projectId) return;

    try {
      setLoading(true);
      setError(null);

      // Call brain API via client
      const boardData = await api.getBrainBoard(projectId);
      setProject(boardData.project);
      setCards(boardData.cards);

      // Build maps for efficient lookup
      const locksMap = new Map<string, Lock>();
      for (const lock of boardData.locks) {
        locksMap.set(lock.cardId, lock);
      }
      setLocks(locksMap);

      setTrackEvents(boardData.trackTail);
      setHandoffs(new Map()); // TODO: fetch from card detail endpoint if needed
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch board'));
    } finally {
      setLoading(false);
    }
  }, [projectId, enabled, api]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  return {
    project,
    cards,
    locks,
    handoffs,
    trackEvents,
    loading,
    error,
    retry: fetchBoard,
  };
}

export interface UseProjectsListOptions {
  api: ApiClient;
  enabled?: boolean;
}

export interface UseProjectsListResult {
  projects: Project[];
  loading: boolean;
  error: Error | null;
  retry: () => void;
}

/** Hook to fetch projects list from the brain API. */
export function useProjectsList({ api, enabled = true }: UseProjectsListOptions): UseProjectsListResult {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!enabled) return;

    try {
      setLoading(true);
      setError(null);

      const res = await api.getBrainProjects();
      setProjects(res.projects);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch projects'));
    } finally {
      setLoading(false);
    }
  }, [enabled, api]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return { projects, loading, error, retry: fetchProjects };
}

export interface UseBrainActionsOptions {
  api: ApiClient;
  projectId: string;
  /** Called after a write succeeds so the board refetches. */
  onChanged: () => void;
}

/** Owner writes: add, edit, reorder cards and edit the project rules. One write at a time. */
export function useBrainActions({ api, projectId, onChanged }: UseBrainActionsOptions) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (write: () => Promise<unknown>): Promise<boolean> => {
      if (busy) return false;
      setBusy(true);
      setError(null);
      try {
        await write();
        onChanged();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save. Try again.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, onChanged],
  );

  return {
    busy,
    error,
    clearError: useCallback(() => setError(null), []),
    createCard: (request: CreateCardRequest) => run(() => api.createBrainCard(request)),
    updateCard: (request: UpdateCardRequest) => run(() => api.updateBrainCard(request)),
    moveCard: (cardId: string, newPosition: number) => run(() => api.reorderBrainCard({ projectId, cardId, newPosition })),
    saveRules: (rules: string) => run(() => api.setBrainRules(projectId, rules)),
  };
}

// Component prop types for strict typing
export interface BoardScreenProps {
  project: Project;
  cards: Card[];
  trackEvents: TrackEvent[];
  locks: Map<string, Lock>;
  onSelectCard: (cardId: string) => void;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}

export interface CardDetailProps {
  card: Card;
  lock: Lock | null;
  handoff: Handoff | null;
  trackEvents: TrackEvent[];
  onClose: () => void;
}

export interface ProjectsListScreenProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}

export interface TrackTimelineProps {
  events: TrackEvent[];
  loading: boolean;
}
