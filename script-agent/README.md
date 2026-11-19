# Document script agent

Independent background worker for an authorized Google Doc. Existing repository apps are not imported, started or changed.

## Behavior

- Polls current document tabs and every page of comment threads every 30 seconds.
- Waits for 90 seconds without text/comment changes before requesting an AI review. This is an observed quiet period, not proof that nobody has the editor open.
- Reads all source tabs, including tables. Resolved comments are retained as historical context; current comments/replies can explicitly say a resolved thread is still outstanding.
- Proposes narration, matching visual directions and questions requiring client confirmation. It does not browse, read Google version history, or know the prior ChatGPT conversation.
- Appends each proposal into a reserved `Script Agent Review` tab in the SAME document. Source tabs are never edited. People can leave editorial feedback as comments on the source and copy accepted revisions back into it.
- Rechecks document and comments after generation and uses a required document revision for writes. Stale proposals are discarded. No comment threads are posted, resolved or deleted.
- Saved source fingerprints avoid repeated reviews of unchanged input, including across restarts. The review tab is append-only. It stops at 250,000 characters; archive/rename the tab manually before continuing.
- Default rate limits: at most six AI review attempts per hour per running process, with at least three minutes between attempts. Successful review timestamps also persist in the document. Failed attempts are retained only in memory and can repeat after restart. Configure provider-side spending limits as well. Run exactly one worker instance.
- No document text, comments, credentials or model output are written to console logs. The document content and comments are sent to the configured OpenAI API account to generate a review, with `store: false`.

## Required setup

The ChatGPT Google connector cannot be reused by a deployed process. Configure these in Render **Environment**, not in GitHub or chat:

| Variable | Value |
| --- | --- |
| `GOOGLE_DOCUMENT_ID` | The target document ID from its URL |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Complete JSON key for a Google Cloud service account |
| `OPENAI_API_KEY` | API key for the paid API account |
| `OPENAI_MODEL` | A Responses API model available to that account |

Enable the Google Docs API and Google Drive API in the Google Cloud project. Share the specific target Google Doc with the service account's `client_email` as **Editor**. Domain sharing rules may require the document owner or administrator to enable this. No domain-wide delegation is required. Google authorization uses documents plus Drive read-only scopes, constrained in practice to files shared with the service account.

Keep secrets in Render's protected environment fields. Do not add real values to this public repository. Do not copy this chat's access tokens or browser cookies.

## Render deployment

Use `script-agent/render.yaml` on the `docs-agent` branch as a **separate** Blueprint. Do not use the repository-root Blueprint, which is for a different service. The worker uses the Node runtime in Singapore, one `0.5c-512mb` instance, no disk/database and no inbound/public HTTP endpoint. Worker hosting and AI calls incur charges. Automatic deploys are off. The Blueprint must be reviewed before applying it; enter the four configuration variables above through the Render Dashboard.

The build runs `npm test` in `script-agent`; the start command is `npm start`. A successful build proves the mocked tests pass, not Google authorization or live editing.

After deploying, verify the reserved review tab appears after the quiet period, contains a new proposal, and the source script is unchanged. Add a small authorized source edit, then verify exactly one additional proposal appears. Confirm a subsequent unchanged polling interval produces no duplicate proposal. Suspend the worker in Render to stop ongoing processing and hosting.

## Local verification

Requires Node 24 or later. No package dependencies or install step:

```sh
cd script-agent
npm test
```

Tests cover table extraction, comment changes, editing pauses, duplicate prevention, source isolation, concurrent edits, comments authorization failure and AI rate limits. Live provider integration remains to be verified after credentials are configured.

References: [Google Docs tabs](https://developers.google.com/workspace/docs/api/how-tos/tabs), [Google Docs write control](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate), [Render background workers](https://render.com/docs/background-workers), [Render environment variables](https://render.com/docs/configure-environment-variables).
