export const API_ORIGIN =
  import.meta.env.VITE_API_ORIGIN?.replace(/\/+$/, "") || window.location.origin;
export const API_BASE = `${API_ORIGIN}/api`;
