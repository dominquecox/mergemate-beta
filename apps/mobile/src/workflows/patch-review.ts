import type { PatchProposalValue } from './api';

export const allPatchFilesReviewed=(proposal:PatchProposalValue|null,reviewedPaths:readonly string[])=>!!proposal&&proposal.changes.length>0&&proposal.changes.every(change=>reviewedPaths.includes(change.path));
