# Stable Branch Cheatsheet

**TL;DR:** Create or update `stable` from the latest upstream `cap-v*` release tag.

---

## Disclaimers

* `stable` is force-reset to match upstream releases — **never commit directly to `stable`**.
* Only release tags (`cap-vX.Y.Z`) are trusted — **ignore upstream `main`**.
* `git reset --hard` and `--force-with-lease` overwrite history — **safe only because `stable` should never contain personal work**.
* Always keep personal branches (e.g., `my-changes`) separate from `stable`.

---

## 1. Create `stable` from latest upstream release

**TL;DR:** Make a `stable` branch starting at the newest `cap-v*` tag.

```bash
git clone git@github.com:rmrfasterisk/cap-stable.git
cd cap-stable
git remote add upstream https://github.com/CapSoftware/Cap.git
git fetch upstream --tags
LATEST_TAG=$(git tag -l "cap-v*" --sort=-v:refname | head -n 1)
git checkout -b stable "$LATEST_TAG"
git push origin stable
```

---

## 2. Update `stable` to the latest upstream release

**TL;DR:** Move `stable` to the newest `cap-v*` tag.

```bash
git fetch upstream --tags
LATEST_TAG=$(git tag -l "cap-v*" --sort=-v:refname | head -n 1)
git checkout stable
git reset --hard "$LATEST_TAG"
git push origin stable --force-with-lease
```
