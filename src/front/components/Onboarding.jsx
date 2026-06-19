import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  FiSmile,
  FiPlusCircle,
  FiEdit2,
  FiUserPlus,
  FiCompass,
  FiGlobe,
  FiMessageSquare,
  FiCalendar,
  FiUser,
  FiBell,
  FiFilter,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronUp,
  FiMinus,
  FiX,
} from "react-icons/fi";

// Tanda 7D — señal de sesión basada en el user persistido (el JWT vive
// en una cookie httpOnly).
import { isLoggedIn } from "../services/auth";
import useGlobalReducer from "../hooks/useGlobalReducer";
// Bus de señales del tour (acciones reales: crear/editar evento, pedir
// amistad, buscar en Discover, abrir notificaciones).
import { TOUR_ACTION_EVENT, TOUR_ACTIONS } from "../services/tour";
// El menú "My Profile" del Navbar dispara este mismo evento; lo
// reutilizamos como señal de "abrió el perfil" (sin tocar nada más).
import { SHOW_PROFILE_EVENT } from "./ButtonNavbar.jsx";

// ════════════════════════════════════════════════════════════════
// Onboarding interactivo — recorrido guiado por ACCIONES
// ════════════════════════════════════════════════════════════════
//
// A diferencia del tour anterior (un carrusel de diapositivas que solo
// EXPLICABA), este motor descubre la app HACIENDO: resalta el botón
// real con un halo + un globo con la instrucción, y SOLO avanza cuando
// el usuario cumple la acción de verdad.
//
// "Híbrido / no bloquea": el overlay es pointer-events:none salvo el
// propio globo, así la pantalla sigue 100% usable. El halo proyecta una
// sombra (spotlight) que oscurece el resto SIN capturar clics.
//
// AUTO-MINIMIZE: en cuanto el usuario toca el botón resaltado (o se abre
// el panel de Discover / un desplegable), el globo se encoge a una
// pastilla en la esquina inferior derecha que no estorba — el halo sigue
// marcando dónde actuar. Se reabre al avanzar de paso, al cambiar de
// ruta o al tocar la pastilla. También hay un botón de minimizar manual.
//
// NO OBLIGATORIO: cada paso de acción se puede saltar ("Skip this step")
// y muestra un hint contextual para los casos sin datos (p. ej. un
// usuario nuevo / el primer usuario sin amigos a quien añadir, GPS
// denegado, o sin evento que editar). El tour NUNCA atasca.
//
// Cómo se detecta cada paso:
//   - acción real  → evento de window "sq:tour-action" (services/tour.js)
//                    disparado por EventModal / Friends / DiscoverPanel /
//                    NotificationBell.
//   - navegación   → la ruta cambia a /messages o /events.
//   - perfil       → el evento ya existente sq:show-profile.
//   - filtros      → cambian los valores mapFilter* del store global.
//
// Persistencia en localStorage (v3): marca el tour como completado y
// guarda el progreso para retomarlo donde se dejó. El item "Take the
// tour" del Navbar dispara sq:show-onboarding y lo reabre desde el
// principio.
//
// Se monta UNA vez en Layout.jsx → presente en toda la app. Internamente
// decide cuándo mostrarse (logged-in + no completado + ruta apropiada).
// ════════════════════════════════════════════════════════════════

const COMPLETED_KEY = "sq.onboarding.v3.completed";
const PROGRESS_KEY = "sq.onboarding.v3.step";

const TOUR_EVENT = "sq:show-onboarding";

// Superficies no-modales (panel Discover, desplegables Bootstrap) que,
// al abrirse, minimizan el globo para no tapar lo que el usuario va a
// usar. Los modales Bootstrap ya esconden TODO el overlay vía CSS
// (body.modal-open) — no hace falta detectarlos aquí.
const SURFACE_SELECTOR = ".sq-discover-panel, .dropdown-menu.show";

// Rutas donde el overlay NO debe pintarse (auth / landing / legales).
// Mantiene los flujos críticos limpios y respeta que los legales NO
// forman parte del tour.
const HIDE_ON_PATHS = ["/", "/login", "/register", "/terms", "/privacy", "/legal"];

// ── Definición de pasos ─────────────────────────────────────────
// Cada paso:
//   icon       → icono pequeño en la cabecera del globo
//   title      → título
//   body       → instrucción cuando el usuario YA está donde toca
//   target     → selector CSS del elemento a resaltar (null = globo
//                centrado, sin halo). Si hay varios candidatos se
//                separan por coma: querySelector devuelve el 1º que
//                exista (truco usado en Discover: FAB cerrado vs. el
//                toggle del panel abierto).
//   navHint    → { path, target, body } a mostrar cuando el usuario aún
//                NO está en la ruta donde ocurre la acción: resalta la
//                pestaña del nav que lleva ahí.
//   skipHint   → línea muda (opcional) para los casos sin datos, junto
//                al botón "Skip this step".
//   completeOn → cómo se marca cumplido:
//                  { kind: "manual" }            (botón Empezar / Finalizar)
//                  { kind: "action", action }    (bus sq:tour-action)
//                  { kind: "path",  path }       (la ruta empieza por path)
//                  { kind: "profile" }           (evento sq:show-profile)
//                  { kind: "filters" }           (cambia el store de filtros)
const STEPS = [
  {
    id: "welcome",
    icon: FiSmile,
    title: "Welcome to SideQuest",
    body: (
      <>
        The social network for the <strong>real world</strong>. Let's discover
        it together — I'll point you to each feature and we move on when you try
        it. Every step is optional; you can skip any of them.
      </>
    ),
    target: null,
    completeOn: { kind: "manual" },
    primaryLabel: "Let's start",
  },
  {
    id: "create",
    icon: FiPlusCircle,
    title: "Create your first quest",
    body: (
      <>
        Tap the glowing <strong>+</strong> button to open the event form. Set a
        title, date, time and place, then hit <strong>Create</strong>. (You can
        also tap any spot on the map to drop a pin.)
      </>
    ),
    target: ".sq-bottom-nav-create",
    completeOn: { kind: "action", action: TOUR_ACTIONS.EVENT_CREATED },
  },
  {
    id: "modify",
    icon: FiEdit2,
    title: "Edit an event",
    body: (
      <>
        Open an event you created (tap its pin on the map), change any field —
        title, time, photo… — and press <strong>Save changes</strong>.
      </>
    ),
    target: null,
    navHint: {
      path: "/app",
      target: 'a[href="/app"]',
      body: "First, head back to the map.",
    },
    skipHint: "No event to edit yet? Skip this step.",
    completeOn: { kind: "action", action: TOUR_ACTIONS.EVENT_UPDATED },
  },
  {
    id: "friend",
    icon: FiUserPlus,
    title: "Add a friend",
    body: (
      <>
        Type a username in the search box and tap <strong>Add</strong> to send a
        friend request. Friends see the public events you create.
      </>
    ),
    target: ".friends-page input",
    navHint: {
      path: "/friends",
      target: 'a[href="/friends"]',
      body: "Open Friends from the bottom bar.",
    },
    skipHint: "No one on SideQuest to add yet? Skip for now.",
    completeOn: { kind: "action", action: TOUR_ACTIONS.FRIEND_REQUESTED },
  },
  {
    id: "discover-near",
    icon: FiCompass,
    title: "Discover — around you",
    body: (
      <>
        Open <strong>Discover</strong>, keep the <strong>Near me</strong> tab
        and tap <strong>Search</strong> to find real-world events happening
        close to you, right now.
      </>
    ),
    target: ".sq-discover-fab, .sq-discover-mode button:nth-child(1)",
    navHint: {
      path: "/app",
      target: 'a[href="/app"]',
      body: "Open the map to reach Discover.",
    },
    skipHint: "Location off? Skip, or try City / trip next.",
    completeOn: { kind: "action", action: TOUR_ACTIONS.DISCOVER_NEAR },
  },
  {
    id: "discover-trip",
    icon: FiGlobe,
    title: "Discover — plan a trip",
    body: (
      <>
        Still in Discover, switch to <strong>City / trip</strong>, type a city
        (Madrid, Paris, Tokyo…) and <strong>Search</strong> — perfect to plan a
        getaway before you arrive.
      </>
    ),
    target: ".sq-discover-fab, .sq-discover-mode button:nth-child(2)",
    navHint: {
      path: "/app",
      target: 'a[href="/app"]',
      body: "Open the map to reach Discover.",
    },
    skipHint: "Can't search right now? Skip this step.",
    completeOn: { kind: "action", action: TOUR_ACTIONS.DISCOVER_TRIP },
  },
  {
    id: "messages",
    icon: FiMessageSquare,
    title: "Your messages",
    body: (
      <>
        Tap <strong>Chatroom</strong> to open your messages. Every event gets
        its own group chat, and you can DM any friend.
      </>
    ),
    target: 'a[href="/messages"]',
    completeOn: { kind: "path", path: "/messages" },
  },
  {
    id: "events",
    icon: FiCalendar,
    title: "Your events list",
    body: (
      <>
        Tap <strong>Events</strong> to see all your quests and the ones your
        friends invited you to, all in one place.
      </>
    ),
    target: 'a[href="/events"]',
    completeOn: { kind: "path", path: "/events" },
  },
  {
    id: "profile",
    icon: FiUser,
    title: "Your profile",
    body: (
      <>
        Open the <strong>menu</strong> (top-right) and tap{" "}
        <strong>My Profile</strong> to edit your photo, bio and see your
        activity.
      </>
    ),
    target: ".sq-menu-toggle",
    completeOn: { kind: "profile" },
  },
  {
    id: "notifications",
    icon: FiBell,
    title: "Notifications",
    body: (
      <>
        Tap the <strong>bell</strong>. Invites, friend requests, RSVPs and event
        reminders all land here.
      </>
    ),
    target: ".sq-bell-toggle",
    completeOn: { kind: "action", action: TOUR_ACTIONS.NOTIFICATIONS_OPEN },
  },
  {
    id: "filters",
    icon: FiFilter,
    title: "Filter the map",
    body: (
      <>
        Tap the <strong>funnel</strong> and pick any filter (time, visibility or
        your status) to narrow down what shows on the map.
      </>
    ),
    target: ".sq-filter-toggle",
    navHint: {
      path: "/app",
      target: 'a[href="/app"]',
      body: "Open the map to see the filters in action.",
    },
    completeOn: { kind: "filters" },
  },
  {
    id: "finish",
    icon: FiCheckCircle,
    title: "You're all set!",
    body: (
      <>
        That's the whole app. You can replay this tour any time from the menu →{" "}
        <strong>Take the tour</strong>. Now go make something happen.
      </>
    ),
    target: null,
    completeOn: { kind: "manual" },
    primaryLabel: "Finish",
  },
];

const ONB_CSS = `
.sq-tour-layer {
  position: fixed;
  inset: 0;
  z-index: 1041;            /* sobre navs (1040), bajo modales Bootstrap (1050) */
  pointer-events: none;     /* no bloquea: solo el globo/pastilla capturan clics */
}
/* Mientras hay un modal Bootstrap abierto (EventModal, perfil, chat),
   el overlay del tour se esconde para no duplicar el oscurecido. */
body.modal-open .sq-tour-layer { display: none; }

/* Oscurecido a pantalla completa para los pasos centrados (sin target). */
.sq-tour-dim {
  position: absolute;
  inset: 0;
  background: rgba(8, 10, 15, 0.55);
}

/* Halo / spotlight alrededor del elemento resaltado. La 2ª sombra
   (100vmax) oscurece TODO el resto sin capturar clics (pointer-events
   none en la capa). */
.sq-tour-halo {
  position: fixed;
  border-radius: 14px;
  box-shadow:
    0 0 0 3px #6366f1,
    0 0 0 100vmax rgba(8, 10, 15, 0.55);
  animation: sq-tour-pulse 1.8s ease-in-out infinite;
}
@keyframes sq-tour-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(99,102,241,0.95), 0 0 0 100vmax rgba(8,10,15,0.55); }
  50%      { box-shadow: 0 0 0 6px rgba(99,102,241,0.55), 0 0 0 100vmax rgba(8,10,15,0.55); }
}
/* Cuando está minimizado, el halo deja de oscurecer (solo el anillo)
   para que la pantalla quede libre mientras el usuario actúa. */
.sq-tour-halo.dimless {
  box-shadow: 0 0 0 3px #6366f1;
}

/* Globo / coach-mark */
.sq-tour-card {
  position: fixed;
  pointer-events: auto;
  background: #161922;
  color: #e9ecef;
  border: 1px solid #262a36;
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
  padding: 1rem 1.1rem 0.9rem;
  transition: top 0.2s ease, bottom 0.2s ease, left 0.2s ease;
}

.sq-tour-top {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.5rem; margin-bottom: 0.5rem;
}
.sq-tour-step-count {
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em;
  text-transform: uppercase; color: #6c757d; margin-right: auto;
}
.sq-tour-iconbtn {
  background: transparent !important; border: none !important;
  color: #adb5bd !important; cursor: pointer;
  display: inline-flex; align-items: center; gap: 0.2rem;
  font-size: 0.78rem; padding: 0.1rem 0.25rem;
}
.sq-tour-iconbtn:hover { color: #fff !important; }

.sq-tour-head {
  display: flex; align-items: center; gap: 0.55rem; margin-bottom: 0.4rem;
}
.sq-tour-icon {
  width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; color: #fff;
  background: linear-gradient(135deg, #6366f1, #ec4899);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
}
.sq-tour-title {
  font-size: 1.1rem; font-weight: 700; color: #fff; margin: 0;
}
.sq-tour-body {
  color: #cbd0d8; font-size: 0.9rem; line-height: 1.5; margin: 0 0 0.6rem;
}
.sq-tour-body strong { color: #fff; }

/* En pasos gated, recordatorio de que el tour avanza solo. */
.sq-tour-wait {
  display: flex; align-items: center; gap: 0.45rem;
  font-size: 0.78rem; color: #8b93a7; font-style: italic; margin-bottom: 0.5rem;
}
.sq-tour-wait-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #6366f1; flex-shrink: 0;
  animation: sq-tour-blink 1.1s ease-in-out infinite;
}
@keyframes sq-tour-blink { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }

/* Hint contextual para casos sin datos (amigo / GPS / sin evento) */
.sq-tour-skiphint {
  font-size: 0.74rem; color: #6c757d; margin: 0 0 0.5rem;
}

/* Dots de progreso */
.sq-tour-dots { display: flex; gap: 0.3rem; margin: 0.2rem 0 0.7rem; flex-wrap: wrap; }
.sq-tour-dot { width: 7px; height: 7px; border-radius: 50%; background: #2a2f42; }
.sq-tour-dot.done { background: #4f46e5; }
.sq-tour-dot.active { background: linear-gradient(135deg, #6366f1, #ec4899); transform: scale(1.25); }

/* Footer */
.sq-tour-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
}
.sq-tour-btn-back {
  background: #1e2230 !important; border: 1px solid #262a36 !important;
  color: #adb5bd !important; font-size: 0.82rem !important;
  border-radius: 8px; padding: 0.35rem 0.7rem; cursor: pointer;
  display: inline-flex; align-items: center; gap: 0.25rem;
}
.sq-tour-btn-back:hover { background: #262a36 !important; color: #fff !important; }
.sq-tour-btn-primary {
  background: linear-gradient(135deg, #6366f1, #4f46e5) !important;
  border: none !important; color: #fff !important; font-weight: 600;
  font-size: 0.85rem !important; border-radius: 8px;
  padding: 0.4rem 0.95rem; cursor: pointer;
}
.sq-tour-btn-primary:hover { background: linear-gradient(135deg, #4f46e5, #4338ca) !important; }
.sq-tour-skip {
  background: transparent !important; border: none !important;
  color: #8b93a7 !important; font-size: 0.8rem !important; cursor: pointer;
  padding: 0.35rem 0.2rem; font-weight: 600;
}
.sq-tour-skip:hover { color: #fff !important; }

/* Pastilla minimizada — esquina inferior derecha, no estorba. */
.sq-tour-pill {
  position: fixed;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  pointer-events: auto;
  display: inline-flex; align-items: center; gap: 0.5rem;
  max-width: 72vw;
  background: #161922; border: 1px solid #6366f1;
  color: #e9ecef; border-radius: 999px;
  padding: 0.4rem 0.7rem 0.4rem 0.5rem;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
  cursor: pointer; font-size: 0.8rem; font-weight: 600;
}
.sq-tour-pill:hover { background: #1e2230; }
.sq-tour-pill-ic {
  width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; color: #fff;
  background: linear-gradient(135deg, #6366f1, #ec4899);
}
.sq-tour-pill-step { color: #8b93a7; font-weight: 700; }
.sq-tour-pill-tx { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;

// Compara dos rects (con tolerancia) para no provocar re-render por
// diferencias sub-píxel en el bucle de seguimiento.
const rectsEqual = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const close = (x, y) => Math.abs(x - y) < 0.5;
  return (
    close(a.top, b.top) &&
    close(a.left, b.left) &&
    close(a.width, b.width) &&
    close(a.height, b.height)
  );
};

const CARD_W = 340;

// Posición del globo en función del rect del target (null → centrado).
const computeCardStyle = (rect) => {
  if (typeof window === "undefined") return {};
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(CARD_W, vw - 24);

  if (!rect) {
    return {
      width: w,
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  const cx = rect.left + rect.width / 2;
  const left = Math.min(Math.max(cx - w / 2, 12), vw - w - 12);
  const placeAbove = rect.top > vh * 0.55;

  return placeAbove
    ? { width: w, left, bottom: vh - rect.top + 14 }
    : { width: w, left, top: rect.top + rect.height + 14 };
};

const HALO_PAD = 6;

export const Onboarding = () => {
  const location = useLocation();
  const { store } = useGlobalReducer();

  const [show, setShow] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState(null);
  // Globo encogido a la pastilla de esquina (no estorba la acción).
  const [minimized, setMinimized] = useState(false);

  // Refs siempre frescas para usar dentro de listeners registrados una
  // sola vez (evita closures obsoletas).
  const showRef = useRef(false);
  const stepIdxRef = useRef(0);
  const surfaceOpenRef = useRef(false);
  useEffect(() => { showRef.current = show; }, [show]);
  useEffect(() => { stepIdxRef.current = stepIdx; }, [stepIdx]);

  const step = STEPS[stepIdx];

  // ── Avance / cierre ───────────────────────────────────────────
  const goNext = useCallback(() => {
    setStepIdx((i) => {
      const ni = Math.min(i + 1, STEPS.length - 1);
      try { localStorage.setItem(PROGRESS_KEY, String(ni)); } catch (_) {}
      return ni;
    });
  }, []);

  const goPrev = useCallback(() => {
    setStepIdx((i) => Math.max(0, i - 1));
  }, []);

  const finishTour = useCallback(() => {
    setShow(false);
    try {
      localStorage.setItem(COMPLETED_KEY, "true");
      localStorage.removeItem(PROGRESS_KEY);
    } catch (_) {
      /* localStorage puede fallar en modo privado: no es crítico. */
    }
  }, []);

  // Avanza solo si el paso ACTIVO cumple el predicado (guard contra
  // señales que llegan en otro paso).
  const completeActive = useCallback(
    (predicate) => {
      if (!showRef.current) return;
      const s = STEPS[stepIdxRef.current];
      if (s && predicate(s)) goNext();
    },
    [goNext]
  );

  // ── Detección: acciones reales (bus sq:tour-action) ───────────
  useEffect(() => {
    const onAction = (e) => {
      const action = e?.detail?.action;
      completeActive(
        (s) => s.completeOn.kind === "action" && s.completeOn.action === action
      );
    };
    window.addEventListener(TOUR_ACTION_EVENT, onAction);
    return () => window.removeEventListener(TOUR_ACTION_EVENT, onAction);
  }, [completeActive]);

  // ── Detección: abrir el perfil (evento ya existente) ──────────
  useEffect(() => {
    const onProfile = () =>
      completeActive((s) => s.completeOn.kind === "profile");
    window.addEventListener(SHOW_PROFILE_EVENT, onProfile);
    return () => window.removeEventListener(SHOW_PROFILE_EVENT, onProfile);
  }, [completeActive]);

  // ── Detección: navegación (/messages, /events) ────────────────
  useEffect(() => {
    if (!show) return;
    if (
      step.completeOn.kind === "path" &&
      location.pathname.startsWith(step.completeOn.path)
    ) {
      goNext();
    }
  }, [show, stepIdx, location.pathname, step, goNext]);

  // ── Detección: filtros del mapa (store) ───────────────────────
  // Snapshot al entrar en el paso; si cualquier valor cambia, cumplido.
  const filterSnapRef = useRef(null);
  useEffect(() => {
    if (show && step.completeOn.kind === "filters") {
      filterSnapRef.current = JSON.stringify([
        store.mapFilterDays ?? null,
        store.mapFilterVisibility ?? "all",
        store.mapFilterStatus ?? "all",
      ]);
    } else {
      filterSnapRef.current = null;
    }
    // Solo al cambiar de paso / abrir: NO dependemos de los valores aquí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, stepIdx]);

  useEffect(() => {
    if (!show || step.completeOn.kind !== "filters" || filterSnapRef.current == null) return;
    const now = JSON.stringify([
      store.mapFilterDays ?? null,
      store.mapFilterVisibility ?? "all",
      store.mapFilterStatus ?? "all",
    ]);
    if (now !== filterSnapRef.current) goNext();
  }, [show, stepIdx, step, store.mapFilterDays, store.mapFilterVisibility, store.mapFilterStatus, goNext]);

  // ── Auto-apertura la primera vez ──────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isLoggedIn()) return;
    if (localStorage.getItem(COMPLETED_KEY) === "true") return;
    if (HIDE_ON_PATHS.includes(window.location.pathname)) return;

    const saved = parseInt(localStorage.getItem(PROGRESS_KEY) || "0", 10);
    const start = Number.isNaN(saved)
      ? 0
      : Math.min(Math.max(saved, 0), STEPS.length - 1);

    // Pequeño delay para que la página cargue antes que el overlay.
    const t = setTimeout(() => {
      setStepIdx(start);
      setShow(true);
    }, 800);
    return () => clearTimeout(t);
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Replay desde el menú "Take the tour" ──────────────────────
  useEffect(() => {
    const open = () => {
      setStepIdx(0);
      try { localStorage.setItem(PROGRESS_KEY, "0"); } catch (_) {}
      setShow(true);
    };
    window.addEventListener(TOUR_EVENT, open);
    return () => window.removeEventListener(TOUR_EVENT, open);
  }, []);

  // ── Cerrar con Escape ─────────────────────────────────────────
  useEffect(() => {
    if (!show) return;
    const onKey = (e) => { if (e.key === "Escape") finishTour(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, finishTour]);

  // Al cambiar de paso o de ruta, el globo vuelve a abrirse (re-orienta).
  useEffect(() => {
    setMinimized(false);
    surfaceOpenRef.current = false;
  }, [stepIdx, location.pathname]);

  // ── Seguimiento del target (RAF) ──────────────────────────────
  // ¿Está el usuario donde ocurre la acción? Si no, resaltamos la
  // pestaña del navHint que lleva ahí.
  const onPath = !step.navHint || location.pathname.startsWith(step.navHint.path);
  const selector = onPath ? step.target : step.navHint?.target;

  useEffect(() => {
    if (!show) return;
    let raf;
    const tick = () => {
      // Posición del halo.
      let next = null;
      if (selector) {
        const el = document.querySelector(selector);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            next = { top: r.top, left: r.left, width: r.width, height: r.height };
          }
        }
      }
      setRect((prev) => (rectsEqual(prev, next) ? prev : next));

      // Auto-minimizar al abrirse una superficie (panel Discover /
      // desplegable). Solo en el flanco de subida para no pelear con el
      // estado.
      const surfaceOpen = !!document.querySelector(SURFACE_SELECTOR);
      if (surfaceOpen && !surfaceOpenRef.current) setMinimized(true);
      surfaceOpenRef.current = surfaceOpen;

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [show, selector]);

  // ── Auto-minimizar al tocar el botón resaltado ────────────────
  useEffect(() => {
    if (!show || !selector) return;
    const onDown = (e) => {
      const t = e.target;
      if (t && t.closest && t.closest(selector)) setMinimized(true);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [show, selector]);

  if (!show) return null;
  // En rutas legales/auth ocultamos el overlay (se reanuda al volver).
  if (HIDE_ON_PATHS.includes(location.pathname)) return null;

  const isFirst = stepIdx === 0;
  const isManual = step.completeOn.kind === "manual";
  const IconCmp = step.icon;
  const bodyNode = onPath ? step.body : step.navHint.body;
  const cardStyle = computeCardStyle(rect);

  return (
    <>
      <style>{ONB_CSS}</style>

      <div className="sq-tour-layer" aria-live="polite">
        {/* Oscurecido a pantalla completa solo para pasos centrados y
            cuando el globo NO está minimizado (si lo está, pantalla libre). */}
        {!rect && !minimized && <div className="sq-tour-dim" />}

        {/* Halo: con dim alrededor cuando está abierto; solo anillo cuando
            está minimizado (para no oscurecer mientras se actúa). */}
        {rect && (
          <div
            className={`sq-tour-halo ${minimized ? "dimless" : ""}`}
            style={{
              top: rect.top - HALO_PAD,
              left: rect.left - HALO_PAD,
              width: rect.width + HALO_PAD * 2,
              height: rect.height + HALO_PAD * 2,
            }}
          />
        )}

        {minimized ? (
          /* Pastilla minimizada — tap para reabrir el globo. */
          <button
            type="button"
            className="sq-tour-pill"
            onClick={() => setMinimized(false)}
            aria-label={`Tour step ${stepIdx + 1} of ${STEPS.length}: ${step.title}. Tap to expand`}
            title="Expand the tour"
          >
            <span className="sq-tour-pill-ic" aria-hidden="true">
              <IconCmp size={14} />
            </span>
            <span className="sq-tour-pill-step">{stepIdx + 1}/{STEPS.length}</span>
            <span className="sq-tour-pill-tx">{step.title}</span>
            <FiChevronUp size={16} aria-hidden="true" />
          </button>
        ) : (
          <div
            className="sq-tour-card"
            style={cardStyle}
            role="dialog"
            aria-label={step.title}
          >
            <div className="sq-tour-top">
              <span className="sq-tour-step-count">
                Step {stepIdx + 1} of {STEPS.length}
              </span>
              {/* Minimizar manual: tuck el globo a la esquina sin avanzar. */}
              <button
                type="button"
                className="sq-tour-iconbtn"
                onClick={() => setMinimized(true)}
                aria-label="Minimize tour"
                title="Minimize"
              >
                <FiMinus size={16} />
              </button>
              <button
                type="button"
                className="sq-tour-iconbtn"
                onClick={finishTour}
                aria-label="Skip tour"
                title="Skip tour"
              >
                Skip tour <FiX size={14} />
              </button>
            </div>

            <div className="sq-tour-head">
              <div className="sq-tour-icon" aria-hidden="true">
                <IconCmp size={20} />
              </div>
              <h2 className="sq-tour-title">{step.title}</h2>
            </div>

            <p className="sq-tour-body">{bodyNode}</p>

            {/* En pasos gated, recordatorio de que el tour avanza solo. */}
            {!isManual && (
              <div className="sq-tour-wait">
                <span className="sq-tour-wait-dot" />
                {onPath
                  ? "Do the action to continue…"
                  : "Tap the highlighted button to go there…"}
              </div>
            )}

            {/* Hint contextual para casos sin datos (amigo / GPS / sin evento). */}
            {!isManual && step.skipHint && onPath && (
              <p className="sq-tour-skiphint">{step.skipHint}</p>
            )}

            <div className="sq-tour-dots" aria-hidden="true">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`sq-tour-dot ${
                    i === stepIdx ? "active" : i < stepIdx ? "done" : ""
                  }`}
                />
              ))}
            </div>

            <div className="sq-tour-foot">
              {!isFirst ? (
                <button type="button" className="sq-tour-btn-back" onClick={goPrev}>
                  <FiChevronLeft size={14} /> Back
                </button>
              ) : (
                <span />
              )}

              {isManual ? (
                <button
                  type="button"
                  className="sq-tour-btn-primary"
                  onClick={stepIdx === STEPS.length - 1 ? finishTour : goNext}
                >
                  {step.primaryLabel || "Next"}
                </button>
              ) : (
                <button type="button" className="sq-tour-skip" onClick={goNext}>
                  Skip this step →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

// Re-exportamos el nombre del evento para que el Navbar dispare el
// replay sin duplicar el string (mismo contrato que la versión previa).
export const SHOW_ONBOARDING_EVENT = TOUR_EVENT;

export default Onboarding;
