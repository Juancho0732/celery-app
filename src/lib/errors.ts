// Traduce los errores de Supabase/PostgREST a mensajes para el usuario.

interface MaybeError {
  message?: string
  code?: string
  details?: string | null
}

const AUTH_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Primero confirma tu correo con el enlace que te enviamos.',
  'User already registered': 'Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.',
  'Password should be at least 6 characters.': 'La contraseña debe tener al menos 6 caracteres.',
}

export function errorMessage(error: unknown): string {
  if (!error) return 'Ocurrió un error inesperado.'
  const e = error as MaybeError
  const msg = e.message ?? String(error)
  if (AUTH_MESSAGES[msg]) return AUTH_MESSAGES[msg]
  if (msg.startsWith('Password should')) return 'La contraseña debe tener al menos 8 caracteres, con letras y números.'
  if (/rate limit/i.test(msg)) return 'Demasiados intentos. Espera unos minutos y vuelve a intentar.'
  // Errores lanzados por nuestras funciones SQL ya vienen en español.
  if (e.code === 'P0001' || e.code === 'P0002' || e.code === '42501') return msg
  if (e.code === '23505') return 'Ya existe un registro con esos datos.'
  if (e.code === '23503') return 'No se puede completar: hay registros relacionados que lo impiden.'
  if (/row-level security/i.test(msg)) return 'No tienes permiso para hacer esto en este negocio.'
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sin conexión con el servidor. Revisa tu internet.'
  return msg
}

/** Lanza el error de una respuesta de Supabase o devuelve sus datos. */
export function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error
  return res.data as T
}
