import { clearSession } from "./auth";

const BASE = import.meta.env.VITE_BACKEND_URL;

// Tanda 7D — la autenticación ya no viaja en un header Bearer construido
// aquí: la cookie httpOnly y el header X-CSRF-TOKEN los añade el parche
// global de fetch (services/auth.js). Aquí solo queda el Content-Type.
const buildHeaders = (extra = {}) => ({
  "Content-Type": "application/json",
  ...extra,
});

const handleResponse = async (res) => {
  if (res.status === 401) {
    // La cookie de sesión expiró o fue revocada — limpiamos la sesión
    // local (user + csrf) y mandamos a login.
    clearSession();
    if (!window.location.pathname.includes("/login")) {
      window.location.href = "/login";
    }
    throw new Error("Session expired");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || `Error ${res.status}`);
  return data;
};

export const api = {
  get:  (path)         => fetch(`${BASE}/api${path}`, { headers: buildHeaders() }).then(handleResponse),
  post: (path, body)   => fetch(`${BASE}/api${path}`, { method: "POST",   headers: buildHeaders(), body: JSON.stringify(body || {}) }).then(handleResponse),
  put:  (path, body)   => fetch(`${BASE}/api${path}`, { method: "PUT",    headers: buildHeaders(), body: JSON.stringify(body || {}) }).then(handleResponse),
  del:  (path)         => fetch(`${BASE}/api${path}`, { method: "DELETE", headers: buildHeaders() }).then(handleResponse),
};
