"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { getIdTokenResult } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import Link from "next/link";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { auth, db, functions } from "@/lib/firebase";

function ConsoleBody() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [type, setType] = useState("event");
  const [contentId, setContentId] = useState("nouveau_contenu");
  const [revision, setRevision] = useState(1);
  const [payloadText, setPayloadText] = useState('{\n  "title": "Nouveau contenu",\n  "published": false\n}');
  const [status, setStatus] = useState("");
  const [lastDraftId, setLastDraftId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) { setAllowed(false); return; }
    void getIdTokenResult(auth.currentUser, true).then((token) => setAllowed(token.claims.admin === true)).catch(() => setAllowed(false));
  }, [user]);

  const payload = useMemo(() => {
    try { return JSON.parse(payloadText) as Record<string, unknown>; } catch { return null; }
  }, [payloadText]);

  if (loading || allowed === null) return <main className="nj-admin"><p>Vérification des droits…</p></main>;
  if (!user || user.isAnonymous || !allowed) return <main className="nj-admin"><h1>Régie du Ter</h1><p>Accès refusé. Le custom claim Firebase <code>admin</code> est requis.</p></main>;

  const saveDraft = async () => {
    if (!payload) { setStatus("JSON invalide"); return; }
    const ref = await addDoc(collection(db, "admin_drafts"), {
      type, contentId, revision, payload, status: "draft", createdBy: user.uid, createdAt: Date.now(), updatedAt: Date.now(),
    });
    setLastDraftId(ref.id);
    setStatus(`Brouillon ${ref.id} enregistré.`);
  };
  const publish = async () => {
    if (!lastDraftId) return;
    const call = httpsCallable(functions, "publishAdminDraft");
    const result = await call({ draftId: lastDraftId, idempotencyKey: `publish_${lastDraftId}_${crypto.randomUUID()}` });
    setStatus(`Publication confirmée : ${JSON.stringify(result.data)}`);
  };
  const seed = async () => {
    const call = httpsCallable(functions, "seedLiveOps");
    const result = await call({ idempotencyKey: `seed_${crypto.randomUUID()}` });
    setStatus(`Données initiales prêtes : ${JSON.stringify(result.data)}`);
  };
  const activatePreview = async () => {
    const call = httpsCallable(functions, "updateFeatureFlags");
    const result = await call({
      flags: { economy: true, authoritativeMatches: true, shop: true, events: true, simulatedPayments: true, admin: true, notifications: true },
      idempotencyKey: `features_${crypto.randomUUID()}`,
    });
    setStatus(`Fonctionnalités activées : ${JSON.stringify(result.data)}`);
  };

  return <main className="nj-admin">
    <header><div><span>BACK-OFFICE LÉGER</span><h1>Régie du Ter</h1><p>Brouillon, aperçu, publication versionnée, planification et audit.</p></div><Link href="/">Retour au jeu</Link></header>
    {status && <div className="nj-liveops-notice">{status}</div>}
    <section className="nj-admin-grid">
      <form onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
        <label>Type<select value={type} onChange={(event) => setType(event.target.value)}><option value="event">Événement</option><option value="offer">Offre</option><option value="booster_definition">Booster</option><option value="reward_table">Table de récompenses</option><option value="runtime_config">Configuration moteur</option></select></label>
        <label>Identifiant<input value={contentId} onChange={(event) => setContentId(event.target.value.replace(/[^a-z0-9_]/g, "_"))} maxLength={96} /></label>
        <label>Révision<input type="number" min={1} value={revision} onChange={(event) => setRevision(Number(event.target.value))} /></label>
        <label>Contenu JSON<textarea value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={18} spellCheck={false} /></label>
        <div className="nj-admin-actions"><button type="submit" disabled={!payload}>Enregistrer le brouillon</button><button type="button" disabled={!lastDraftId} onClick={() => void publish()}>Publier la révision</button><button type="button" onClick={() => void seed()}>Installer les données de base</button><button type="button" onClick={() => void activatePreview()}>Activer la préversion</button></div>
      </form>
      <aside><h2>Aperçu</h2>{payload ? <pre>{JSON.stringify({ type, contentId, revision, payload }, null, 2)}</pre> : <p>Corrige le JSON pour afficher l’aperçu.</p>}<p>La publication passe par <code>publishAdminDraft</code> et fige une révision immuable. Les écritures sont consignées dans <code>admin_audit</code>.</p></aside>
    </section>
  </main>;
}

export function AdminConsole() { return <AuthProvider><ConsoleBody /></AuthProvider>; }
