-- Privilegii explicite pentru Data API. RLS ramane filtrul pe randuri, iar
-- granturile de mai jos stabilesc operatiile permise fiecarui rol client.
-- Nu ne bazam pe setarea istorica "automatically grant API access" a proiectului.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.mese TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profil TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.antrenamente TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.produse_camara TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workout_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.barcode_estimari_utilizator TO authenticated;

GRANT SELECT, INSERT ON TABLE public.audit_log TO authenticated;
GRANT SELECT ON TABLE public.gamificare TO authenticated;
GRANT SELECT ON TABLE public.gamificare_evenimente TO authenticated;
GRANT SELECT ON TABLE public.exercitii TO authenticated;
GRANT SELECT ON TABLE public.exercises TO anon, authenticated;
GRANT SELECT ON TABLE public.ai_jobs TO authenticated;
GRANT SELECT ON TABLE public.credite_ai TO authenticated;
GRANT SELECT ON TABLE public.credite_tranzactii TO authenticated;

-- Tabele strict interne: chiar daca o politica RLS este schimbata ulterior,
-- rolurile din client nu primesc accidental acces la ele.
REVOKE ALL ON TABLE public.clerk_user_map FROM anon, authenticated;
REVOKE ALL ON TABLE public.barcode_cache FROM anon, authenticated;
REVOKE ALL ON TABLE public.gdpr_deletions FROM anon, authenticated;
REVOKE ALL ON TABLE public.credite_esuate FROM anon, authenticated;
REVOKE ALL ON TABLE public.clerk_webhook_esuate FROM anon, authenticated;

-- Scrierea acestor date ramane exclusiv server-side / prin functiile dedicate.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.gamificare FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.gamificare_evenimente FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.ai_jobs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.credite_ai FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.credite_tranzactii FROM anon, authenticated;
