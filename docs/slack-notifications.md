# Slack notifications for repo activity

`.github/workflows/slack-notify.yml` posts notable GitHub activity for this repo to a Slack channel:

- PRs opened or merged
- Issues opened or closed
- CI failures on `main` (Backend CI, Frontend CI, Commit Lint)
- Releases / tags published

## One-time setup

1. In Slack, create an [Incoming Webhook](https://api.slack.com/messaging/webhooks) for the target channel (Slack app admin → **Incoming Webhooks** → **Add New Webhook to Workspace**). Copy the webhook URL (`https://hooks.slack.com/services/...`).
2. Add it as a repo secret:

   ```sh
   gh secret set SLACK_WEBHOOK_URL --body "https://hooks.slack.com/services/..."
   ```

   or via **Settings → Secrets and variables → Actions → New repository secret** in the GitHub UI.

That's it — the workflow reads `secrets.SLACK_WEBHOOK_URL` and needs no further configuration.

## Why CI failures are scoped to `main`

`backend-ci` and `frontend-ci` run on every PR by design (see the header comments in those workflow files), so a failure notification on every WIP PR push would be noisy. `slack-notify.yml` only alerts on failures that land on `main` — PR authors already see their own CI status in the PR itself.

## Tuning what counts as "notable"

Each event type is its own job in `slack-notify.yml`, gated by an `if:` condition. To add or remove events (e.g. PR review requests, issue comments), edit the relevant job's `if:` and the `on:` trigger at the top of the file — see [GitHub's webhook event payload docs](https://docs.github.com/en/webhooks/webhook-events-and-payloads) for available fields.
