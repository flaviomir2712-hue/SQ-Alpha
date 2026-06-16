// src/front/services/auth.js
//
// Tanda 7D — Sesión basada en cookies httpOnly.
//
// El JWT ya NO se guarda en localStorage (ahí era legible por cualquier
// XSS). Ahora vive en una cookie httpOnly (sq_access_token) que el
// navegador adjunta solo y que JS no puede leer. En localStorage quedan
// únicamente:
//   - "user"        → objeto usuario (datos de UI, no es una credencial)
//   - "csrf_token"  → anti-CSRF double-submit; sin la cookie no vale nada
//
// Este módulo además parchea window.fetch UNA sola vez para que toda
// llamada al backend (el proyecto tiene helpers fetch inline repartidos
// por muchos componentes) salga con:
//   - credentials: "include"      → el navegador adjunta la cookie
//   - X-CSRF-TOKEN: <csrf_token>  → lo exige el backend en POST/PUT/
//                                   PATCH/DELETE con sesión de cookie
//   - sin Authorization legacy    → los viejos "Bearer null" se eliminan
//     (así un fallo de cookie produce un 401 limpio, nunca un 422)
//
// IMPORTANTE: importar este módulo ANTES de renderizar la app — main.jsx
// lo importa en su primera línea de servicios.

const BASE = import.meta.env.VITE_BACKEND_URL || "";

export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem("user");
    // "undefined" literal: residuo de versiones viejas que hacían
    // setItem(key, undefined). Tratado como "sin sesión".
    if (!raw || raw === "undefined") return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// "¿Hay sesión?" — la cookie httpOnly no es legible desde JS, así que la
// señal de UI es la presencia del user persistido. Si la cookie real
// murió (expiró / se limpió), la primera llamada al backend devolverá
// 401 y api.js limpia la sesión local y redirige a /login.
export const isLoggedIn = () => !!getStoredUser();

export const getCsrfToken = () => {
  try {
    return localStorage.getItem("csrf_token") || null;
  } catch {
    return null;
  }
};

export const setSession = (user, csrfToken) => {
  if (user && typeof user === "object") {
    localStorage.setItem("user", JSON.stringify(user));
  }
  if (typeof csrfToken === "string" && csrfToken) {
    localStorage.setItem("csrf_token", csrfToken);
  }
};

export const clearSession = () => {
  localStorage.removeItem("user");
  localStorage.removeItem("csrf_token");
  // Limpieza del token legacy de sesiones anteriores a la Tanda 7D.
  localStorage.removeItem("token");
};

// ── Parche global de fetch ───────────────────────────────────
// Solo toca llamadas a NUESTRO backend; tiles del mapa, Nominatim,
// etc. pasan sin modificar. Los helpers inline existentes construyen
// headers como objetos planos, por eso el spread es suficiente.
let patched = false;

export const installFetchPatch = () => {
  if (patched || typeof window === "undefined" || !window.fetch) return;
  patched = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (!BASE || !url.startsWith(BASE)) {
      return originalFetch(input, init);
    }

    const headers = { ...(init.headers || {}) };
    // Los helpers antiguos mandaban "Bearer null" tras desaparecer el
    // token de localStorage — fuera siempre.
    delete headers.Authorization;
    const csrf = getCsrfToken();
    if (csrf) headers["X-CSRF-TOKEN"] = csrf;

    return originalFetch(input, { ...init, headers, credentials: "include" });
  };
};

installFetchPatch();
