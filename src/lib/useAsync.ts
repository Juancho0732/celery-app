import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Carga datos asíncronos y los vuelve a pedir cuando cambian las dependencias.
 * `reload()` fuerza una nueva carga (después de guardar algo).
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fnRef.current().then(
      (value) => { if (!cancelled) { setData(value); setLoading(false) } },
      (err) => { if (!cancelled) { setError(err); setLoading(false) } },
    )
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload }
}
