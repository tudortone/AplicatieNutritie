# Regula de lucru pe ramura `main`

Repository-ul folosește un flux **single-branch** pentru a evita pierderea logicii între modificările făcute în paralel de Claude și alți agenți.

## Reguli obligatorii

1. Ramura activă de dezvoltare este exclusiv `main`.
2. Nu se creează branch-uri `fix/*`, `feature/*`, `preview` sau PR-uri intermediare fără cererea expresă a proprietarului.
3. Înaintea fiecărui commit se verifică HEAD-ul curent din `main` și se recitesc fișierele care urmează să fie modificate.
4. Modificările concurente existente se păstrează și se integrează; nu se suprascrie un fișier pornind de la o versiune veche.
5. Commit-urile sunt mici, descriptive și conțin o singură schimbare logică.
6. Sunt interzise force-push, ștergerea ramurii `main` și rescrierea istoricului.
7. CI rulează la fiecare push pe `main`. Un rezultat eșuat se repară printr-un commit nou, nu prin mutarea lucrului pe alt branch.
8. `backup` rămâne un snapshot read-only și nu este ramură activă de dezvoltare.

## Configurare GitHub recomandată

- Branch pattern: `main`
- Allow direct pushes only for colaboratorii autorizați ai proiectului
- Block force pushes: activat
- Block branch deletion: activat
- Require signed commits: opțional
- Status checks sunt monitorizate după fiecare push; nu se declară release-ready un commit cu CI eșuat sau neexecutat

Această regulă înlocuiește vechiul flux bazat pe PR-uri pentru acest repository.

## Protecția `main` — pași manuali exacți (TASK-14 step 9)

Protecția GitHUb a ramurii `main` NU poate fi activată de aici: nu există token
GitHub API în mediu (`gh` CLI absent, `/branches/main/protection` răspunde 401),
iar fluxul ales este single-branch fără PR-uri. Pașii de mai jos se execută din
`claude`/terminal cu `gh` autentificat, sau manual în Settings.

### Ce este deja efectiv în `workflows/ci.yml` (acest commit)
- Acțiuni third-party fixate la **SHA complet** cu comentariu de versiune.
- `permissions: contents: read` la nivel de workflow (least-privilege).
- `concurrency: cancel-in-progress` — la un push nou pe `main` se anulează
  rularea veche a aceluiași workflow.
- Joburi: backend lint+test+audit, RLS-integration pe Postgres real + migrări,
  frontend typecheck+lint+test, secret-scan (truffleHog pîn-uit), dep-scan (osv-scanner).

### De ce NU s-au adăugat `pull_request` trigger și „require PR” (intenționat)
- Under fluxul single-branch al acestui repo (.agents/AGENTS.md: „no interim PRs”),
  nu există PR-uri de apărat. Un trigger `pull_request` ar rula CI pe niște
  evenimente care nu survin niciodată; „PR required” din setările GitHub ar
  bloca direct-ci proper înseși. Ambele sînt **contradictorii** cu fluxul ales.

### Pași manuali pentru protecția rezonabilă a `main`
1. `gh auth login` în terminal, apoi:
   ```
   gh api -X PUT repos/tudortone/AplicatieNutritie/branches/main/protection \
     -H "Accept: application/vnd.github+json" \
     -f "required_status_checks[strict]=true" \
     -f "required_status_checks[contexts][backend]=backend-checks" \
     -f "required_status_checks[contexts][frontend]=frontend-checks" \
     -f "enforce_admins=true" \
     --input - <<'JSON'
   {"restrictions":null,"required_pull_request_reviews":null}
   JSON
   ```
2. În Settings → Branches → `main`: tick „Require branches to be up to date”,
   „Require signed commits” (opțional), **Block force pushes**, **Block branch deletion**.
   (Avem doar un singur branch, deci „up to date” nu are sens ca gate PR; el
   cîntărește numai dacă se revine la un flux cu PR-uri.)
3. Raportare: după activare, un push cu CI eșuat face branch-ul „not ready” și
   trebuie reparat printr-un commit nou (NU prin force-push / reset).

Dacă în viitor se trece la un flux cu PR-uri, se reia TASK-14: se adaugă
triggerul `pull_request`, se setează `required_pull_request_reviews` și se
elimină această secțiune „single-branch”.
