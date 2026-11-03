# Review workspace and playbooks

The Inbox is the review home: a branded introduction, shortcuts to existing PR search/triage/alerts, a playbook entry, and compact PR cards. Loaded/review counts describe the currently loaded filter, not global totals. The existing four mobile tabs remain; desktop also links to playbooks in its sidebar. Both light and dark themes retain MergeMate's existing colors and risk semantics.

## Playbooks

Open Review playbooks from the Inbox header, its Build your review flow button, or the desktop sidebar. Templates cover everyday reviews, sensitive changes, and UI/accessibility reviews. Edit flow changes the name and selected review steps. Choose at least two; selections append in the order chosen. Save playbook stores one preference for the signed-in account on this device. Loading/writing failures are visible, and a failed write never displays a successful save.

A saved playbook contains only its title and step identifiers. It is account-scoped, bounded below the native secure-storage item budget, and removed with account-data cleanup/sign-out. Web uses localStorage; native uses the existing secure-storage adapter. No PR URL, PR content, notes or completion history is saved. A later account cannot read another account's saved preference. Drafts and review progress live only in the mounted account workspace.

Paste a direct HTTPS GitHub PR URL, then Start guided review. Open PR workspace uses the normal authenticated PR route and existing access checks; return to the playbook to mark your own progress. Changing the URL or flow resets progress. Reset review progress starts again. No credentials, query strings, external domains or arbitrary URL schemes are accepted.

Checked steps are human checklist progress, not CI/security certification. This feature does not approve/merge PRs, invoke models, run tests, or create background automations. Risk verdicts and execution evidence retain their existing sources. The existing PR workspace provides explicit AI, check/file review, private notes and GitHub handoff actions.

## Validation and owner acceptance

Unit coverage validates templates, URL boundaries, session protection, account isolation, storage errors and save/cleanup sequencing. Browser QA should exercise mobile and desktop Inbox, all shortcuts, playbook create/save/reload/edit, reset on URL changes, PR handoff/back, blocked storage, light mode, keyboard navigation and 44pt targets. Browser samples do not certify physical-device keyboards, speech, live OAuth or live model execution. Native builds/installs and dev releases remain owner-operated.
