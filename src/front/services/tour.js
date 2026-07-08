// src/front/services/tour.js
//
// Onboarding interactivo — "action bus" minúsculo.
//
// Mismo patrón bump-and-listen que announceEventsChanged (socket.js):
// los componentes anuncian que el usuario CUMPLIÓ una acción del tour
// (creó un evento, mandó una solicitud de amistad, buscó en Discover…)
// y <Onboarding/> escucha un ÚNICO evento de window y avanza el paso.
//
// Un solo tipo de evento DOM ("sq:tour-action") con la acción en
// `detail.action`, así no proliferan nombres de evento por cada paso.
// Las acciones que se detectan por RUTA (/messages, /events), por el
// evento ya existente del perfil (sq:show-profile) o por el store
// (filtros del mapa) NO usan este bus — el motor las observa solo.

export const TOUR_ACTION_EVENT = "sq:tour-action";

// Nombres de acción — uno por paso "gated por acción real". Se importan
// desde el motor y desde cada componente que dispara la señal, para no
// duplicar strings sueltos.
export const TOUR_ACTIONS = {
  EVENT_CREATED:      "event-created",
  EVENT_UPDATED:      "event-updated",
  FRIEND_REQUESTED:   "friend-requested",
  DISCOVER_NEAR:      "discover-near",
  DISCOVER_TRIP:      "discover-trip",
  NOTIFICATIONS_OPEN: "notifications-open",
};

// Dispara una señal de acción del tour. No-op fuera del navegador
// (SSR / tests) — igual que announceEventsChanged.
export const announceTourAction = (action) => {
  if (!action) return;
  try {
    window.dispatchEvent(
      new CustomEvent(TOUR_ACTION_EVENT, { detail: { action } })
    );
  } catch (_) {
    /* sin window: nada que hacer */
  }
};
