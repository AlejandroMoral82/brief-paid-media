// Huella del estado de ajustes que el usuario ya ha visto. Si cambia, el
// engranaje lleva un punto hasta que se abre la capa.
const CLAVE = 'brief-paid-media:ajustes-visto'

// La huella guardada, null si aun no hay ninguna, o undefined si localStorage
// no esta disponible (entonces no se muestra el punto).
export function huellaVista() {
  try {
    return localStorage.getItem(CLAVE)
  } catch {
    return undefined
  }
}

// Devuelve si se pudo guardar.
export function marcarVista(huella) {
  try {
    localStorage.setItem(CLAVE, huella)
    return true
  } catch {
    return false
  }
}
