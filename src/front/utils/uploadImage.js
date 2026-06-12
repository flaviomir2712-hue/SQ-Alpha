// Limits per-context — change here, applies everywhere.
const LIMITS = {
  profile: { maxSide: 512,  quality: 0.85 },   // avatar pequeño
  event:   { maxSide: 1600, quality: 0.85 },   // portada grande
  chat:    { maxSide: 1280, quality: 0.82 },   // foto en chat
};

const API = import.meta.env.VITE_BACKEND_URL;

// Comprime con canvas y devuelve dataURL base64.
// Maneja archivos hasta ~25 MB (el browser puede leerlos).
// Después de comprimir un iPhone 4MB → ~250 KB.
export const compressImage = (file, kind = "chat") =>
  new Promise((resolve, reject) => {
    const cfg = LIMITS[kind] || LIMITS.chat;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const max = cfg.maxSide;
      if (width > height && width > max) {
        height = Math.round((height * max) / width); width = max;
      } else if (height > max) {
        width = Math.round((width * max) / height); height = max;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", cfg.quality));
    };
    img.onerror = reject;
    img.src = url;
  });

// ─────────────────────────────────────────────────────────────
// Tanda 7V — Cloudinary. Hasta ahora el dataURL base64 se guardaba
// DIRECTO en la base de datos y volvía completo en cada respuesta de
// la API (un GET /events con fotos pesaba megas). Ahora se sube una
// vez al backend (POST /api/upload → Cloudinary) y en la base solo se
// guarda la URL hosteada (~100 bytes, servida por CDN con caché).
//
// La autenticación (cookie httpOnly + X-CSRF-TOKEN) la añade el parche
// global de fetch (services/auth.js).
// ─────────────────────────────────────────────────────────────

// Sube un dataURL ya preparado. kind ∈ profile | event | chat | audio.
// Devuelve la URL hosteada. Lanza si el backend no puede subir.
export const uploadMedia = async (dataUrl, kind = "chat") => {
  const res = await fetch(`${API}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data_url: dataUrl, kind }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || `Upload failed (${res.status})`);
  return data.url;
};

// Conveniencia para imágenes: comprime con canvas y sube en un paso.
// Si la subida falla (p. ej. CLOUDINARY_URL sin configurar), devuelve
// el base64 comprimido como fallback — la app sigue funcionando en
// modo legacy, solo sin la optimización.
export const compressAndUpload = async (file, kind = "chat") => {
  const dataUrl = await compressImage(file, kind);
  try {
    return await uploadMedia(dataUrl, kind);
  } catch (err) {
    console.warn("[uploadImage] Cloudinary upload failed, using base64 fallback:", err?.message);
    return dataUrl;
  }
};

export default compressImage;
