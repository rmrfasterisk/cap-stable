# Cap Stable - Fork Workflow

This repository is a managed fork of [Cap](https://github.com/CapSoftware/Cap), the open source Loom alternative.

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `master` | **Our source of truth.** Contains company-specific customizations and is deployed to production. |
| `stable` | Mirror of the latest upstream release tag (`cap-vX.Y.Z`). Used for syncing upstream changes. |

---

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     CapSoftware/Cap (upstream)                  │
│                              │                                  │
│                    release tags: cap-vX.Y.Z                     │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        stable branch                            │
│              (reset to latest cap-vX.Y.Z tag)                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                          cherry-pick / merge
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        master branch                            │
│          (company customizations + upstream updates)            │
│                                                                 │
│                    ──► DEPLOYED TO PRODUCTION                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Principles

1. **`master` is sacred** — All company work happens here. This branch is deployed.

2. **`stable` is disposable** — Never commit directly to it. It gets force-reset to upstream releases.

3. **Upstream tags only** — We track `cap-vX.Y.Z` release tags, not upstream `main`.

4. **Selective integration** — Cherry-pick or merge from `stable` into `master` as needed.

---

## Common Tasks

### Initial Setup

```bash
git remote add upstream https://github.com/CapSoftware/Cap.git
git fetch upstream --tags
```

### Sync Upstream Release into `stable`

See [STABLE_BRANCH_CHEATSHEET.md](./STABLE_BRANCH_CHEATSHEET.md) for detailed commands.

```bash
git fetch upstream --tags
LATEST_TAG=$(git tag -l "cap-v*" --sort=-v:refname | head -n 1)
git checkout stable
git reset --hard "$LATEST_TAG"
git push origin stable --force-with-lease
```

### Integrate Upstream Changes into `master`

Option A: Merge entire release
```bash
git checkout master
git merge stable
```

Option B: Cherry-pick specific commits
```bash
git checkout master
git cherry-pick <commit-hash>
```

### Check Available Upstream Releases

```bash
git fetch upstream --tags
git tag -l "cap-v*" --sort=-v:refname | head -n 10
```

---

## Related Documentation

- [STABLE_BRANCH_CHEATSHEET.md](./STABLE_BRANCH_CHEATSHEET.md) — Quick reference for `stable` branch management
- [Upstream Cap Repository](https://github.com/CapSoftware/Cap)
