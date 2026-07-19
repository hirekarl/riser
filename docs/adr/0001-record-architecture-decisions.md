# 1. Record architecture decisions

## Status

Accepted

## Context

We need to record the architectural decisions made on this project so the
reasoning behind them survives past the people who made them, and so future
contributors don't have to reverse-engineer intent from code and commit
history alone.

## Decision

We will use Architecture Decision Records (ADRs), as described by Michael
Nygard: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions

Each ADR is a short markdown file in `docs/adr/`, numbered sequentially, with
Status / Context / Decision / Consequences sections. ADRs are immutable once
accepted — a changed decision gets a new ADR that supersedes the old one,
rather than an edit to the original.

## Consequences

Anyone touching architecture-level decisions should add a new ADR rather than
relying on tribal knowledge or a Slack thread. `docs-sync-agent` keeps this
directory consistent with the rest of the docs.
