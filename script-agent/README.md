# Google Docs script agent — GitHub Actions

Runs on GitHub Actions. No Render deployment is needed. Existing repository applications are unchanged. This public repository contains generic agent code, not the target document ID, script or credentials.

## Activate

1. In **Settings → Secrets and variables → Actions → Secrets**, add:
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: complete JSON key for a Google Cloud service account.
   - `GOOGLE_DOCUMENT_ID`: target Google Doc ID, taken from its URL.
   - `OPENAI_API_KEY`: API key with access to the desired model.
2. In the **Variables** tab, add:
   - `OPENAI_MODEL`: a Responses API model available to that account.
   - `DOC_AGENT_ENABLED`: set to `true` when ready to start.
3. Enable Google Docs API and Google Drive API in Google Cloud. Share the target Doc with the service account's `client_email` as **Editor**. Domain sharing rules may require the owner/administrator. No domain-wide delegation is needed.
4. Open **Actions → Document script review → Run workflow** to verify the first run. Scheduled checks run approximately every five minutes. GitHub can delay or drop scheduled runs; this is periodic checking, not real-time collaboration.
5. Verify a proposal appears in the Doc's `Script Agent Review` tab and the original script is unchanged. Make one small authorized source edit and verify exactly one new proposal appears after a later check. Unchanged checks should not call the model again.

Without the secrets, document sharing and enable variable, the agent is NOT live. The ChatGPT Google connection does not authorize this process. Do not paste keys into chat, source files or issues.

## Each run

- Reads current source tabs, tables, all pages of comments and replies. It does not retrieve Google revision history or know the previous ChatGPT conversation.
- Excludes its own reserved review tab from change detection and exits immediately if the source fingerprint was already reviewed.
- Otherwise waits 90 seconds and compares source/comments again. New changes defer review. This comparison cannot detect typing that is reverted to exactly the original text between observations.
- Sends the current source and feedback to the configured OpenAI API account, with `store: false`, to propose narration, visuals and questions for client confirmation. It does not browse for missing facts or invent figures.
- Rechecks source/comments after generation and guards writes with the document revision. Stale proposals are discarded.
- Appends proposals in the reserved review tab. Source tabs are never edited; comments are never posted, resolved or deleted. Copy accepted revisions into the source manually. Leave editorial feedback as comments on source tabs.

Resolved comments are historical context unless current feedback explicitly says a resolved thread remains outstanding. The review tab is append-only and stops at 250,000 characters; archive/rename it manually to start a new one. Do not run a Render worker for the same document simultaneously.

## Limits and stopping

Only one workflow job runs at a time. Each invocation is bounded. Successful review timestamps enforce at most six reviews per hour. Failed model attempts do not persist between jobs and can repeat; configure provider-side spending limits.

Set `DOC_AGENT_ENABLED=false` to skip future reviews, or disable the workflow under Actions. Cancel an active run separately if necessary. Scheduling is best-effort; GitHub can disable scheduled workflows in inactive public repositories. AI API charges and GitHub account runner limits/pricing apply.

The agent does not print document text, comments, keys or AI output to logs. Status/error categories are logged. Passing local mocked tests does not prove live Google/OpenAI access.

## Local tests

Requires Node 24 or later; no dependencies or install step:

```sh
cd script-agent
npm test
```

Tests cover tables/tabs, comments, typing pauses, duplicate prevention, concurrent edits, source isolation, inaccessible comments and rate limits.

References: [Google Docs tabs](https://developers.google.com/workspace/docs/api/how-tos/tabs), [Google Docs write control](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate), [GitHub scheduling](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
