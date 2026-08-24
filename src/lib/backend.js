const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const sessionKey = 'm3dz-supabase-session';

const configured = Boolean(url && anonKey);
const session = () => JSON.parse(localStorage.getItem(sessionKey) || 'null');
const headers = (extra = {}) => ({ apikey: anonKey, Authorization: `Bearer ${session()?.access_token || anonKey}`, 'Content-Type': 'application/json', ...extra });
async function call(path, options = {}) {
  if (!configured) throw new Error('Supabase n’est pas encore configuré. Ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local.');
  const res = await fetch(`${url}${path}`, { ...options, headers: headers(options.headers) });
  if (!res.ok) { const error = await res.json().catch(() => ({})); throw new Error(error.message || error.msg || 'Erreur serveur'); }
  return res.status === 204 ? null : res.json();
}
const rest = (table, query = '') => `/rest/v1/${table}${query}`;
export const backend = {
  configured,
  session,
  async signIn(email, password) { const data = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) }); localStorage.setItem(sessionKey, JSON.stringify(data)); return data; },
  async signOut() { await call('/auth/v1/logout', { method: 'POST' }); localStorage.removeItem(sessionKey); },
  vehicles: () => call(rest('vehicles','?select=*&order=created_at.desc')),
  createVehicle: data => call(rest('vehicles'), { method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify(data) }),
  updateVehicle: (id,data) => call(rest('vehicles',`?id=eq.${id}`), { method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify(data) }),
  deleteVehicle: id => call(rest('vehicles',`?id=eq.${id}`), { method:'DELETE' }),
  requests: () => call(rest('booking_requests','?select=*,vehicles(name)&order=created_at.desc')),
  createRequest: data => call(rest('booking_requests'), { method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify(data) }),
  updateRequest: (id,data) => call(rest('booking_requests',`?id=eq.${id}`), { method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify(data) }),
  deleteRequest: id => call(rest('booking_requests',`?id=eq.${id}`), { method:'DELETE' }),
  unavailable: vehicleId => call(rest('vehicle_unavailability',`?vehicle_id=eq.${vehicleId}&order=start_date`)),
  addUnavailability: data => call(rest('vehicle_unavailability'), { method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify(data) }),
  deleteUnavailability: id => call(rest('vehicle_unavailability',`?id=eq.${id}`), { method:'DELETE' })
};
