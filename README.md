# Silpa cloud operations

A cloud integration service for the existing Silpa workspace, designed to keep running when the office PC is off. The workspace website/database remain hosted in Sites; this service handles the paired WhatsApp session, message queue, automatic coordination replies and report delivery.

## Render plan

One Starter Docker web service in Singapore, one 1 GB persistent disk, one generated owner access token. The infrastructure plan must be reviewed and approved before applying it. Automatic source deployments are disabled. No subscription or resource has been purchased by writing this repository.

Open the deployed service and sign in using ADMIN_TOKEN from Render's Environment page. Pair WhatsApp using the QR code. Cloud replies initially stay paused. Stop the Windows responder before enabling them. Only the exact configured group ID and name are accepted. The control panel and pairing code require authentication; /healthz reports process health only.

Office replies: 10:00 inclusive to 18:00 exclusive Asia/Kathmandu. Queue checks every 2 seconds, at least 10 seconds between messages and a maximum of 120 sends/hour. The visible Silpa Assistant label is retained. Current replies use message rules; this build does not claim general AI interpretation or create/update workspace records by itself.

## Workspace synchronization

Set WORKSPACE_BRIDGE_KEY and WORKSPACE_ACCESS_TOKEN as service secrets. The owner must configure an accepted workspace bridge key; never forge visitor headers. The worker posts new group messages in batches and acknowledges report delivery every 30 seconds. Workspace-side rules decide whether to create a task needing review or retain a message as a reference/daily log. Stable source IDs prevent duplicate imports. Submitted daily reports are pulled through the existing workspace outbox and sent to the group. Workspace edits are read by its existing API, not a second copied database. Credentials are not included in this repository. If keys are missing, the control panel explicitly reports that sync is not configured.

Gmail/Drive OAuth synchronization is not implemented here. Existing ChatGPT app connections do not automatically authorize a background service. Do not claim those sources are synchronized.

## Data and delivery behavior

Session credentials and Signal keys are saved transactionally in SQLite, together with source IDs and delivery receipts, on the persistent disk. Back up and protect that volume; never commit it. New WhatsApp notifications are used; historical messages and own-account messages are not replayed. A send is marked sending before the provider call. Unconfirmed/interruptions are marked uncertain and not automatically retried to avoid duplicates. This reduces duplicates but cannot guarantee exactly-once delivery across external network failures.

Pending messages expire after 24 hours. Manual and report delivery can run outside office hours; automatic coordination replies obey office hours. Unknown group membership/name mismatch prevents sending. This is an unofficial WhatsApp Web library; pairing/session expiry may require phone intervention.

## Verification

Run npm ci --ignore-scripts and npm test on Node 24. Test authenticated/unauthenticated control endpoints and SQLite credential persistence. A successful build does not prove WhatsApp pairing or workspace access: after deployment, verify a user-authorized message, its receipt, and workspace readback before claiming live operation.

Source library: https://github.com/WhiskeySockets/Baileys (pinned dependency in package-lock.json). This cloud implementation uses a new linked-device session rather than copying inaccessible Windows files or DPAPI secrets.
