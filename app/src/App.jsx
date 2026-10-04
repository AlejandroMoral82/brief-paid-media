import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react'
import {
  cargarBrief, cargarDias, nombreDia, estaDesactualizado, haceCuanto, cargarTexto, urlSegura,
  HORAS_FRESCURA,
} from './data'
import { listar, idsGuardados, alternar, escucharCambios, bytesGuardados } from './guardados'
import { tocaBienvenida } from './bienvenida'
import { huellaVista, marcarVista } from './novedades'
import { CATS, nombreCat, colorCat as color } from './categorias'

// Iconos de interfaz (trazo, rejilla 24x24).
const ENGRANAJE = <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>
const CERRAR = <><path d="M6 6l12 12"/><path d="M18 6 6 18"/></>

// Gesto de deslizar: a partir de UMBRAL_EJE px se decide si es horizontal o scroll.
const UMBRAL_EJE = 10
const UMBRAL_GUARDAR = 90

// '2026-10-03' -> '3 de octubre de 2026'. Mediodia local para no cambiar de dia por zona horaria.
const fechaHora = (iso) => {
  const f = new Date(iso)
  return Number.isNaN(f.getTime())
    ? '—'
    : f.toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
const megas = (b) => `${(b / 1048576).toFixed(1)} MB`
const tamano = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : megas(b))
const diaLegible = (iso) => {
  const f = new Date(`${iso}T12:00:00`)
  return Number.isNaN(f.getTime()) ? iso : f.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Foco atrapado en un dialogo: Tab y Mayus+Tab dan la vuelta dentro del contenedor.
function atraparFoco(e, contenedor) {
  if (e.key !== 'Tab' || !contenedor) return
  const f = [...contenedor.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')]
  if (!f.length) return
  const primero = f[0]
  const ultimo = f[f.length - 1]
  if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus() }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
}

function Filtros({ activos, abrir, boton, abierto }) {
  const n = activos.size
  return (
    <div className="filtros">
      <button ref={boton} type="button" className={`filtrar${n ? ' activo' : ''}`}
        aria-haspopup="dialog" aria-expanded={abierto} onClick={abrir}
        aria-label={n ? `Filtrar por categoría, ${n} ${n === 1 ? 'activa' : 'activas'}` : 'Filtrar por categoría'}>
        {n ? `Filtrar · ${n}` : 'Filtrar'}
      </button>
    </div>
  )
}

// ---------- rueda de filtro: un quesito por categoria, en el orden de categorias.json ----------

const HUECO = 10         // separacion entre quesitos, px: deja ver las sombras
const HOLGURA = 6        // distancia minima de la etiqueta a los bordes del quesito
const ETIQUETA_ALTO = 36 // punto + nombre, apilados
const FUENTE_QUESITO = '600 13.5px "Plus Jakarta Sans", system-ui, sans-serif'
// Giro del primer quesito. Se prueba cada uno y se queda el que deja el circulo mas pequeno.
const GIROS = [-90, -60]

const rad = (g) => (g * Math.PI) / 180
const centroQuesito = (i, n, giro) => giro + (360 / n) * i

// La caja de la etiqueta (centrada a rl del centro) cabe entera dentro del quesito i.
function etiquetaCabe(R, rl, ancho, i, n, giro) {
  const span = 360 / n
  const c = centroQuesito(i, n, giro)
  const cx = rl * Math.cos(rad(c))
  const cy = rl * Math.sin(rad(c))
  for (const dx of [-ancho / 2, ancho / 2]) {
    for (const dy of [-ETIQUETA_ALTO / 2, ETIQUETA_ALTO / 2]) {
      const x = cx + dx
      const y = cy + dy
      const d = Math.hypot(x, y)
      if (d > R - HOLGURA || d < 2 * HOLGURA) return false
      if (n > 1) {
        const dif = ((((Math.atan2(y, x) * 180) / Math.PI) - c + 540) % 360) - 180
        const margen = (Math.asin(Math.min(1, (HUECO + HOLGURA) / d)) * 180) / Math.PI
        if (Math.abs(dif) > span / 2 - margen) return false
      }
    }
  }
  return true
}

// Diametro mas pequeno (desde 280 px) en el que caben todos los nombres sin
// tocar la letra. Si no caben ni con el maximo, se usa el maximo.
function medidaRueda(anchos, maximo) {
  const n = anchos.length
  let mejor = null
  for (const giro of GIROS) {
    for (let D = 280; D <= maximo && (!mejor || D < mejor.D); D += 2) {
      const R = D / 2
      let k = null
      for (let r = 0.5; r <= 0.84 && k === null; r += 0.02) {
        if (anchos.every((w, i) => etiquetaCabe(R, R * r, w, i, n, giro))) k = r
      }
      if (k !== null) { mejor = { D, k, giro }; break }
    }
  }
  return mejor || { D: maximo, k: 0.68, giro: GIROS[0] }
}

function medirAnchos() {
  const ctx = document.createElement('canvas').getContext('2d')
  ctx.font = FUENTE_QUESITO
  return CATS.map((c) => Math.ceil(ctx.measureText(nombreCat(c)).width) + 4)
}

// Ancho util: la capa deja 8 px de margen y el panel 6 px de relleno por lado.
const maximoRueda = () => Math.min(window.innerWidth - 28, 440)

function RuedaFiltro({ inicial, aplicar, cerrar }) {
  const caja = useRef(null)
  const [sel, setSel] = useState(() => new Set(inicial))
  const [anchos, setAnchos] = useState(medirAnchos)
  const [maximo, setMaximo] = useState(maximoRueda)

  useEffect(() => {
    let vigente = true
    // Se vuelve a medir con la fuente ya cargada.
    document.fonts?.ready.then(() => { if (vigente) setAnchos(medirAnchos()) })
    const medir = () => setMaximo(maximoRueda())
    window.addEventListener('resize', medir)
    return () => { vigente = false; window.removeEventListener('resize', medir) }
  }, [])

  useEffect(() => { caja.current?.querySelector('.quesito')?.focus() }, [])

  const { D, k, giro } = useMemo(() => medidaRueda(anchos, maximo), [anchos, maximo])
  const R = D / 2
  const n = CATS.length
  const span = 360 / n
  // Cada quesito se separa del centro lo justo para dejar HUECO px con sus vecinos.
  const sep = n > 1 ? HUECO / (2 * Math.sin(rad(span / 2))) : 0
  const Rq = R - sep

  const alternar = (c) => {
    const s = new Set(sel)
    if (s.has(c)) s.delete(c)
    else s.add(c)
    setSel(s)
  }

  const teclado = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cerrar(); return }
    atraparFoco(e, caja.current)
  }

  return (
    <div className="capa centrada">
      <div className="velo" onClick={cerrar} aria-hidden="true" />
      <section ref={caja} className="panel-filtro" role="dialog" aria-modal="true"
        aria-labelledby="filtro-titulo" onKeyDown={teclado}>
        <h2 id="filtro-titulo">Filtrar por categoría</h2>
        <svg className="rueda" width={D} height={D} viewBox={`${-R} ${-R} ${D} ${D}`}>
          <defs>
            <filter id="q-elevado" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b" />
              <feOffset in="b" dx="4" dy="4" result="bo" />
              <feFlood style={{ floodColor: 'var(--sombra-o)' }} result="co" />
              <feComposite in="co" in2="bo" operator="in" result="so" />
              <feOffset in="b" dx="-4" dy="-4" result="bc" />
              <feFlood style={{ floodColor: 'var(--sombra-c)' }} result="cc" />
              <feComposite in="cc" in2="bc" operator="in" result="sc" />
              <feMerge><feMergeNode in="so" /><feMergeNode in="sc" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="q-hundido">
              <feComponentTransfer in="SourceAlpha" result="inv"><feFuncA type="table" tableValues="1 0" /></feComponentTransfer>
              <feGaussianBlur in="inv" stdDeviation="7" result="b" />
              <feOffset in="b" dx="7" dy="7" result="bo" />
              <feFlood style={{ floodColor: 'var(--sombra-o)' }} result="co" />
              <feComposite in="co" in2="bo" operator="in" result="so1" />
              <feComposite in="so1" in2="SourceAlpha" operator="in" result="so" />
              <feOffset in="b" dx="-7" dy="-7" result="bc" />
              <feFlood style={{ floodColor: 'var(--sombra-c)' }} result="cc" />
              <feComposite in="cc" in2="bc" operator="in" result="sc1" />
              <feComposite in="sc1" in2="SourceAlpha" operator="in" result="sc" />
              {/* La sombra oscura dos veces: a escala de quesito, una sola apenas se nota. */}
              <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="so" /><feMergeNode in="so" /><feMergeNode in="sc" /></feMerge>
            </filter>
          </defs>
          {CATS.map((c, i) => {
            const centro = centroQuesito(i, n, giro)
            const a0 = rad(centro - span / 2)
            const a1 = rad(centro + span / 2)
            const forma = n === 1
              ? `M${-Rq} 0a${Rq} ${Rq} 0 1 0 ${2 * Rq} 0a${Rq} ${Rq} 0 1 0 ${-2 * Rq} 0`
              : `M0 0L${Rq * Math.cos(a0)} ${Rq * Math.sin(a0)}A${Rq} ${Rq} 0 ${span > 180 ? 1 : 0} 1 ${Rq * Math.cos(a1)} ${Rq * Math.sin(a1)}Z`
            const lx = R * k * Math.cos(rad(centro)) - sep * Math.cos(rad(centro))
            const ly = R * k * Math.sin(rad(centro)) - sep * Math.sin(rad(centro))
            const on = sel.has(c)
            return (
              <g key={c} className="quesito" role="checkbox" aria-checked={on} aria-label={nombreCat(c)}
                tabIndex={0} transform={`translate(${sep * Math.cos(rad(centro))} ${sep * Math.sin(rad(centro))})`}
                onClick={() => alternar(c)}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); alternar(c) } }}>
                <path className="quesito-forma" d={forma} filter={on ? 'url(#q-hundido)' : 'url(#q-elevado)'} />
                <circle cx={lx} cy={ly - 9} r="5" fill={color(c)} aria-hidden="true" />
                <text className="quesito-nombre" x={lx} y={ly + 13} textAnchor="middle" aria-hidden="true">
                  {nombreCat(c)}
                </text>
              </g>
            )
          })}
        </svg>
        <div className="filtro-acciones">
          <button type="button" className="limpiar" onClick={() => setSel(new Set())}>Limpiar todo</button>
          <button type="button" className="aceptar" onClick={() => aplicar(sel)}>Aceptar</button>
        </div>
      </section>
    </div>
  )
}

function Item({ it, abrir, marcado, onGuardar, bloqueado, par }) {
  const [dx, setDx] = useState(0)
  const [arrastrando, setArrastrando] = useState(false)
  const inicio = useRef(null)
  const eje = useRef(null)
  const ultimoGesto = useRef(0)

  const fin = () => {
    if (eje.current === 'x' && dx > UMBRAL_GUARDAR) onGuardar?.(it)
    inicio.current = null
    eje.current = null
    setDx(0)
    setArrastrando(false)
  }

  const tocar = bloqueado ? {} : {
    onTouchStart: (e) => {
      const t = e.touches[0]
      inicio.current = { x: t.clientX, y: t.clientY }
      eje.current = null
    },
    onTouchMove: (e) => {
      if (!inicio.current) return
      const t = e.touches[0]
      const mx = t.clientX - inicio.current.x
      const my = t.clientY - inicio.current.y
      if (!eje.current) {
        if (Math.abs(mx) < UMBRAL_EJE && Math.abs(my) < UMBRAL_EJE) return
        // Se decide una sola vez por toque: si domina el vertical es scroll y se ignora.
        eje.current = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'
        ultimoGesto.current = Date.now()
        if (eje.current === 'x') setArrastrando(true)
      }
      if (eje.current === 'x') setDx(Math.max(0, Math.min(130, mx)))
    },
    onTouchEnd: fin,
    onTouchCancel: fin,
  }

  // Tras un deslizamiento el navegador puede disparar un click: no abre el articulo.
  const pulsar = () => {
    if (Date.now() - ultimoGesto.current < 400) return
    abrir(it)
  }

  return (
    <div className="swipe">
      <div className={`swipe-bg${marcado ? ' quitando' : ''}`} aria-hidden="true"
        style={{ opacity: Math.min(dx / UMBRAL_GUARDAR, 1) }}>
        {marcado
          ? (dx > UMBRAL_GUARDAR ? 'quitar ✓' : 'quitar de guardados')
          : (dx > UMBRAL_GUARDAR ? 'guardar ✓' : 'guardar')}
      </div>
      <button type="button" data-item={it.id} className={`item${par ? ' par' : ''}`}
        style={{ transform: `translateX(${dx}px)`, transition: arrastrando ? 'none' : 'transform .3s cubic-bezier(.2,.9,.2,1)' }}
        onClick={pulsar}
        {...tocar}>
        <span className="head">
          <span className="pip" style={{ color: color(it.categoria), background: color(it.categoria) }} />
          <span className="src">{it.fuente}</span>
          <span className="ago">{haceCuanto(it.publicado)}</span>
        </span>
        <span className="tl">{it.titulo}</span>
        {marcado && <span className="marca" />}
      </button>
    </div>
  )
}

function Lector({ it, volver, onGuardar, guardado }) {
  const titulo = useRef(null)
  const [carga, setCarga] = useState({ id: null })
  const hayQueCargar = !it.texto && Boolean(it.texto_disponible)

  useEffect(() => {
    if (!hayQueCargar) return
    let vigente = true
    cargarTexto(it.id)
      .then((texto) => { if (vigente) setCarga({ id: it.id, texto }) })
      .catch(() => { if (vigente) setCarga({ id: it.id, fallo: true }) })
    return () => { vigente = false }
  }, [it.id, hayQueCargar])

  // El foco va al titulo para que el lector de pantalla anuncie el articulo.
  useEffect(() => { titulo.current?.focus({ preventScroll: true }) }, [it.id])

  const propio = carga.id === it.id ? carga : {}
  const texto = it.texto || propio.texto || null
  const fallo = !texto && (!it.texto_disponible || propio.fallo)
  const enlace = urlSegura(it.url)
  const imagen = urlSegura(it.imagen)

  return (
    <div className="reader">
      <button type="button" className="back" onClick={volver}>← Volver</button>
      <h2 ref={titulo} tabIndex={-1}>{it.titulo}</h2>
      <div className="rmeta">
        <span className="pip" style={{ color: color(it.categoria), background: color(it.categoria) }} />
        <span>{nombreCat(it.categoria)} · {it.fuente} · hace {haceCuanto(it.publicado)}</span>
      </div>

      {imagen && (
        <img className="portada" src={imagen} alt="" referrerPolicy="no-referrer" loading="lazy"
          onError={(e) => { e.currentTarget.style.display = 'none' }} />
      )}

      {texto
        ? texto.split('\n').filter((p) => p.trim()).map((p, i) => (
            <p className="cuerpo" key={i}>{p}</p>
          ))
        : (
          <>
            <p className="cuerpo">{it.resumen || 'Este feed no incluye resumen.'}</p>
            {fallo && (
              <div className="aviso" style={{ marginTop: 22 }}>
                No se pudo recuperar el texto completo.{enlace && ' Ábrelo en el original.'}
              </div>
            )}
          </>
        )}

      <div>
        <button type="button" className={`quitar${guardado ? ' activo' : ''}`}
          onClick={() => onGuardar(it, texto || '')}>
          {guardado ? 'quitar de guardados' : 'guardar'}
        </button>
      </div>
      {enlace
        ? (
          <a className="orig" href={enlace} target="_blank" rel="noreferrer">
            {texto ? 'ver en el original, con imágenes' : 'abrir el original'}
          </a>
        )
        : <div className="aviso" style={{ marginTop: 38 }}>El enlace original no es válido.</div>}
    </div>
  )
}

function Archivo({ abrirDia }) {
  const [info, setInfo] = useState(null)
  useEffect(() => { cargarDias().then(setInfo).catch(() => setInfo({ dias: [], bytes: 0 })) }, [])

  if (!info) return <div className="vacio">cargando…</div>
  if (!info.dias.length) return <div className="vacio">todavía no hay archivo</div>

  return (
    <>
      <h1 className="titulo-seccion">Archivo</h1>
      <div className="date">
        {info.dias.length} días · se borra a los 30 días
      </div>
      {info.dias.map((d) => (
        <button key={d} type="button" className="dia" onClick={() => abrirDia(d)}>
          {nombreDia(d)}<span>{d}</span>
        </button>
      ))}
    </>
  )
}

function Guardados({ abrir, quitar, ids }) {
  // Solo se relee localStorage cuando cambia el conjunto de guardados.
  const items = useMemo(() => listar().filter((x) => ids.has(x.id)), [ids])
  if (!items.length) {
    return <div className="vacio">nada guardado todavía<br />desliza un titular a la derecha</div>
  }
  return (
    <>
      <h1 className="titulo-seccion">Guardados</h1>
      <div className="date">{items.length} artículos</div>
      {items.map((it, n) => (
        <div key={it.id} className="fila-guardado">
          <Item it={it} abrir={abrir} marcado bloqueado par={n % 2 === 1} />
          <button type="button" className="quitar activo" onClick={() => quitar(it)}>quitar</button>
        </div>
      ))}
    </>
  )
}

function Brief({ brief, dia, activos, abrirFiltro, botonFiltro, filtroAbierto, verResto, mostrarResto, abrir, guardados, guardar }) {
  const esUltimo = dia === 'latest'

  const filtra = (l) => (activos.size ? l.filter((i) => activos.has(i.categoria)) : l)
  const destacados = filtra(brief.items.filter((i) => i.destacado))
  const resto = filtra(brief.items.filter((i) => !i.destacado))
  const total = destacados.length + resto.length
  const visibles = verResto ? total : destacados.length

  const generado = new Date(brief.generado_en)
  const fecha = Number.isNaN(generado.getTime())
    ? (esUltimo ? '' : dia)
    : generado.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      <div className="cabecera">
        <h1 className="titulo-seccion">{esUltimo ? 'Hoy' : `Archivo · ${diaLegible(dia)}`}</h1>
        <div className="date">
          {fecha}{fecha && ' · '}{visibles} de {total}
        </div>
      </div>

      {/* En Hoy el estado se consulta en la capa de ajustes; un dia del archivo conserva su aviso. */}
      {!esUltimo && (brief.modo === 'degradado' || brief.fuentes_fallidas.length > 0) && (
        <div className="aviso">
          {brief.modo === 'degradado' && <>Sin selección: el modelo no respondió, los items van por fecha.<br /></>}
          {brief.fuentes_fallidas.length > 0 && <>Fuentes con fallo: {brief.fuentes_fallidas.join(', ')}</>}
        </div>
      )}

      <Filtros activos={activos} abrir={abrirFiltro} boton={botonFiltro} abierto={filtroAbierto} />

      {total === 0 ? (
        <div className="vacio">nada en esta categoría{esUltimo && ' hoy'}</div>
      ) : (
        <>
          {destacados.map((it, n) => (
            <Item key={it.id} it={it} abrir={abrir} par={n % 2 === 1}
              marcado={guardados.has(it.id)} onGuardar={guardar} />
          ))}
          {resto.length > 0 && !verResto && (
            <button type="button" className="resto" onClick={mostrarResto}>
              ver los otros {resto.length}
            </button>
          )}
          {verResto && resto.map((it) => (
            <Item key={it.id} it={it} abrir={abrir}
              marcado={guardados.has(it.id)} onGuardar={guardar} />
          ))}
        </>
      )}
    </>
  )
}

function Bienvenida({ destacados, fin }) {
  const [saliendo, setSaliendo] = useState(false)
  const boton = useRef(null)

  useEffect(() => {
    boton.current?.focus({ preventScroll: true })
    const t = setTimeout(() => setSaliendo(true), 1500)
    return () => clearTimeout(t)
  }, [])

  // Sin animacion (prefers-reduced-motion) se retira en el acto.
  useEffect(() => {
    if (!saliendo) return
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t = setTimeout(fin, reducido ? 0 : 400)
    return () => clearTimeout(t)
  }, [saliendo, fin])

  const hayCifra = typeof destacados === 'number' && Number.isFinite(destacados)
  return (
    <button ref={boton} type="button" className={`bienvenida${saliendo ? ' saliendo' : ''}`}
      onClick={() => setSaliendo(true)}>
      <span className="bienvenida-tarjeta">
        <span className="bienvenida-saludo">Bienvenido, Rubén</span>
        {/* Si latest.json falla o no trae la cifra, solo el saludo. */}
        <span className="bienvenida-linea">
          {hayCifra ? `${destacados} ${destacados === 1 ? 'destacado' : 'destacados'} hoy` : '\u00a0'}
        </span>
      </span>
    </button>
  )
}

// Pasadas del brief. Un fichero anterior al campo `pasadas` aporta la suya
// a partir de los campos de nivel superior (ARQUITECTURA.md, 3.2).
function pasadasDe(b) {
  const l = Array.isArray(b.pasadas) ? b.pasadas.filter((p) => p && typeof p === 'object') : []
  const base = l.length ? l : [{ hora: b.generado_en, modo: b.modo, fuentes_fallidas: b.fuentes_fallidas }]
  return base.map((p) => ({
    hora: p.hora,
    modo: p.modo === 'degradado' ? 'degradado' : 'normal',
    fallidas: Array.isArray(p.fuentes_fallidas) ? p.fuentes_fallidas : [],
  }))
}

// Huella de lo que muestra la capa de ajustes. Incluye la frescura, que depende
// de la hora, asi que se recalcula en cada render.
const huellaDe = (u) => `${u.generado}|${u.comprobado}|${u.modo}|${estaDesactualizado(u.comprobado)}`

function Ajustes({ cerrar }) {
  const panel = useRef(null)
  const [estado, setEstado] = useState(null)
  const guardadosB = useMemo(() => bytesGuardados(), [])

  // Siempre el ultimo brief, aunque se este viendo un dia del archivo.
  useEffect(() => {
    let vigente = true
    Promise.allSettled([cargarBrief('latest'), cargarDias()]).then(([b, d]) => {
      if (!vigente) return
      setEstado({
        brief: b.status === 'fulfilled' ? b.value : null,
        dias: d.status === 'fulfilled' ? d.value : { dias: [], bytes: 0 },
      })
    })
    return () => { vigente = false }
  }, [])

  useEffect(() => { panel.current?.querySelector('.cerrar')?.focus() }, [])

  // Foco atrapado en el panel; el resto de la app esta inerte mientras tanto. Escape cierra.
  const teclado = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cerrar(); return }
    atraparFoco(e, panel.current)
  }

  const b = estado?.brief
  const pasadas = b ? pasadasDe(b) : []
  const conFallos = pasadas.some((p) => p.modo === 'degradado' || p.fallidas.length)

  return (
    <div className="capa">
      <div className="velo" onClick={cerrar} aria-hidden="true" />
      <section ref={panel} className="panel" role="dialog" aria-modal="true"
        aria-labelledby="ajustes-titulo" onKeyDown={teclado}>
        <div className="panel-cabecera">
          <h2 id="ajustes-titulo">Ajustes</h2>
          <button type="button" className="icono cerrar" aria-label="Cerrar ajustes" onClick={cerrar}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{CERRAR}</svg>
          </button>
        </div>

        {!estado ? <p className="panel-nota">cargando…</p> : (
          <>
            <h3>Almacenamiento</h3>
            <dl>
              <dt>Datos publicados</dt>
              <dd>{estado.dias.dias.length ? megas(estado.dias.bytes) : 'sin datos'}</dd>
              <dt>Guardados en este dispositivo</dt>
              <dd>{guardadosB ? tamano(guardadosB) : 'nada guardado'}</dd>
            </dl>

            <h3>Última actualización</h3>
            {b && estaDesactualizado(b.comprobado_en || b.generado_en) && (
              <p className="panel-alerta">
                Datos desactualizados: el brief lleva más de {HORAS_FRESCURA} h sin comprobarse.
              </p>
            )}
            {b ? (
              <dl>
                <dt>Comprobado</dt>
                <dd>{fechaHora(b.comprobado_en || b.generado_en)}</dd>
                <dt>Contenido generado</dt>
                <dd>{fechaHora(b.generado_en)}</dd>
              </dl>
            ) : <p className="panel-nota">No se pudo cargar el último brief.</p>}

            <h3>Estado</h3>
            {b && (
              <>
                {b.modo === 'degradado' && (
                  <p className="panel-alerta">
                    El modelo falló en la última pasada: la selección va por fecha, sin criterio editorial.
                  </p>
                )}
                {conFallos ? (
                  <ul className="pasadas">
                    {pasadas.map((p, n) => (
                      <li key={n}>
                        <span className="pasada-hora">{fechaHora(p.hora)}</span>
                        <span className={p.modo === 'degradado' ? 'mal' : 'bien'}>modo {p.modo}</span>
                        <span>{p.fallidas.length ? `Fuentes con fallo: ${p.fallidas.join(', ')}` : 'Sin fuentes con fallo'}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="panel-ok">Todo correcto</p>}
              </>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function Tabs({ pestana, ir, inerte }) {
  return (
    <nav className="tabs" aria-label="Secciones" inert={inerte}>
      <div className="tabs-in">
        {['archivo', 'hoy', 'guardados'].map((n) => (
          <button key={n} type="button" className={`tab${n === 'hoy' ? ' centro' : ''}`}
            aria-current={pestana === n ? 'page' : undefined}
            onClick={() => ir(n)}>
            {n}
          </button>
        ))}
      </div>
    </nav>
  )
}

export default function App() {
  const [pestana, setPestana] = useState('hoy')
  const [dia, setDia] = useState('latest')
  const [intento, setIntento] = useState(0)
  const [carga, setCarga] = useState({ clave: null })
  const [activos, setActivos] = useState(new Set())
  const [verResto, setVerResto] = useState(false)
  const [abierto, setAbierto] = useState(null)
  const [guardados, setGuardados] = useState(() => idsGuardados())
  const [aviso, setAviso] = useState('')
  const [ajustes, setAjustes] = useState(false)
  const [filtro, setFiltro] = useState(false)
  const botonFiltro = useRef(null)
  const [bienvenida, setBienvenida] = useState(() => tocaBienvenida())
  const finBienvenida = useCallback(() => setBienvenida(false), [])
  const engranaje = useRef(null)
  // Campos de latest.json que forman la huella de novedades. Se recuerdan al
  // cambiar de vista para que el engranaje avise tambien desde archivo o guardados.
  const [ultimo, setUltimo] = useState(null)
  const [vistaAjustes, setVistaAjustes] = useState(() => huellaVista())

  // Cada carga se identifica por dia + intento. Una respuesta que llega tarde
  // (se cambio de dia mientras tanto) se descarta, y al cambiar de dia o
  // reintentar el error anterior deja de aplicar sin tener que borrarlo.
  const clave = `${dia}|${intento}`
  useEffect(() => {
    let vigente = true
    const k = `${dia}|${intento}`
    cargarBrief(dia)
      .then((brief) => {
        if (!vigente) return
        setCarga({ clave: k, brief, error: null })
        if (dia === 'latest') {
          const pasadas = pasadasDe(brief)
          const u = {
            generado: brief.generado_en,
            comprobado: brief.comprobado_en || brief.generado_en,
            modo: pasadas[pasadas.length - 1].modo,
          }
          setUltimo(u)
          // Primera apertura, sin nada guardado: la huella actual cuenta como vista.
          // Si no se puede guardar, no habra punto.
          if (huellaVista() === null) setVistaAjustes(marcarVista(huellaDe(u)) ? huellaDe(u) : undefined)
        }
      })
      .catch((e) => { if (vigente) setCarga({ clave: k, brief: null, error: e.message }) })
    return () => { vigente = false }
  }, [dia, intento])
  const actual = carga.clave === clave ? carga : null
  const brief = actual?.brief
  const error = actual?.error

  useEffect(() => escucharCambios(() => setGuardados(idsGuardados())), [])

  // ---------- aviso discreto ----------
  const temporizador = useRef(null)
  const avisar = (msg) => {
    clearTimeout(temporizador.current)
    setAviso(msg)
    temporizador.current = setTimeout(() => setAviso(''), 4000)
  }
  useEffect(() => () => clearTimeout(temporizador.current), [])

  // ---------- guardar ----------
  const enCurso = useRef(new Set())
  const guardar = async (it, texto = '') => {
    if (enCurso.current.has(it.id)) return
    enCurso.current.add(it.id)
    try {
      let t = texto
      // Desde la lista no hay texto a mano: si el articulo lo tiene, se descarga para leerlo offline.
      if (!t && !guardados.has(it.id) && it.texto_disponible) {
        t = await cargarTexto(it.id).catch(() => '')
      }
      const r = alternar(it, t)
      setGuardados(idsGuardados())
      if (!r.ok) avisar(r.guardado ? 'no se pudo quitar de guardados' : 'no se pudo guardar: almacenamiento lleno o bloqueado')
      else if (r.sinTexto) avisar('guardado sin el texto: no queda espacio')
    } finally {
      enCurso.current.delete(it.id)
    }
  }

  // ---------- historial: el gesto de atras navega dentro de la app ----------
  // Las capas (ajustes, filtro) se apilan sobre la vista: 'ajustes>hoy:latest'.
  const base = abierto ? `articulo:${abierto.id}` : `${pestana}:${dia}`
  const vista = ajustes ? `ajustes>${base}` : filtro ? `filtro>${base}` : base
  const primera = useRef(true)

  useEffect(() => {
    if (primera.current) {
      history.replaceState({ vista }, '')
      primera.current = false
      return
    }
    if (history.state?.vista !== vista) history.pushState({ vista }, '')
  }, [vista])

  const ultimoAbierto = useRef(null)
  useEffect(() => { if (abierto) ultimoAbierto.current = abierto }, [abierto])

  useEffect(() => {
    const atras = (e) => {
      let v = e.state?.vista || 'hoy:latest'
      const conAjustes = v.startsWith('ajustes>')
      if (conAjustes) v = v.slice('ajustes>'.length)
      setAjustes(conAjustes)
      const conFiltro = v.startsWith('filtro>')
      if (conFiltro) v = v.slice('filtro>'.length)
      setFiltro(conFiltro)
      if (v.startsWith('articulo:')) {
        const it = ultimoAbierto.current
        setAbierto(it && `articulo:${it.id}` === v ? it : null)
        return
      }
      const [p, d] = v.split(':')
      setAbierto(null)
      setPestana(p)
      setDia(d)
    }
    window.addEventListener('popstate', atras)
    return () => window.removeEventListener('popstate', atras)
  }, [])

  // ---------- scroll y foco entre lista y lector ----------
  const retorno = useRef(null)
  const abrir = (it) => {
    retorno.current = { vista: `${pestana}:${dia}`, y: window.scrollY, id: it.id }
    setAbierto(it)
  }

  useLayoutEffect(() => {
    if (abierto) {
      window.scrollTo(0, 0)
      return
    }
    const r = retorno.current
    retorno.current = null
    // Solo se restaura si se vuelve a la misma lista desde la que se abrio.
    if (!r || r.vista !== `${pestana}:${dia}`) return
    window.scrollTo(0, r.y)
    document.querySelector(`[data-item="${CSS.escape(r.id)}"]`)?.focus({ preventScroll: true })
  }, [abierto, pestana, dia])

  // ---------- capa de ajustes ----------
  // Cerrar equivale a ir atras, para no apilar entradas en el historial.
  const cerrarAjustes = () => {
    if (history.state?.vista?.startsWith('ajustes>')) history.back()
    else setAjustes(false)
  }
  // Al cerrarse, por cualquier via, el foco vuelve al engranaje.
  const ajustesAntes = useRef(false)
  useEffect(() => {
    if (ajustesAntes.current && !ajustes) engranaje.current?.focus({ preventScroll: true })
    ajustesAntes.current = ajustes
  }, [ajustes])

  // ---------- novedades en ajustes ----------
  const huella = ultimo ? huellaDe(ultimo) : null
  const novedades = huella !== null && typeof vistaAjustes === 'string' && vistaAjustes !== huella

  // Abrir la capa marca como vista la huella actual y quita el punto.
  const abrirAjustes = () => {
    if (huella !== null && vistaAjustes !== undefined) {
      setVistaAjustes(marcarVista(huella) ? huella : undefined)
    }
    setAjustes(true)
  }

  // ---------- navegacion ----------
  const ir = (n) => {
    setAbierto(null)
    setPestana(n)
    if (n !== 'guardados') setDia('latest')
  }

  // ---------- rueda de filtro ----------
  // Igual que ajustes: cerrar es ir atras, y fuera de Aceptar se descartan los cambios.
  const cerrarFiltro = () => {
    if (history.state?.vista?.startsWith('filtro>')) history.back()
    else setFiltro(false)
  }
  const aplicarFiltro = (s) => {
    setActivos(new Set(s))
    setVerResto(false)
    cerrarFiltro()
  }
  const filtroAntes = useRef(false)
  useEffect(() => {
    if (filtroAntes.current && !filtro) botonFiltro.current?.focus({ preventScroll: true })
    filtroAntes.current = filtro
  }, [filtro])

  let contenido

  if (abierto) {
    contenido = <Lector it={abierto} volver={() => setAbierto(null)} onGuardar={guardar} guardado={guardados.has(abierto.id)} />
  } else if (pestana === 'guardados') {
    contenido = <Guardados abrir={abrir} quitar={guardar} ids={guardados} />
  } else if (pestana === 'archivo' && dia === 'latest') {
    contenido = <Archivo abrirDia={setDia} />
  } else if (error) {
    contenido = (
      <div className="vacio">
        no se pudo cargar el brief<br />{error}<br />
        <button type="button" className="reintentar" onClick={() => setIntento((n) => n + 1)}>reintentar</button>
      </div>
    )
  } else if (!brief) {
    contenido = <div className="vacio">cargando…</div>
  } else {
    contenido = (
      <Brief brief={brief} dia={dia} activos={activos} abrirFiltro={() => setFiltro(true)}
        botonFiltro={botonFiltro} filtroAbierto={filtro}
        verResto={verResto} mostrarResto={() => setVerResto(true)}
        abrir={abrir} guardados={guardados} guardar={guardar} />
    )
  }

  // Con la bienvenida o la capa abiertas, el resto no recibe foco ni clics.
  const tapado = bienvenida || ajustes || filtro

  return (
    <>
      <main className="wrap" inert={tapado}>
        {!abierto && (
          <header className="bar">
            <span className="nombre-app">Brief Paid Media</span>
            <button ref={engranaje} type="button" className="icono"
              aria-label={novedades ? 'Ajustes, hay novedades' : 'Ajustes'}
              aria-haspopup="dialog" aria-expanded={ajustes} onClick={abrirAjustes}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{ENGRANAJE}</svg>
              {novedades && <span className="punto-aviso" aria-hidden="true" />}
            </button>
          </header>
        )}
        {contenido}
      </main>
      <Tabs pestana={pestana} ir={ir} inerte={tapado} />
      <div className="toast" role="status" aria-live="polite">{aviso}</div>
      {ajustes && <Ajustes cerrar={cerrarAjustes} />}
      {filtro && <RuedaFiltro inicial={activos} aplicar={aplicarFiltro} cerrar={cerrarFiltro} />}
      {bienvenida && (
        <Bienvenida fin={finBienvenida}
          destacados={dia === 'latest' && brief ? brief.destacados : undefined} />
      )}
    </>
  )
}
