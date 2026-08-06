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
