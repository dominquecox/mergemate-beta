# Source provenance

MergeMate was built entirely during the Meta Global AI Developer Hackathon, as confirmed by its founder. Application implementation commits begin October 26, 2026. An October 14 repository initialization contained only `.gitattributes`; it is kept at its real date.

## History

This repository contains the full development history of the `development` branch. Every commit keeps its real dates and its message. The preparation changed only:

1. **Identity.** Every commit's author and committer is `Ploonu LLC <noreply@mergemate.dev>`. Co-author lines that named personal addresses were removed; tool co-author lines are kept.
2. **Personal and machine details.** Personal names and email addresses, home-directory paths, private build hosts and their log locations were replaced with neutral words in every file version and message.
3. **Infrastructure identifiers.** Cloudflare database, KV and namespace identifiers, GitHub App identifiers, telemetry salts, the Turnstile site key, the Expo project id and the Apple team id were replaced with conspicuous examples in every version. Reviewers configure their own services for real integration runs.
4. **Internal files.** Internal planning, ownership and limits documents, a coordination track file, and review screenshots were removed from every commit. Commits that only touched those files became empty and were dropped, so a few original commits are not present.
5. **Image metadata.** Author metadata was removed from three historical image versions.

The last three commits add the public documentation (README, this file, JUDGE_SETUP.md, NEW_IN_HACKATHON.md, SECURITY.md, THIRD_PARTY_NOTICES.md), example configuration and a standalone JetBrains Mono font license, and remove internal engineering notes from the current tree. They change no application behavior.

No issues, pull-request metadata, CI logs, build logs or private operator records are included. PR numbers in commit messages and NEW_IN_HACKATHON.md refer to the private development repository.

The included MIT license and third-party notices apply.
