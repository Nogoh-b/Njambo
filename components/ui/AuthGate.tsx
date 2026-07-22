"use client";

import { type ReactNode, useState } from "react";
import { T } from "@/config/theme";
import { useAuth } from "@/hooks/useAuth";
import { Surface } from "@/components/ui/Shell";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import styles from "./AuthGate.module.css";

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
    "auth/invalid-phone-number": "Numéro invalide. Utilise le format +237…",
    "auth/invalid-verification-code": "Code SMS incorrect.",
    "auth/code-expired": "Le code SMS a expiré. Demande un nouveau code.",
    "auth/popup-closed-by-user": "La fenêtre Google a été fermée.",
  };
  return map[code] ?? "Erreur inconnue. Réessaie.";
}

interface AuthGateProps {
  children: ReactNode;
  gateClassName?: string;
  tone?: "gold" | "teal" | "pink";
}

const ACCOUNT_TONE_CLASS = {
  gold: styles.toneGold,
  teal: styles.toneTeal,
  pink: styles.tonePink,
} as const;

export function AuthGate({ children, gateClassName, tone = "gold" }: AuthGateProps) {
  const {
    user, loading, loginWithEmail, registerWithEmail, loginWithGoogle,
    requestPhoneCode, confirmPhoneCode, logout,
  } = useAuth();

  /* Formulaire */
  const [mode, setMode] = useState<"login" | "register">("login");
  const [authMethod, setAuthMethod] = useState<"phone" | "email">("phone");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("+237");
  const [smsCode, setSmsCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(AVATARS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /* ── Chargement ── */
  if (loading) {
    return (
      <Surface className={`${styles.authGate} ${ACCOUNT_TONE_CLASS[tone]}${gateClassName ? ` ${gateClassName}` : ""}`} style={{ textAlign: "center" }}>
        <NjamboIcon name="profile" tone={tone} size={40} />
        <div role="status" style={{ fontWeight: 900, marginTop: 12 }}>Chargement…</div>
      </Surface>
    );
  }

  /* ── Connecté → afficher les enfants ── */
  if (user && !user.isAnonymous) {
    return (
      <>
        {/* Barre de connexion */}
        <div className={`${styles.accountCard} ${ACCOUNT_TONE_CLASS[tone]}`}>
          <div className={styles.identity}>
            <span className={styles.avatar} aria-hidden="true">
              <AvatarIllustration seed={user.emoji} size={42} online />
            </span>
            <span className={styles.copy}>
              <strong>{user.name}</strong>
              {(user.email || user.phoneNumber) && (
                <span className={styles.contact}>
                  <NjamboIcon name="message" tone={tone} size={14} />
                  {user.email ?? user.phoneNumber}
                </span>
              )}
            </span>
          </div>
          <Btn
            tone={tone}
            fill="outline"
            size="md"
            motif="indigo-dots"
            motifSides="both"
            onClick={() => { void logout(); }}
            className={styles.logout}
          >
            Déconnexion
          </Btn>
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
    if (authMethod === "phone") {
      const normalizedPhone = phoneNumber.replace(/\s+/g, "");
      if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
        setError("Entre le numéro complet, par exemple +2376XXXXXXXX.");
        return;
      }
      if (codeSent && !/^\d{6}$/.test(smsCode.trim())) {
        setError("Entre le code SMS à 6 chiffres.");
        return;
      }
      setBusy(true);
      try {
        if (codeSent) await confirmPhoneCode(smsCode.trim(), name.trim() || user?.name, user?.emoji || emoji);
        else {
          await requestPhoneCode(normalizedPhone, "nj-phone-recaptcha");
          setCodeSent(true);
        }
      } catch (err: unknown) {
        setError(authError((err as { code?: string })?.code));
      } finally {
        setBusy(false);
      }
      return;
    }
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
    <Surface className={`${styles.authGate} ${ACCOUNT_TONE_CLASS[tone]}${gateClassName ? ` ${gateClassName}` : ""}`}>
      <form onSubmit={handleSubmit}>
        {/* Titre */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <NjamboIcon name="profile" tone={tone} size={40} />
          <h2 style={{ fontWeight: 900, margin: "10px 0 0", fontSize: 18 }}>
            {user?.isAnonymous ? "Sauvegarder mon compte" : isRegister ? "Créer un compte" : "Connexion"}
          </h2>
          <div className="nj-subtle" style={{ marginTop: 4 }}>
            {user?.isAnonymous
              ? "Passe en compte permanent sans perdre ta progression."
              : isRegister
              ? "Inscris-toi pour jouer en ligne."
              : "Connecte-toi pour rejoindre une salle."}
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div role="alert" style={{
            color: "var(--nj-solar-red-deep, #a92f2a)",
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
          <div role="group" aria-label="Méthode de connexion" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Btn
              tone={tone}
              fill={authMethod === "phone" ? "soft" : "outline"}
              motif="indigo-dots"
              motifSides="both"
              ariaPressed={authMethod === "phone"}
              onClick={() => { setAuthMethod("phone"); setError(""); }}
            >
              Téléphone
            </Btn>
            <Btn
              tone={tone}
              fill={authMethod === "email" ? "soft" : "outline"}
              motif="indigo-dots"
              motifSides="both"
              ariaPressed={authMethod === "email"}
              onClick={() => { setAuthMethod("email"); setError(""); }}
            >
              E-mail
            </Btn>
          </div>

          {authMethod === "phone" && (
            <>
              {!codeSent ? (
                <input aria-label="Numéro de téléphone" className="nj-input" type="tel" inputMode="tel" placeholder="+237 6XX XX XX XX" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} autoComplete="tel" disabled={busy} />
              ) : (
                <input aria-label="Code SMS à 6 chiffres" className="nj-input" type="text" inputMode="numeric" maxLength={6} placeholder="Code SMS à 6 chiffres" value={smsCode} onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" disabled={busy} />
              )}
              <div id="nj-phone-recaptcha" />
            </>
          )}

          {authMethod === "email" && <>
          {/* Pseudo (inscription seulement) */}
          {isRegister && (
            <input
              className="nj-input"
              type="text"
              aria-label="Pseudo"
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
            aria-label="Adresse e-mail"
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
            aria-label="Mot de passe"
            placeholder="Mot de passe (min. 6)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            disabled={busy}
          />

          {/* Sélecteur emoji (inscription seulement) */}
          {isRegister && (
            <div style={{ marginTop: 4 }}>
              <div id="auth-avatar-label" className="nj-subtle" style={{ marginBottom: 8, fontSize: 12 }}>Choisis ton avatar</div>
              <div role="group" aria-labelledby="auth-avatar-label" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {AVATARS.map((a) => (
                  <Btn
                    key={a}
                    tone={tone}
                    fill={emoji === a ? "soft" : "outline"}
                    motif="indigo-dots"
                    motifSides="both"
                    ariaLabel={`Choisir l'avatar ${a}`}
                    ariaPressed={emoji === a}
                    onClick={() => setEmoji(a)}
                    className={styles.avatarChoice}
                    icon={<AvatarIllustration seed={a} size={32} />}
                  />
                ))}
              </div>
            </div>
          )}
          </>}

          {/* Bouton submit */}
          <Btn
            type="submit"
            tone={tone}
            fill="solid"
            size="lg"
            motif="indigo-dots"
            motifSides="both"
            disabled={busy}
            ariaBusy={busy}
            className={styles.fullButton}
            icon={<NjamboIcon name={isRegister ? "play" : "home"} tone={tone} size={20} />}
          >
            {busy ? "…" : authMethod === "phone" ? (codeSent ? "Valider le code" : "Recevoir le code") : isRegister ? "Créer mon compte" : "Se connecter"}
          </Btn>

          <Btn
            tone={tone}
            fill="outline"
            motif="indigo-dots"
            motifSides="both"
            disabled={busy}
            className={styles.fullButton}
            onClick={() => {
              setBusy(true); setError("");
              void loginWithGoogle().catch((err: unknown) => setError(authError((err as { code?: string })?.code))).finally(() => setBusy(false));
            }}
          >
            Continuer avec Google
          </Btn>

          {/* Toggle mode */}
          {authMethod === "email" && (
            <Btn
              tone={tone}
              fill="outline"
              motif="indigo-dots"
              motifSides="both"
              disabled={busy}
              className={styles.fullButton}
              onClick={() => { setMode(isRegister ? "login" : "register"); setError(""); }}
            >
              {isRegister ? "Déjà un compte ? Se connecter" : "Pas encore de compte ? Créer un compte"}
            </Btn>
          )}
        </div>
      </form>
    </Surface>
  );
}
