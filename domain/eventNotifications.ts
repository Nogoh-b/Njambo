/* ═══════════════ Notifications d'événement (phase 3) ═══════════════
   Règle pure : à partir de la fiche publiée, quand part chaque
   notification configurée. Utilisée par le serveur à l'activation d'une
   révision (publication immédiate ou programmée). */

import type { EventNotificationAudience, EventVersion } from "./events";

export interface PlannedEventCampaign {
  /** Identifiant stable (événement + notification) : une campagne déjà envoyée n'est jamais renvoyée. */
  campaignId: string;
  notificationId: string;
  sendAt: number;
  title: string;
  body: string;
  audience: EventNotificationAudience;
}

export function eventCampaignId(eventId: string, notificationId: string) {
  return `ev_${eventId}_${notificationId}`;
}

/**
 * - `opening` : à l'ouverture (ou tout de suite si l'événement est déjà ouvert).
 * - `before_end` : `offsetMinutes` avant la fin.
 * - `at` : à la date fixée.
 * Une notification dont l'heure est déjà passée à l'activation (hors
 * ouverture) ou qui tomberait après la fin est ignorée.
 */
export function planEventCampaigns(event: EventVersion, activatedAt: number): PlannedEventCampaign[] {
  const planned: PlannedEventCampaign[] = [];
  for (const notification of event.notifications) {
    let sendAt: number;
    if (notification.trigger === "opening") sendAt = Math.max(event.startsAt, activatedAt);
    else if (notification.trigger === "before_end") sendAt = event.endsAt - Math.max(0, notification.offsetMinutes ?? 0) * 60_000;
    else sendAt = Number(notification.at ?? 0);
    if (notification.trigger !== "opening" && sendAt < activatedAt) continue;
    if (sendAt >= event.endsAt) continue;
    planned.push({
      campaignId: eventCampaignId(event.eventId, notification.id),
      notificationId: notification.id,
      sendAt,
      title: notification.title,
      body: notification.body,
      audience: notification.audience,
    });
  }
  return planned.sort((a, b) => a.sendAt - b.sendAt);
}
