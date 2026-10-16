# Manual production deployment for ROHNY

The deployment workflow is deliberately manual. It does not run on every push and does not run until a person enters the exact confirmation value `DEPLOY_ROHNY`.

Workflow: `.github/workflows/production-deploy.yml`

## One-time GitHub configuration

In the `AMIRSLAMA/ROHNY` repository, open **Settings → Secrets and variables → Actions → New repository secret** and configure:

- `ROHNY_HOST`: the SSH hostname or IP used to reach the ROHNY server.
- `ROHNY_USER`: the SSH account that can access `/home/amir/rohny` and run `sudo systemctl restart rohny-api.service`.
- `ROHNY_SSH_KEY`: a dedicated private SSH key for deployment. Do not use or paste a personal key into chat.
- `ROHNY_KNOWN_HOSTS`: the independently verified SSH host-key line for the server (the output format used by OpenSSH's known_hosts file). Do not blindly trust a host key obtained from an unverified network connection.

The public key corresponding to `ROHNY_SSH_KEY` must be installed for `ROHNY_USER` on the server. The deployment user needs non-interactive permissions for the service restart. Keep the key dedicated to this task and revoke it if no longer needed.

## What the workflow does

1. Requires the exact `DEPLOY_ROHNY` confirmation.
2. Connects using strict SSH host-key verification.
3. Refuses to deploy unless `/home/amir/rohny` is on `main` with a clean working tree.
4. Fast-forwards to `origin/main`, installs locked backend dependencies, and builds the backend.
5. Creates a PostgreSQL custom-format backup under `/home/amir/backups/rohny`; it refuses to migrate if the backup fails or looks empty.
6. Runs TypeORM migrations, restarts `rohny-api.service`, and checks the local API health endpoint.

## Limits and recovery

This workflow cannot configure its own GitHub secrets. Before using it, configure the secrets above and verify SSH access, database backup permissions, and the service restart permission. It intentionally does not touch the separate Hesbah (8080) or Hesbah Offer (8090) projects.

A database backup is a recovery aid, not an automatic rollback. If a migration or health check fails, inspect the GitHub Actions log and server service logs before retrying. Do not restore a database backup over live data without a deliberate recovery plan.
