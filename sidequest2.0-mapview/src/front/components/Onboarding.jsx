import { useState, useEffect, useCallback } from "react";
import { Modal, Button } from "react-bootstrap";
import {
  FiSmile,
  FiMapPin,
  FiPlusCircle,
  FiUsers,
  FiChevronLeft,
  FiChevronRight,
  FiCheck,
  FiX,
} from "react-icons/fi";
// Tanda 7D — señal de sesión basada en el user persistido (el JWT vive
// en una cookie httpOnly).
import { isLoggedIn } from "../services/auth";

// ════════════════════════════════════════════════════════════════
// Onboarding — Tanda 4C
// ════════════════════════════════════════════════════════════════
//
// Tour guiado de 4 pasos que aparece automáticamente la PRIMERA
// vez que el usuario logueado entra al app. Se guarda en
// localStorage para no volver a salir. Cualquier acción
// (Skip / Finish / X / Esc / clic fuera) marca la tour como
// completada.
//
// Para que el usuario pueda volver a verla, el Navbar tiene un
// item "Take the tour" que dispara un evento personalizado
// window.dispatchEvent(new Event('sq:show-onboarding')); este
// componente escucha y se reabre, ignorando el flag de
// localStorage en esa sesión.
//
// Se monta en Layout.jsx → presente en TODA la app (excepto en
// las rutas NAV_FREE_PATHS donde el Navbar/BottomNavbar no se
// montan). Internamente decide cuándo mostrarse:
//   - usuario logueado (hay token en localStorage)
//   - no se ha completado antes
//   - no estamos en /login, /register, /, ni paginas legales
// ════════════════════════════════════════════════════════════════

const STORAGE_KEY = "sq.onboarding.completed.v1";
// Si en el futuro cambiamos los pasos del tour de forma sustancial
// y queremos que TODOS los usuarios vean el nuevo tour, basta con
// incrementar el version-suffix de STORAGE_KEY (v2, v3...) en lugar
// de borrar el flag manualmente para cada usuario.

const TOUR_EVENT = "sq:show-onboarding";

// Pasos del tour. Cambiar / añadir / quitar pasos editando este
// array — el componente se adapta automáticamente al length.
const STEPS = [
  {
    icon: FiSmile,
    iconClass: "sq-onb-icon-welcome",
    title: "Welcome to SideQuest",
    body: (
      <>
        The social network for the <strong>real world</strong>. Quick tour to
        get you started — should take less than a minute.
      </>
    ),
  },
  {
    icon: FiMapPin,
    iconClass: "sq-onb-icon-map",
    title: "Find events near you",
    body: (
      <>
        Open the map to see what's happening around you. Tap any marker for
        details, see who's going, and chat with participants.
      </>
    ),
  },
  {
    icon: FiPlusCircle,
    iconClass: "sq-onb-icon-create",
    title: "Create your own quest",
    body: (
      <>
        Tap the <strong>+</strong> button at the bottom to create a new event.
        Pick a spot on the map, set date and time, invite friends, or make it
        public for everyone.
      </>
    ),
  },
  {
    icon: FiUsers,
    iconClass: "sq-onb-icon-connect",
    title: "Connect with friends",
    body: (
      <>
        Add friends, send direct messages, and stay in the loop with group
        chats. Everyone you invite to an event gets their own private room
        automatically.
      </>
    ),
  },
];

// Rutas en las que el tour NO debe auto-abrirse (incluso si el
// usuario está logueado y no lo ha hecho antes). Mantiene los
// flujos críticos limpios.
const HIDE_ON_PATHS = ["/login", "/register", "/terms", "/privacy", "/legal", "/"];

const ONB_CSS = `
.sq-onb-modal .modal-content {
  background: #161922;
  color: #e9ecef;
  border: 1px solid #262a36;
  border-radius: 16px;
}
.sq-onb-modal .modal-header,
.sq-onb-modal .modal-footer {
  border-color: #262a36;
}
.sq-onb-modal .btn-close {
  filter: invert(1);
}

/* Hero del paso — icono grande circular con gradiente */
.sq-onb-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 1.5rem 1.25rem 0.5rem;
}
.sq-onb-icon-wrap {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  margin-bottom: 1rem;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35);
}
.sq-onb-icon-welcome { background: linear-gradient(135deg, #6366f1, #ec4899); }
.sq-onb-icon-map     { background: linear-gradient(135deg, #22d3ee, #4f46e5); }
.sq-onb-icon-create  { background: linear-gradient(135deg, #6366f1, #facc15); }
.sq-onb-icon-connect { background: linear-gradient(135deg, #ec4899, #f97316); }

.sq-onb-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin: 0.25rem 0 0.75rem;
}
.sq-onb-body {
  color: #cbd0d8;
  font-size: 0.95rem;
  line-height: 1.5;
  max-width: 36ch;
  margin: 0 auto;
}

/* Progreso (dots) */
.sq-onb-dots {
  display: flex;
  justify-content: center;
  gap: 0.45rem;
  margin: 1.25rem 0 0.5rem;
}
.sq-onb-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2a2f42;
  transition: background 0.2s, transform 0.2s;
}
.sq-onb-dot.active {
  background: linear-gradient(135deg, #6366f1, #ec4899);
  transform: scale(1.3);
}

/* Footer buttons */
.sq-onb-btn-skip {
  background: transparent !important;
  border: none !important;
  color: #adb5bd !important;
  font-size: 0.85rem !important;
}
.sq-onb-btn-skip:hover { color: #fff !important; }

.sq-onb-btn-prev {
  background: #1e2230 !important;
  border: 1px solid #262a36 !important;
  color: #adb5bd !important;
}
.sq-onb-btn-prev:hover { background: #262a36 !important; color: #fff !important; }
.sq-onb-btn-prev:disabled { opacity: 0.35; }

.sq-onb-btn-next {
  background: linear-gradient(135deg, #6366f1, #4f46e5) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
}
.sq-onb-btn-next:hover { background: linear-gradient(135deg, #4f46e5, #4338ca) !important; }

.sq-onb-btn-finish {
  background: linear-gradient(135deg, #22c55e, #16a34a) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
}
.sq-onb-btn-finish:hover { background: linear-gradient(135deg, #16a34a, #15803d) !important; }
`;

export const Onboarding = () => {
  const [show, setShow] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  // Decide si abrir el tour automáticamente al cargar la app.
  // Reglas: usuario logueado + no completado + ruta apropiada.
  // Tanda 7D — el JWT vive en una cookie httpOnly: la señal de sesión
  // es el user persistido (isLoggedIn).
  const shouldAutoOpen = useCallback(() => {
    if (typeof window === "undefined") return false;
    if (!isLoggedIn()) return false;
    if (localStorage.getItem(STORAGE_KEY) === "true") return false;
    const path = window.location.pathname;
    if (HIDE_ON_PATHS.includes(path)) return false;
    return true;
  }, []);

  useEffect(() => {
    // Pequeño delay para que la página cargue primero — el tour
    // sobre una pantalla aún vacía se ve pobre.
    if (!shouldAutoOpen()) return;
    const t = setTimeout(() => {
      setStepIdx(0);
      setShow(true);
    }, 700);
    return () => clearTimeout(t);
  }, [shouldAutoOpen]);

  // Listener para el evento "abrir tour" disparado por el menú
  // hamburger del Navbar. Ignora HIDE_ON_PATHS porque si el
  // usuario pidió explícitamente "Take the tour", queremos abrirlo
  // aunque esté en una ruta atípica.
  useEffect(() => {
    const open = () => {
      setStepIdx(0);
      setShow(true);
    };
    window.addEventListener(TOUR_EVENT, open);
    return () => window.removeEventListener(TOUR_EVENT, open);
  }, []);

  // Cualquier salida del tour (skip / finish / X / esc) marca
  // completado.
  const close = useCallback(() => {
    setShow(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch (_) {
      /* localStorage puede fallar en modo privado de algunos
         navegadores — no es crítico, el tour solo volverá a
         salir si el usuario recarga, que es aceptable. */
    }
  }, []);

  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;
  const step = STEPS[stepIdx];
  const IconCmp = step.icon;

  const next = () => {
    if (isLast) close();
    else setStepIdx((i) => i + 1);
  };
  const prev = () => {
    if (!isFirst) setStepIdx((i) => i - 1);
  };

  if (!show) return null;

  return (
    <>
      <style>{ONB_CSS}</style>

      <Modal
        show={show}
        onHide={close}
        centered
        dialogClassName="sq-onb-modal"
        aria-labelledby="sq-onb-title"
      >
        <Modal.Header className="border-0 pb-0">
          {/* Skip lleva el peso semántico (saltar = completar). El X
              de Bootstrap también cierra (close handler los iguala). */}
          <Button
            className="sq-onb-btn-skip ms-auto"
            onClick={close}
            aria-label="Skip tour"
            title="Skip tour"
          >
            Skip <FiX className="ms-1" />
          </Button>
        </Modal.Header>

        <Modal.Body>
          <div className="sq-onb-hero">
            <div className={`sq-onb-icon-wrap ${step.iconClass}`} aria-hidden="true">
              <IconCmp size={42} />
            </div>
            <h2 id="sq-onb-title" className="sq-onb-title">
              {step.title}
            </h2>
            <p className="sq-onb-body">{step.body}</p>
          </div>

          {/* Dots de progreso */}
          <div
            className="sq-onb-dots"
            role="progressbar"
            aria-valuenow={stepIdx + 1}
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-label={`Step ${stepIdx + 1} of ${STEPS.length}`}
          >
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`sq-onb-dot ${i === stepIdx ? "active" : ""}`}
              />
            ))}
          </div>
        </Modal.Body>

        <Modal.Footer className="border-0 pt-0 d-flex justify-content-between">
          <Button
            className="sq-onb-btn-prev"
            onClick={prev}
            disabled={isFirst}
            aria-label="Previous step"
          >
            <FiChevronLeft className="me-1" /> Previous
          </Button>

          {isLast ? (
            <Button
              className="sq-onb-btn-finish"
              onClick={next}
              aria-label="Finish tour"
            >
              <FiCheck className="me-1" /> Let's go!
            </Button>
          ) : (
            <Button
              className="sq-onb-btn-next"
              onClick={next}
              aria-label="Next step"
            >
              Next <FiChevronRight className="ms-1" />
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </>
  );
};

// Exportamos también el nombre del evento personalizado para que
// el Navbar (u otros) lo dispare sin duplicar el string.
export const SHOW_ONBOARDING_EVENT = TOUR_EVENT;

export default Onboarding;
