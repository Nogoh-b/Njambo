"use client";

import { type ReactNode, useState } from "react";
import { T } from "@/config/theme";
import { useAuth } from "@/hooks/useAuth";
import { Surface } from "@/components/ui/Shell";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";

/* ═══════════════ AuthGate — inline login / register ═══════════════
   Affiche un formulaire de connexion/inscription quand l&apos;utilisateur
   n&apos;est pas connecté, sinon rend les enfants.
   Utilisé dans OnlineSetupScreen et FriendsSetupScreen. */

const AVATARS = [
  "you-nogoh",
  "avatar-douala",
  "avatar-bamoun",
  "avatar-beti",
  "avatar-bassa",
  "avatar-sawa",
  "avatar-bamilike",
  "avatar-mboa",
  "avatar-ndop",
  "avatar-rapha",
];

/** Traduit les codes d&apos;erreur Firebase Auth en messages français */
function authError(code?: string): string {
  if (!code) return "Erreur inconnue. Réessaie.";
  const map: Record<string, string> = {
    "auth/invalid-email": "Adresse e-mail invalide.",
    "auth/user-disabled": "Ce compte a été désactivé.",
    "auth/user-not-found": "Aucun compte avec cet e-mail.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/email-already-in-use": "Un compte existe déjà avec cet e-mail.",
    "auth/weak-password": "Le mot de passe doit contenir au moins 6 caractères.",
    "auth/too-many-requests": "Trop de tentatives. Réessaie plus tard.",
    "auth/network-request-failed": "Erreur réseau. Vérifie ta connexion.",
    "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
  };
  return map[code] ?? "Erreur inconnue. Réessaie.";
}

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { user, loading, loginWithEmail, registerWithEmail, logout } = useAuth();

  /* Formulaire */
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(AVATARS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /* ── Chargement ── */
  if (loading) {
    return (
      <Surface style={{ textAlign: "center" }}>
        <NjamboIcon name="profile" tone="gold" size={40} />
        <div style={{ fontWeight: 900, marginTop: 12 }}>Chargement…</div>
      </Surface>
    );
  }

  /* ── Connecté → afficher les enfants ── */
  if (user) {
    return (
      <>
        {/* Barre de connexion */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "8px 14px",
            borderRadius: 14,
            background: "rgba(255,248,232,.055)",
            border: "1px solid rgba(255,248,232,.11)",
            marginBottom: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 22 }}>{user.emoji === "you-nogoh" ? "😎" : "🎭"}</span>
            <span style={{ fontWeight: 900, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.name}
            </span>
            {user.email && (
              <span className="nj-subtle" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>
                {user.email}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => { logout(); }}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.muted,
              background: "none",
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              padding: "4px 8px",
            }}
          >
            Déconnexion
          </button>
        </div>
        {children}
      </>
    );
  }

  /* ── Non connecté → formulaire ── */
  const isRegister = mode === "register";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    const trimmedName = name.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError("Remplis tous les champs.");
      return;
    }
    if (trimmedPassword.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (isRegister && !trimmedName) {
      setError("Choisis un pseudo.");
      return;
    }

    setBusy(true);
    try {
      if (isRegister) {
        await registerWithEmail(trimmedEmail, trimmedPassword, trimmedName, emoji);
      } else {
        await loginWithEmail(trimmedEmail, trimmedPassword);
      }
    } catch (err: unknown) {
      const msg = (err as { code?: string })?.code;
      setError(authError(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Surface>
      <form onSubmit={handleSubmit}>
        {/* Titre */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <NjamboIcon name="profile" tone="gold" size={40} />
          <div style={{ fontWeight: 900, marginTop: 10, fontSize: 18 }}>
            {isRegister ? "Créer un compte" : "Connexion"}
          </div>
          <div className="nj-subtle" style={{ marginTop: 4 }}>
            {isRegister
              ? "Inscris-toi pour jouer en ligne."
              : "Connecte-toi pour rejoindre une salle."}
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div style={{
            color: T.bad,
            fontSize: 13,
            textAlign: "center",
            padding: "8px 12px",
            borderRadius: 10,
            background: `${T.bad}12`,
            marginBottom: 12,
          }}>
            {error}
          </div>
        )}

        {/* Champs */}
        <div className="nj-stack" style={{ gap: 10 }}>
          {/* Pseudo (inscription seulement) */}
          {isRegister && (
            <input
              className="nj-input"
              type="text"
              placeholder="Pseudo"
              maxLength={22}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="username"
              disabled={busy}
            />
          )}

          {/* Email */}
          <input
            className="nj-input"
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete={isRegister ? "email" : "email"}
            disabled={busy}
          />

          {/* Password */}
          <input
            className="nj-input"
            type="password"
            placeholder="Mot de passe (min. 6)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            disabled={busy}
          />

          {/* Sélecteur emoji (inscription seulement) */}
          {isRegister && (
            <div style={{ marginTop: 4 }}>
              <div className="nj-subtle" style={{ marginBottom: 8, fontSize: 12 }}>Choisis ton avatar</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {AVATARS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setEmoji(a)}
                    className="nj-choice"
                    style={{
                      height: 48,
                      borderRadius: 14,
                      border: emoji === a ? `2px solid ${T.gold}` : "1px solid rgba(255,248,232,.12)",
                      background: emoji === a ? `${T.gold}18` : "rgba(255,248,232,.05)",
                      display: "grid",
                      placeItems: "center",
                      padding: 0,
                    }}
                  >
                    <AvatarIllustration seed={a} size={32} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bouton submit */}
          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%",
              minHeight: 44,
              borderRadius: 14,
              border: "none",
              fontWeight: 900,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.45 : 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 15,
              color: "#1b1010",
              background: "linear-gradient(135deg, #f7cb63, #d88832)",
              boxShadow: "0 4px 18px rgba(242,187,69,.32)",
              padding: "0 20px",
            }}
          >
            <NjamboIcon name={isRegister ? "play" : "home"} tone="gold" size={20} />
            {busy ? "…" : isRegister ? "Créer mon compte" : "Se connecter"}
          </button>

          {/* Toggle mode */}
          <button
            type="button"
            onClick={() => { setMode(isRegister ? "login" : "register"); setError(""); }}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: T.gold,
              background: "none",
              border: "none",
              cursor: "pointer",
              textAlign: "center",
              padding: "6px 0 0",
            }}
          >
            {isRegister ? "Déjà un compte ? Se connecter" : "Pas encore de compte ? Créer un compte"}
          </button>
        </div>
      </form>
    </Surface>
  );
}
