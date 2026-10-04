// Fecha local (AAAA-MM-DD) del ultimo dia en que se mostro la bienvenida.
// Clave propia: no se mezcla con los guardados.
const CLAVE = 'brief-paid-media:bienvenida'

const hoyLocal = () => new Date().toLocaleDateString('sv-SE')

// true si hoy aun no se ha mostrado; la marca como mostrada en el acto.
// Con localStorage bloqueado no se muestra, para no repetirla en cada apertura.
export function tocaBienvenida() {
  try {
    const hoy = hoyLocal()
    if (localStorage.getItem(CLAVE) === hoy) return false
    localStorage.setItem(CLAVE, hoy)
    return true
  } catch {
    return false
  }
}
