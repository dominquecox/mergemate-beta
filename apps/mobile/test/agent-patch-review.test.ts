import {describe,expect,it} from 'vitest';
import {allPatchFilesReviewed} from '../src/workflows/patch-review';

const proposal={runId:'run_1',jobId:'job_1',repository:'owner/repo',repositoryId:101,headSha:'a'.repeat(40),patchHash:'b'.repeat(64),action:'qa_and_draft_pr' as const,summary:'Two exact changes',changes:[{path:'apps/mobile/src/a.ts',content:'export const a = 1;'},{path:'apps/mobile/src/b.ts',content:'export const b = 2;'}]};

describe('exact patch inspection gate',()=>{
  it('requires every proposed file to be opened before passkey approval',()=>{
    expect(allPatchFilesReviewed(proposal,[])).toBe(false);
    expect(allPatchFilesReviewed(proposal,[proposal.changes[0]!.path])).toBe(false);
    expect(allPatchFilesReviewed(proposal,proposal.changes.map(change=>change.path))).toBe(true);
  });

  it('fails closed while no proposal or no files are available',()=>{
    expect(allPatchFilesReviewed(null,[])).toBe(false);
    expect(allPatchFilesReviewed({...proposal,changes:[]},[])).toBe(false);
  });
});
