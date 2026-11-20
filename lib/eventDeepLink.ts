/* Lien profond vers un événement : /?event=<eventId> (notifications push).
   Lu une fois au démarrage puis retiré de l'URL. */

const EVENT_ID = /^[a-z0-9_]{3,64}$/;

export function consumeEventDeepLink(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const eventId = url.searchParams.get("event");
  if (!eventId) return null;
  url.searchParams.delete("event");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return EVENT_ID.test(eventId) ? eventId : null;
}

/** Message envoyé par le service worker quand on clique une notification. */
export function eventIdFromWorkerMessage(data: unknown): string | null {
  const message = data as { type?: string; eventId?: string } | null;
  if (message?.type !== "njambo:open-link" || !message.eventId) return null;
  return EVENT_ID.test(message.eventId) ? message.eventId : null;
}
