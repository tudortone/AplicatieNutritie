# Reguli de Protecție a Ramurii `main` (Branch Protection Rules)

Pentru a asigura stabilitatea aplicației și securitatea codului din producție, ramura `main` este protejată conform următoarelor reguli:

## Configurare în GitHub: Settings -> Branches -> Add branch protection rule

1. **Branch pattern name**: `main`
2. **Require a pull request before merging**:
   - Require approvals: `1`
   - Dismiss stale pull request approvals when new commits are pushed: `Checked`
3. **Require status checks to pass before merging**:
   - Require branches to be up to date before merging: `Checked`
   - Status checks obligatorii:
     - `Backend Lint & Tests`
     - `Frontend Typecheck & Lint`
4. **Require conversation resolution before merging**: `Checked`
5. **Do not allow bypassing the above settings**: `Checked` (valabil inclusiv pentru administratori)
6. **Restrict who can push to matching branches**: Niciun push direct pe `main`. Toate modificările trec prin Pull Request.
