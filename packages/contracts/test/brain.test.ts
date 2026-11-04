import { describe, it, expect } from 'vitest';
import {
  PrioritySchema,
  CardStatusSchema,
  ToolSchema,
  TrackEventKindSchema,
  ProjectSchema,
  LockSchema,
  HandoffSchema,
  CardSchema,
  TrackEventSchema,
  AgentTokenSchema,
  CreateCardRequestSchema,
  CardLockRequestSchema,
  CardHandoffRequestSchema,
  TrackLogRequestSchema,
  LinkPrRequestSchema,
  ProceedWithTrackRequestSchema,
  ProceedWithTrackResponseSchema,
} from '../src/brain';

describe('brain contracts (spec-matched)', () => {
  describe('enums', () => {
    it('accepts valid priorities', () => {
      expect(PrioritySchema.parse('P0')).toBe('P0');
      expect(PrioritySchema.parse('P1')).toBe('P1');
      expect(PrioritySchema.parse('P2')).toBe('P2');
    });

    it('accepts valid card statuses', () => {
      expect(CardStatusSchema.parse('open')).toBe('open');
      expect(CardStatusSchema.parse('active')).toBe('active');
      expect(CardStatusSchema.parse('review')).toBe('review');
      expect(CardStatusSchema.parse('merged')).toBe('merged');
      expect(CardStatusSchema.parse('blocked')).toBe('blocked');
    });

    it('accepts valid tools', () => {
      expect(ToolSchema.parse('codex')).toBe('codex');
      expect(ToolSchema.parse('copilot')).toBe('copilot');
      expect(ToolSchema.parse('muse')).toBe('muse');
      expect(ToolSchema.parse('claude')).toBe('claude');
      expect(ToolSchema.parse('mergemate')).toBe('mergemate');
      expect(ToolSchema.parse('other')).toBe('other');
    });

    it('accepts valid track event kinds', () => {
      const kinds = ['lock', 'unlock', 'heartbeat', 'handoff', 'pr_opened', 'validation', 'verified', 'merged', 'deploy', 'note'] as const;
      kinds.forEach(kind => {
        expect(TrackEventKindSchema.parse(kind)).toBe(kind);
      });
    });
  });

  describe('ProjectSchema', () => {
    it('accepts valid project with rules ≤20k', () => {
      const project = {
        id: 'dominquecox/mergemate',
        owner: 'dominquecox',
        repo: 'mergemate',
        rules: 'No force-push. Commit every 20 min.',
        createdAt: '2026-11-04T14:00:00Z',
      };
      expect(ProjectSchema.parse(project)).toEqual(project);
    });

    it('rejects rules > 20k', () => {
      expect(() => ProjectSchema.parse({
        id: 'dominquecox/mergemate',
        owner: 'dominquecox',
        repo: 'mergemate',
        rules: 'x'.repeat(20481),
        createdAt: '2026-11-04T14:00:00Z',
      })).toThrow();
    });

    it('rejects extra fields', () => {
      expect(() => ProjectSchema.parse({
        id: 'dominquecox/mergemate',
        owner: 'dominquecox',
        repo: 'mergemate',
        rules: 'No force-push.',
        createdAt: '2026-11-04T14:00:00Z',
        extra: 'field',
      })).toThrow();
    });
  });

  describe('CardSchema', () => {
    it('accepts valid card with all fields', () => {
      const card = {
        id: 'MM-117',
        projectId: 'dominquecox/mergemate',
        position: 0,
        title: 'Board UI',
        details: 'Implement projects list, board view, card detail.',
        priority: 'P0' as const,
        status: 'active' as const,
        doneWhen: 'All UI components render correctly.',
        branch: 'copilot/mm-117-board-ui',
        prNumber: 247,
        head: '3a1dfe870c8d774d7338b43d0558be29d0f24050',
        updatedAt: '2026-11-04T14:08:07Z',
      };
      expect(CardSchema.parse(card)).toEqual(card);
    });

    it('accepts card with optional fields omitted', () => {
      const card = {
        id: 'MM-118',
        projectId: 'dominquecox/mergemate',
        position: 1,
        title: 'Card editing',
        details: 'Add/reorder/edit cards.',
        priority: 'P0' as const,
        status: 'open' as const,
        doneWhen: 'Done.',
        updatedAt: '2026-11-04T14:00:00Z',
      };
      expect(CardSchema.parse(card)).toEqual(card);
    });

    it('rejects title > 160', () => {
      expect(() => CardSchema.parse({
        id: 'MM-117',
        projectId: 'dominquecox/mergemate',
        position: 0,
        title: 'x'.repeat(161),
        details: 'Details',
        priority: 'P0',
        status: 'open',
        doneWhen: 'Done.',
        updatedAt: '2026-11-04T14:00:00Z',
      })).toThrow();
    });

    it('rejects details > 20k', () => {
      expect(() => CardSchema.parse({
        id: 'MM-117',
        projectId: 'dominquecox/mergemate',
        position: 0,
        title: 'Title',
        details: 'x'.repeat(20481),
        priority: 'P0',
        status: 'open',
        doneWhen: 'Done.',
        updatedAt: '2026-11-04T14:00:00Z',
      })).toThrow();
    });

    it('rejects invalid priority', () => {
      expect(() => CardSchema.parse({
        id: 'MM-117',
        projectId: 'dominquecox/mergemate',
        position: 0,
        title: 'Title',
        details: 'Details',
        priority: 'P3', // Invalid
        status: 'open',
        doneWhen: 'Done.',
        updatedAt: '2026-11-04T14:00:00Z',
      })).toThrow();
    });

    it('rejects negative position', () => {
      expect(() => CardSchema.parse({
        id: 'MM-117',
        projectId: 'dominquecox/mergemate',
        position: -1,
        title: 'Title',
        details: 'Details',
        priority: 'P0',
        status: 'open',
        doneWhen: 'Done.',
        updatedAt: '2026-11-04T14:00:00Z',
      })).toThrow();
    });
  });

  describe('LockSchema', () => {
    it('accepts valid lock', () => {
      const lock = {
        cardId: 'MM-117',
        agent: 'copilot',
        tool: 'copilot' as const,
        since: '2026-11-04T14:08:07Z',
        expiresAt: '2026-11-04T15:08:07Z',
      };
      expect(LockSchema.parse(lock)).toEqual(lock);
    });

    it('rejects agent > 60 chars', () => {
      expect(() => LockSchema.parse({
        cardId: 'MM-117',
        agent: 'x'.repeat(61),
        tool: 'copilot',
        since: '2026-11-04T14:08:07Z',
        expiresAt: '2026-11-04T15:08:07Z',
      })).toThrow();
    });
  });

  describe('HandoffSchema', () => {
    it('accepts handoff with optional branch and head', () => {
      const handoff = {
        cardId: 'MM-117',
        agent: 'copilot',
        stoppedAt: 'Waiting for validation.',
        branch: 'copilot/mm-117-board-ui',
        head: '3a1dfe870c8d774d7338b43d0558be29d0f24050',
        next: 'Start MM-118 after MM-115a merge.',
        at: '2026-11-04T14:08:07Z',
      };
      expect(HandoffSchema.parse(handoff)).toEqual(handoff);
    });

    it('accepts handoff without branch and head', () => {
      const handoff = {
        cardId: 'MM-117',
        agent: 'copilot',
        stoppedAt: 'Usage limit hit.',
        next: 'Continue from here.',
        at: '2026-11-04T14:08:07Z',
      };
      expect(HandoffSchema.parse(handoff)).toEqual(handoff);
    });

    it('rejects stoppedAt > 2k', () => {
      expect(() => HandoffSchema.parse({
        cardId: 'MM-117',
        agent: 'copilot',
        stoppedAt: 'x'.repeat(2049),
        next: 'Continue.',
        at: '2026-11-04T14:08:07Z',
      })).toThrow();
    });
  });

  describe('TrackEventSchema', () => {
    it('accepts valid track event', () => {
      const event = {
        id: 'event-001',
        projectId: 'dominquecox/mergemate',
        cardId: 'MM-117',
        kind: 'lock' as const,
        actor: 'copilot',
        text: 'Locked by Agent B.',
        at: '2026-11-04T14:08:07Z',
      };
      expect(TrackEventSchema.parse(event)).toEqual(event);
    });

    it('accepts event with optional cardId omitted', () => {
      const event = {
        id: 'event-002',
        projectId: 'dominquecox/mergemate',
        kind: 'deploy' as const,
        actor: 'system',
        text: 'Deployed to dev.',
        at: '2026-11-04T14:08:07Z',
      };
      expect(TrackEventSchema.parse(event)).toEqual(event);
    });

    it('rejects text > 4k', () => {
      expect(() => TrackEventSchema.parse({
        id: 'event-001',
        projectId: 'dominquecox/mergemate',
        kind: 'note',
        actor: 'copilot',
        text: 'x'.repeat(4097),
        at: '2026-11-04T14:08:07Z',
      })).toThrow();
    });
  });

  describe('AgentTokenSchema', () => {
    it('accepts valid token (no hash or secret)', () => {
      const token = {
        id: 'token-001',
        projectId: 'dominquecox/mergemate',
        name: 'Agent A token',
        tool: 'copilot' as const,
        createdAt: '2026-11-04T14:00:00Z',
        lastUsedAt: '2026-11-04T14:08:07Z',
      };
      expect(AgentTokenSchema.parse(token)).toEqual(token);
    });

    it('accepts token without lastUsedAt', () => {
      const token = {
        id: 'token-002',
        projectId: 'dominquecox/mergemate',
        name: 'Agent C token',
        tool: 'muse' as const,
        createdAt: '2026-11-04T14:00:00Z',
      };
      expect(AgentTokenSchema.parse(token)).toEqual(token);
    });

    it('rejects fields like tokenHash or revoked', () => {
      expect(() => AgentTokenSchema.parse({
        id: 'token-003',
        projectId: 'dominquecox/mergemate',
        name: 'Test',
        tool: 'copilot',
        createdAt: '2026-11-04T14:00:00Z',
        tokenHash: 'should-not-be-here',
      })).toThrow();
    });
  });

  describe('Request Schemas', () => {
    it('accepts CreateCardRequest', () => {
      const req = CreateCardRequestSchema.parse({
        projectId: 'dominquecox/mergemate',
        title: 'New Card',
        details: 'Card details',
        priority: 'P0',
        doneWhen: 'Done.',
      });
      expect(req.projectId).toBe('dominquecox/mergemate');
    });

    it('accepts CardLockRequest with ttlSeconds ≤3600', () => {
      const req = CardLockRequestSchema.parse({
        projectId: 'dominquecox/mergemate',
        cardId: 'MM-117',
        agent: 'copilot',
        tool: 'copilot',
        ttlSeconds: 3600,
      });
      expect(req.ttlSeconds).toBe(3600);
    });

    it('rejects CardLockRequest with ttlSeconds > 3600', () => {
      expect(() => CardLockRequestSchema.parse({
        projectId: 'dominquecox/mergemate',
        cardId: 'MM-117',
        agent: 'copilot',
        tool: 'copilot',
        ttlSeconds: 3601,
      })).toThrow();
    });

    it('accepts CardHandoffRequest with optional branch/head', () => {
      const req = CardHandoffRequestSchema.parse({
        projectId: 'dominquecox/mergemate',
        cardId: 'MM-117',
        agent: 'copilot',
        stoppedAt: 'Waiting for validation.',
        next: 'Continue MM-118.',
      });
      expect(req.branch).toBeUndefined();
    });

    it('accepts TrackLogRequest', () => {
      const req = TrackLogRequestSchema.parse({
        projectId: 'dominquecox/mergemate',
        cardId: 'MM-117',
        kind: 'note',
        actor: 'copilot',
        text: 'Logged a note.',
      });
      expect(req.kind).toBe('note');
    });

    it('accepts LinkPrRequest', () => {
      const req = LinkPrRequestSchema.parse({
        projectId: 'dominquecox/mergemate',
        cardId: 'MM-117',
        prNumber: 247,
        head: '3a1dfe870c8d774d7338b43d0558be29d0f24050',
      });
      expect(req.prNumber).toBe(247);
    });

    it('accepts ProceedWithTrackRequest', () => {
      const req = ProceedWithTrackRequestSchema.parse({
        projectId: 'dominquecox/mergemate',
      });
      expect(req.projectId).toBe('dominquecox/mergemate');
    });
  });

  describe('Response Schemas', () => {
    it('accepts ProceedWithTrackResponse with bounded arrays', () => {
      const resp = ProceedWithTrackResponseSchema.parse({
        card: {
          id: 'MM-117',
          projectId: 'dominquecox/mergemate',
          position: 0,
          title: 'Board UI',
          details: 'Details',
          priority: 'P0',
          status: 'active',
          doneWhen: 'Done.',
          updatedAt: '2026-11-04T14:08:07Z',
        },
        lock: {
          cardId: 'MM-117',
          agent: 'copilot',
          tool: 'copilot',
          since: '2026-11-04T14:08:07Z',
          expiresAt: '2026-11-04T15:08:07Z',
        },
        rules: 'No force-push.',
        boardTop: [],
        trackTail: [],
      });
      expect(resp.boardTop.length).toBe(0);
    });

    it('rejects boardTop > 20 items', () => {
      const card = {
        id: 'MM-117',
        projectId: 'dominquecox/mergemate',
        position: 0,
        title: 'Board UI',
        details: 'Details',
        priority: 'P0' as const,
        status: 'active' as const,
        doneWhen: 'Done.',
        updatedAt: '2026-11-04T14:08:07Z',
      };
      expect(() => ProceedWithTrackResponseSchema.parse({
        card,
        lock: {
          cardId: 'MM-117',
          agent: 'copilot',
          tool: 'copilot' as const,
          since: '2026-11-04T14:08:07Z',
          expiresAt: '2026-11-04T15:08:07Z',
        },
        rules: 'No force-push.',
        boardTop: Array(21).fill(card),
        trackTail: [],
      })).toThrow();
    });

    it('rejects trackTail > 50 items', () => {
      const card = {
        id: 'MM-117',
        projectId: 'dominquecox/mergemate',
        position: 0,
        title: 'Board UI',
        details: 'Details',
        priority: 'P0' as const,
        status: 'active' as const,
        doneWhen: 'Done.',
        updatedAt: '2026-11-04T14:08:07Z',
      };
      const event = {
        id: 'event-001',
        projectId: 'dominquecox/mergemate',
        kind: 'note' as const,
        actor: 'system',
        text: 'Event.',
        at: '2026-11-04T14:08:07Z',
      };
      expect(() => ProceedWithTrackResponseSchema.parse({
        card,
        lock: {
          cardId: 'MM-117',
          agent: 'copilot',
          tool: 'copilot' as const,
          since: '2026-11-04T14:08:07Z',
          expiresAt: '2026-11-04T15:08:07Z',
        },
        rules: 'No force-push.',
        boardTop: [],
        trackTail: Array(51).fill(event),
      })).toThrow();
    });
  });
});
