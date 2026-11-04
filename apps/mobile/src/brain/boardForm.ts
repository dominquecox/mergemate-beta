import type { Project } from '@mergemate/contracts';

const PART = /^[A-Za-z0-9_.-]{1,100}$/;

/** Splits "owner/repo" for the create-board request; null when it is not a plain repository name. */
export function splitRepoName(fullName: string): { owner: string; repo: string } | null {
  const [owner, repo, ...rest] = fullName.split('/');
  if (rest.length > 0 || !owner || !repo || !PART.test(owner) || !PART.test(repo)) return null;
  return { owner, repo };
}

/** The board already made for this repository, if any (GitHub names are case-insensitive). */
export function findBoard(projects: Project[], owner: string, repo: string): Project | undefined {
  return projects.find((p) => p.owner.toLowerCase() === owner.toLowerCase() && p.repo.toLowerCase() === repo.toLowerCase());
}
