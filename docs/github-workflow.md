# GitHub workflow for this repo

Use the `lisacheng-choco` GitHub account for pushes, PRs, and Vercel preview branches.

If the account is already present in `gh auth status`, switch the active account:

```bash
gh auth switch -h github.com -u lisacheng-choco
gh auth setup-git
```

If the account is not present yet, use `gh auth login` to add it first, then switch the active account.

For this repo, prefer pushing the feature branch directly and then opening the PR from GitHub or `gh`.

Do not ask again once this workflow is in place unless the repo or account changes.
