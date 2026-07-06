"use client";

import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { MOCK_FRIENDS } from "@/data/mock";
import { AvatarIllustration } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { ScreenHeader, Shell, Surface } from "@/components/ui/Shell";

export function FriendsScreen() {
  const { navigateTo } = useGame();
  const onlineCount = MOCK_FRIENDS.filter((f) => f.online).length;

  return (
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader title="Amis" kicker={`${onlineCount} en ligne`} icon="friends" tone="teal" onBack={() => navigateTo("menu")} backLabel="Retour" />
          <Surface>
            <div className="nj-stack" style={{ gap: 10 }}>
              {MOCK_FRIENDS.map((f, i) => (
                <div
                  key={f.name}
                  className="friend-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 10px",
                    borderRadius: 17,
                    background: "rgba(255,248,232,.052)",
                    border: f.online ? `1px solid ${T.teal}55` : "1px solid rgba(255,248,232,.09)",
                    opacity: f.online ? 1 : 0.64,
                    animation: `riseIn .34s ${i * 0.06}s both`,
                  }}
                >
                  <AvatarIllustration seed={f.emoji} size={50} online={f.online} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                    <div className="nj-subtle">{f.online ? "Disponible maintenant" : "Pas connecté"}</div>
                  </div>
                  <Btn variant={f.online ? "gold" : "dark"} disabled={!f.online} style={{ paddingInline: 12, fontSize: 12 }}>
                    {f.online ? "Inviter" : "Off"}
                  </Btn>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </Shell>
  );
}
