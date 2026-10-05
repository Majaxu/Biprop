/**
 * Biprop · Bitácora de propiedades · Juárez Beltrán
 * Backend en Google Apps Script + Google Sheets + Google Drive.
 *
 * Qué hace: archiva fotos y videos de las propiedades, ordenados por evento
 * (ingreso, reclamo, reparación, etc.), con fecha, notas y quién lo cargó.
 *
 * Cómo se publica: como aplicación web, "Ejecutar como: yo" (mantenimiento@)
 * y acceso para cualquier usuario del dominio. Ver DEPLOY.md.
 *
 * Seguridad: los permisos se deciden SIEMPRE acá, en el servidor, con el email
 * real de Google (Session.getActiveUser()). La pantalla solo oculta botones.
 *
 * Nada se carga solo: una persona decide qué sube, de qué propiedad y con qué
 * fecha. No se leen mails ni WhatsApp, no hay integración con otros sistemas.
 */

/* ================================================================== */
/* CONFIGURACIÓN · completar antes de publicar (ver DEPLOY.md)         */
/* ================================================================== */

const SHEET_ID        = 'PEGAR_AQUI_EL_ID_DE_LA_PLANILLA';
const ROOT_FOLDER_ID  = 'PEGAR_AQUI_EL_ID_DE_LA_CARPETA_HISTORIAL';
const TEMPLATE_DOC_ID = 'PEGAR_AQUI_EL_ID_DE_LA_PLANTILLA';

const DOMINIO = 'juarezbeltran.com.ar';

/**
 * PERMISOS (regla de negocio).
 *  - Cualquier usuario del dominio: ve todo, crea propiedades y carga eventos.
 *  - ADMINS: además modifican eventos y propiedades (incluye renumerar) y
 *    generan el informe para el propietario.
 *  - BORRAN: además borran eventos y propiedades, y restauran de la papelera.
 *  - Quien carga un evento NO puede editarlo después: le pide a un admin.
 */
const OWNER  = 'mantenimiento@juarezbeltran.com.ar';
const ADMINS = [
  'mantenimiento@juarezbeltran.com.ar',
  'mjuarez@juarezbeltran.com.ar',
  'tjuarez_h@juarezbeltran.com.ar',
  'marketing@juarezbeltran.com.ar'
];
const BORRAN = [
  'mjuarez@juarezbeltran.com.ar',
  'tjuarez_h@juarezbeltran.com.ar'
];

/**
 * TIPOS DE EVENTO. Para agregar uno, sumá una línea acá.
 * "valor" va a la planilla y a los nombres de carpeta: mayúsculas, sin espacios ni tildes.
 */
const TIPOS = [
  { valor: 'INGRESO',    etiqueta: 'Ingreso' },
  { valor: 'EGRESO',     etiqueta: 'Egreso' },
  { valor: 'RECLAMO',    etiqueta: 'Reclamo' },
  { valor: 'REPARACION', etiqueta: 'Reparación' },
  { valor: 'INSPECCION', etiqueta: 'Inspección' },
  { valor: 'MKT',        etiqueta: 'Comercial' },
  { valor: 'OBRA',       etiqueta: 'Obra' },
  { valor: 'SINIESTRO',  etiqueta: 'Siniestro' }
];

/** Quién produjo el material. */
const ORIGENES = ['inquilino', 'propietario', 'proveedor', 'JB'];

/**
 * REGLAS DE ID (regla de negocio).
 *  - 1 a 4999: propiedades que ya existen en Mirol. Se escribe a mano.
 *  - 5000 en adelante: propiedades nuevas. La app propone el siguiente libre.
 *  - En Drive y en pantalla el ID se muestra siempre con 4 cifras (57 -> 0057).
 */
const ID_MIROL_MAX    = 4999;
const ID_NUEVAS_DESDE = 5000;
const ID_MAX          = 9999;

/**
 * LÍMITE DE TAMAÑO POR ARCHIVO (regla técnica).
 * Cada archivo viaja del navegador a Apps Script en un solo envío, y Apps Script
 * no aguanta envíos muy grandes (Google no publica el máximo exacto). 30 MB es
 * un valor prudente; no conviene pasar de 35. Si los archivos cercanos al
 * límite fallan seguido, bajalo a 25.
 */
const MAX_ARCHIVO_MB = 30;

const DESCRIPCION_MAX = 80;   // caracteres de la descripción del evento
const SLUG_MAX        = 40;   // caracteres de la descripción dentro del nombre de carpeta
const NOTAS_MAX       = 5000;
const HORAS_DE_CARGA  = 2;    // cuánto tiempo tiene quien creó un evento para terminar de subir sus archivos

/** Informe para el propietario. */
const INFORME_AVISO_FOTOS = 150;   // desde cuántas fotos se avisa que va a ser pesado
const INFORME_ANCHO_PX    = 1000;  // ancho de las fotos dentro del Word (los originales no se tocan)
const INFORME_TOPE_SEGUNDOS = 270; // si armar el informe pasa de este tiempo, se frena y se avisa

/** Respaldo diario de la planilla. */
const BACKUP_FOLDER = 'Historial Multimedia · Respaldos';
const BACKUP_KEEP   = 30;

const APP_NOMBRE  = 'Biprop';
const TZ          = 'America/Argentina/Cordoba';
const FAVICON_URL = 'https://majaxu.github.io/Biprop/favicon-32.png';

const CARPETA_PAPELERA = '_Papelera';
const CARPETA_INFORMES = '_Informes';
const ARCHIVO_JSON     = 'evento.json';

/* ================================================================== */
/* Planilla: hojas y columnas                                          */
/* ================================================================== */

const COLUMNAS = {
  // borrado_por y fecha_borrado son para la vista Papelera.
  Propiedades: ['id', 'direccion', 'id_anterior', 'fecha_alta', 'creado_por', 'estado',
                'carpeta_url', 'borrado_por', 'fecha_borrado'],
  // estado: "activo" o "papelera" (los eventos de una propiedad borrada quedan ocultos).
  Eventos: ['id_evento', 'fecha_carga', 'id_propiedad', 'direccion', 'tipo', 'fecha_evento',
            'descripcion', 'origen', 'notas', 'visible_propietario', 'reclamo_vinculado',
            'cargado_por', 'carpeta_url', 'cantidad_archivos', 'modificado_por',
            'fecha_modificacion', 'estado'],
  Log: ['fecha', 'usuario', 'accion', 'id_afectado', 'detalle']
};

const COLS_ID       = ['id', 'id_anterior', 'id_propiedad'];
const COLS_MOMENTO  = ['fecha_alta', 'fecha_carga', 'fecha_modificacion', 'fecha_borrado', 'fecha'];
const COLS_NUMERO   = ['cantidad_archivos'];

/** Formato de celda por columna. El texto va como "texto sin formato" para que Sheets no lo reinterprete. */
function formato_(col) {
  if (COLS_ID.indexOf(col) !== -1) return '0000';
  if (COLS_MOMENTO.indexOf(col) !== -1) return 'dd/mm/yyyy hh:mm:ss';
  if (COLS_NUMERO.indexOf(col) !== -1) return '0';
  return '@';
}

/* Memoria de la ejecución en curso (se pierde al terminar cada llamada). */
let LIBRO_ = null;
let HOJAS_ = {};
let CACHE_ = {};
let EN_BLOQUEO_ = false;

/* ================================================================== */
/* Servir la app                                                       */
/* ================================================================== */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP_NOMBRE + ' · Juárez Beltrán')
    .setFaviconUrl(FAVICON_URL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ================================================================== */
/* Identidad y permisos                                                */
/* ================================================================== */

/** Email real de quien está usando la app. Rechaza todo lo que no sea del dominio. */
function emailActual_() {
  const e = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!e) throw new Error('No pudimos identificar tu cuenta de Google. Entrá con tu cuenta de Juárez Beltrán.');
  if (e.slice(-(DOMINIO.length + 1)) !== '@' + DOMINIO) {
    throw new Error('Esta aplicación es solo para cuentas de Juárez Beltrán.');
  }
  return e;
}
function enLista_(lista, email) {
  return lista.map(x => String(x).toLowerCase()).indexOf(email) !== -1;
}
function esAdmin_(email)     { return email === OWNER.toLowerCase() || enLista_(ADMINS, email); }
function puedeBorrar_(email) { return enLista_(BORRAN, email); }
function exigirAdmin_(email) {
  if (!esAdmin_(email)) throw new Error('Esto solo lo puede hacer un administrador. Pedile a mantenimiento que lo haga.');
}
function exigirBorrar_(email) {
  if (!puedeBorrar_(email)) throw new Error('No tenés permiso para borrar ni restaurar. Pedíselo a un responsable.');
}

/* ================================================================== */
/* Utilidades                                                          */
/* ================================================================== */

function pad4_(n) { return ('0000' + Number(n)).slice(-4); }
function pad3_(n) { n = Number(n); return n > 999 ? String(n) : ('000' + n).slice(-3); }

function hoy_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

/** "2026-03-15" -> "15/03/2026" */
function fechaAr_(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(ymd || '');
}

function esFechaValida_(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Días entre dos fechas "AAAA-MM-DD". */
function diasEntre_(desde, hasta) {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(desde), b = /^(\d{4})-(\d{2})-(\d{2})/.exec(hasta);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86400000);
}

/** Valida un ID de propiedad y lo devuelve como número. */
function idValido_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim();
  const n = Number(s);
  if (!/^\d{1,4}$/.test(s) || n < 1 || n > ID_MAX) {
    throw new Error('El ID de la propiedad tiene que ser un número entre 1 y ' + ID_MAX + '.');
  }
  return n;
}

/** Limpia un texto que viene de la pantalla. */
function texto_(v, max) {
  let s = String(v === null || v === undefined ? '' : v).replace(/\r\n?/g, '\n').trim();
  s = s.replace(/^=+/, '').trim();   // para que Sheets no lo tome como fórmula
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}

function tipo_(valor) { return TIPOS.filter(t => t.valor === valor)[0] || null; }
function etiquetaTipo_(valor) { const t = tipo_(valor); return t ? t.etiqueta : valor; }

/**
 * SLUG DE CARPETA (regla de negocio): la descripción pasa al nombre de la
 * carpeta sin tildes, con guiones en lugar de espacios, sin caracteres
 * especiales y con un máximo de SLUG_MAX caracteres.
 * "Humedad baño" -> "Humedad-bano"
 */
function slug_(texto) {
  let s = String(texto || '').normalize('NFD').replace(/[\u0300-\u036F]/g, '');
  s = s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  s = s.slice(0, SLUG_MAX).replace(/-+$/g, '');
  return s || 'evento';
}

function nombreBaseCarpeta_(fecha, tipo, descripcion) {
  return fecha + '_' + tipo + '_' + slug_(descripcion);
}

/**
 * Pasa un listado de Drive (archivos o carpetas) a una lista común, dejando
 * afuera lo que esté en la papelera de Drive.
 */
function vivos_(it) {
  const lista = [];
  while (it.hasNext()) {
    const x = it.next();
    if (!x.isTrashed()) lista.push(x);
  }
  return lista;
}

/** Si ya existe una carpeta con ese nombre, agrega _2, _3... */
function nombreCarpetaLibre_(padre, base, idAExcluir) {
  let nombre = base, n = 1;
  while (vivos_(padre.getFoldersByName(nombre)).some(c => c.getId() !== idAExcluir)) {
    n++; nombre = base + '_' + n;
  }
  return nombre;
}

function idDeUrl_(url) {
  const m = /folders\/([-\w]+)/.exec(String(url || '')) || /[?&]id=([-\w]+)/.exec(String(url || ''));
  return m ? m[1] : '';
}

function extension_(nombreOriginal, mime) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(nombreOriginal || ''));
  if (m) return m[1].toLowerCase();
  const porMime = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif',
    'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/quicktime': 'mov',
    'video/webm': 'webm', 'video/3gpp': '3gp'
  };
  return porMime[String(mime || '').toLowerCase()] || 'bin';
}

function mimePorExtension_(ext) {
  const tabla = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif',
    webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime',
    webm: 'video/webm', '3gp': 'video/3gpp', m4v: 'video/x-m4v', avi: 'video/x-msvideo', mkv: 'video/x-matroska'
  };
  return tabla[ext] || '';
}

function esImagen_(mime) { return String(mime || '').indexOf('image/') === 0; }
function esVideo_(mime)  { return String(mime || '').indexOf('video/') === 0; }

/** Ejecuta fn con el candado del script, para que dos personas no se pisen al guardar. */
function conBloqueo_(fn) {
  if (EN_BLOQUEO_) return fn();
  const lock = LockService.getScriptLock();
  try { lock.waitLock(30000); }
  catch (e) { throw new Error('Hay varias personas guardando al mismo tiempo. Esperá unos segundos y probá de nuevo.'); }
  EN_BLOQUEO_ = true;
  CACHE_ = {};   // con el candado tomado, se vuelve a leer la planilla para trabajar con datos frescos
  try { return fn(); }
  finally {
    EN_BLOQUEO_ = false;
    try { SpreadsheetApp.flush(); } catch (e) {}
    lock.releaseLock();
  }
}

/* ================================================================== */
/* Acceso a la planilla                                                */
/* ================================================================== */

function libro_() {
  if (!LIBRO_) {
    try { LIBRO_ = SpreadsheetApp.openById(SHEET_ID); }
    catch (e) { throw new Error('No se pudo abrir la planilla de datos. Avisale a mantenimiento.'); }
  }
  return LIBRO_;
}

/** Devuelve la hoja; si no existe la crea con sus encabezados (igual que Pipeline ACM con "Leads"). */
function hoja_(nombre) {
  if (HOJAS_[nombre]) return HOJAS_[nombre];
  const cols = COLUMNAS[nombre];
  let sh = libro_().getSheetByName(nombre);
  if (!sh) sh = libro_().insertSheet(nombre);

  const ancho = sh.getLastColumn();
  const actuales = ancho ? sh.getRange(1, 1, 1, ancho).getValues()[0].map(String) : [];
  const coincide = cols.every((c, i) => actuales[i] === c);
  if (!coincide) {
    // Solo se escriben encabezados si la hoja está vacía o le faltan columnas al final.
    const esPrefijo = actuales.every((c, i) => c === '' || c === cols[i]);
    if (!esPrefijo) {
      throw new Error('La hoja "' + nombre + '" de la planilla tiene las columnas cambiadas. Avisale a mantenimiento.');
    }
    sh.getRange(1, 1, 1, cols.length).setNumberFormat('@').setValues([cols]);
    sh.setFrozenRows(1);
  }
  HOJAS_[nombre] = sh;
  return sh;
}

/** Pasa el valor de una celda a algo cómodo de usar (y que se pueda mandar a la pantalla). */
function deCelda_(col, v) {
  if (COLS_ID.indexOf(col) !== -1) return (v === '' || v === null) ? '' : Number(v);
  if (COLS_NUMERO.indexOf(col) !== -1) return Number(v) || 0;
  if (COLS_MOMENTO.indexOf(col) !== -1) {
    return (v instanceof Date) ? Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss") : String(v || '');
  }
  if (col === 'fecha_evento') {
    return (v instanceof Date) ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v || '').trim();
  }
  if (col === 'visible_propietario') {
    const s = String(v).toLowerCase().trim();
    return s === 'sí' || s === 'si' || s === 'true' || s === '1';
  }
  return String(v === null || v === undefined ? '' : v);
}

/** Pasa un valor a lo que se escribe en la celda. */
function aCelda_(col, v) {
  if (v === null || v === undefined) v = '';
  if (COLS_ID.indexOf(col) !== -1) return v === '' ? '' : Number(v);
  if (COLS_NUMERO.indexOf(col) !== -1) return Number(v) || 0;
  if (COLS_MOMENTO.indexOf(col) !== -1) return v;   // Date o vacío
  if (col === 'visible_propietario') return v ? 'sí' : 'no';
  return String(v);
}

/** Lee una hoja completa como lista de objetos. Cada uno trae _fila (número de fila en la planilla). */
function leer_(nombre) {
  if (CACHE_[nombre]) return CACHE_[nombre];
  const sh = hoja_(nombre), cols = COLUMNAS[nombre];
  const ultima = sh.getLastRow();
  let filas = [];
  if (ultima >= 2) {
    filas = sh.getRange(2, 1, ultima - 1, cols.length).getValues().map((celdas, i) => {
      const o = { _fila: i + 2 };
      cols.forEach((c, j) => { o[c] = deCelda_(c, celdas[j]); });
      return o;
    });
  }
  CACHE_[nombre] = filas;
  return filas;
}

function agregar_(nombre, obj) {
  const sh = hoja_(nombre), cols = COLUMNAS[nombre];
  const fila = sh.getLastRow() + 1;
  if (fila > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 200);
  const rango = sh.getRange(fila, 1, 1, cols.length);
  rango.setNumberFormats([cols.map(formato_)]);
  rango.setValues([cols.map(c => aCelda_(c, obj[c]))]);
  delete CACHE_[nombre];
  return fila;
}

function actualizar_(nombre, fila, cambios) {
  const sh = hoja_(nombre), cols = COLUMNAS[nombre];
  const rango = sh.getRange(fila, 1, 1, cols.length);
  const valores = rango.getValues()[0];
  cols.forEach((c, j) => {
    if (Object.prototype.hasOwnProperty.call(cambios, c)) valores[j] = aCelda_(c, cambios[c]);
  });
  rango.setNumberFormats([cols.map(formato_)]);
  rango.setValues([valores]);
  delete CACHE_[nombre];
}

/**
 * Cambia el valor de UNA columna en varias filas con una sola escritura.
 * Se usa cuando hay que tocar todos los eventos de una propiedad (renumerar,
 * borrar, restaurar): o cambian todos o no cambia ninguno.
 */
function actualizarColumna_(nombre, col, filas, valor) {
  if (!filas.length) return;
  const sh = hoja_(nombre), c = COLUMNAS[nombre].indexOf(col) + 1;
  const ultima = sh.getLastRow();
  if (ultima < 2) return;
  const rango = sh.getRange(2, c, ultima - 1, 1);
  const valores = rango.getValues();
  filas.forEach(f => { valores[f - 2][0] = aCelda_(col, valor); });
  rango.setNumberFormat(formato_(col));
  rango.setValues(valores);
  delete CACHE_[nombre];
}

function borrarFila_(nombre, fila) {
  hoja_(nombre).deleteRow(fila);
  delete CACHE_[nombre];
}

/** Asiento en la hoja Log: toda modificación o borrado queda registrado. */
function log_(email, accion, idAfectado, detalle) {
  agregar_('Log', {
    fecha: new Date(), usuario: email, accion: accion,
    id_afectado: String(idAfectado), detalle: texto_(detalle, 500)
  });
}

/* ================================================================== */
/* Consultas sobre propiedades y eventos                               */
/* ================================================================== */

function propiedadActiva_(id) {
  return leer_('Propiedades').filter(p => p.id === id && p.estado === 'activa')[0] || null;
}

function eventosActivos_() {
  return leer_('Eventos').filter(e => e.estado !== 'papelera');
}

function eventosDe_(idPropiedad) {
  return eventosActivos_().filter(e => e.id_propiedad === idPropiedad);
}

function eventoActivo_(idEvento) {
  const ev = eventosActivos_().filter(e => e.id_evento === String(idEvento))[0];
  if (!ev) throw new Error('No encontramos ese evento. Puede que lo hayan borrado.');
  return ev;
}

/** Copia de un objeto de la planilla sin el dato interno _fila, lista para mandar a la pantalla. */
function limpio_(o) {
  const c = {};
  Object.keys(o).forEach(k => { if (k !== '_fila') c[k] = o[k]; });
  return c;
}

/**
 * Siguiente ID libre para propiedades nuevas (regla de negocio):
 * el máximo existente desde 5000 + 1, o 5000 si todavía no hay ninguna.
 * Se cuentan también las que están en la papelera, para no pisarlas si se restauran.
 */
function siguienteIdLibre_() {
  let max = ID_NUEVAS_DESDE - 1;
  leer_('Propiedades').forEach(p => { if (p.id >= ID_NUEVAS_DESDE && p.id > max) max = p.id; });
  return max + 1;
}

/** Identificador único de evento (E-000123). Nunca se reutiliza, aunque se borren eventos. */
function siguienteIdEvento_() {
  const props = PropertiesService.getScriptProperties();
  let n = Number(props.getProperty('ULTIMO_EVENTO')) || 0;
  leer_('Eventos').forEach(e => {
    const m = /^E-(\d+)$/.exec(e.id_evento);
    if (m && Number(m[1]) > n) n = Number(m[1]);
  });
  n++;
  props.setProperty('ULTIMO_EVENTO', String(n));
  return 'E-' + ('000000' + n).slice(-6);
}

/* ================================================================== */
/* Drive                                                               */
/* ================================================================== */

function raiz_() {
  try { return DriveApp.getFolderById(ROOT_FOLDER_ID); }
  catch (e) { throw new Error('No se pudo abrir la carpeta Historial en Drive. Avisale a mantenimiento.'); }
}

function subcarpeta_(padre, nombre) {
  const existentes = vivos_(padre.getFoldersByName(nombre));
  return existentes.length ? existentes[0] : padre.createFolder(nombre);
}

function carpetaDe_(url) {
  const id = idDeUrl_(url);
  if (!id) throw new Error('Falta el link a la carpeta de Drive.');
  return DriveApp.getFolderById(id);
}

/** Archivos reales de una carpeta de evento (sin evento.json), ordenados por nombre. */
function listarArchivos_(carpeta) {
  const lista = [];
  vivos_(carpeta.getFiles()).forEach(f => {
    const nombre = f.getName();
    if (nombre === ARCHIVO_JSON) return;
    lista.push({ id: f.getId(), nombre: nombre, mime: f.getMimeType(), tamano: f.getSize() });
  });
  lista.sort((a, b) => a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0);
  return lista;
}

function leerJson_(carpeta) {
  const json = vivos_(carpeta.getFilesByName(ARCHIVO_JSON));
  if (!json.length) return null;
  try { return JSON.parse(json[0].getBlob().getDataAsString()); }
  catch (e) { return null; }
}

/**
 * Reescribe evento.json: copia de todos los campos del evento más la lista de
 * archivos (nombre nuevo, nombre original, tamaño, tipo). Es el respaldo por si
 * la planilla se pierde. Devuelve la lista de archivos reales de la carpeta.
 */
function reconstruirJson_(ev, carpeta) {
  const archivos = listarArchivos_(carpeta);
  const previo = leerJson_(carpeta);
  const originales = {};
  ((previo && previo.archivos) || []).forEach(a => {
    if (a.id) originales[a.id] = a.nombre_original || '';
  });
  archivos.forEach(a => {
    if (Object.prototype.hasOwnProperty.call(originales, a.id)) {
      a.nombre_original = originales[a.id];
    } else {
      // Archivo que no estaba en evento.json: o es recién subido por la app (el
      // nombre original quedó en su descripción) o lo subieron a mano a Drive.
      let desc = '';
      try { desc = DriveApp.getFileById(a.id).getDescription() || ''; } catch (e) {}
      const m = /^Nombre original: (.*?) · subido por /.exec(desc);
      a.nombre_original = m ? m[1] : a.nombre;
    }
  });

  const datos = limpio_(ev);
  datos.id_propiedad_carpeta = pad4_(ev.id_propiedad);
  datos.tipo_etiqueta = etiquetaTipo_(ev.tipo);
  datos.cantidad_archivos = archivos.length;
  datos.archivos = archivos.map(a => ({
    nombre: a.nombre, nombre_original: a.nombre_original, tamano: a.tamano, mime: a.mime, id: a.id
  }));
  datos.json_actualizado = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss");

  const contenido = JSON.stringify(datos, null, 2);
  const json = vivos_(carpeta.getFilesByName(ARCHIVO_JSON));
  if (json.length) json[0].setContent(contenido);
  else carpeta.createFile(ARCHIVO_JSON, contenido, 'application/json');
  return archivos;
}

/**
 * Renombra los archivos de un evento al prefijo que corresponde
 * (ID_AAAA-MM-DD_TIPO_NNN.ext). Solo toca los que tienen el formato de la app;
 * los subidos a mano con otro nombre quedan como están. El contenido no se modifica.
 */
function renombrarArchivos_(carpeta, prefijoNuevo) {
  vivos_(carpeta.getFiles()).forEach(f => {
    const m = /^\d{4}_\d{4}-\d{2}-\d{2}_[A-Z0-9]+_(\d{3,}\.[a-z0-9]+)$/.exec(f.getName());
    if (m && f.getName() !== prefijoNuevo + m[1]) f.setName(prefijoNuevo + m[1]);
  });
}

function prefijoArchivos_(ev) {
  return pad4_(ev.id_propiedad) + '_' + ev.fecha_evento + '_' + ev.tipo + '_';
}

/* ================================================================== */
/* API · arranque                                                      */
/* ================================================================== */

/** Datos iniciales: quién soy, qué puedo hacer, lista de propiedades y últimos eventos. */
function getInicio() {
  const email = emailActual_();
  const propiedades = leer_('Propiedades').filter(p => p.estado === 'activa');
  const ultimos = eventosActivos_()
    .sort((a, b) => a.fecha_carga !== b.fecha_carga ? (a.fecha_carga < b.fecha_carga ? 1 : -1)
      : (a.id_evento < b.id_evento ? 1 : -1))
    .slice(0, 30)
    .map(limpio_);
  return {
    email: email,
    esAdmin: esAdmin_(email),
    puedeBorrar: puedeBorrar_(email),
    config: {
      app: APP_NOMBRE, tipos: TIPOS, origenes: ORIGENES, maxMb: MAX_ARCHIVO_MB,
      descMax: DESCRIPCION_MAX, avisoFotos: INFORME_AVISO_FOTOS,
      idNuevasDesde: ID_NUEVAS_DESDE, idMax: ID_MAX
    },
    propiedades: propiedades.map(p => ({ id: p.id, direccion: p.direccion })),
    ultimos: ultimos,
    siguienteId: siguienteIdLibre_(),
    hoy: hoy_()
  };
}

/* ================================================================== */
/* API · propiedades                                                   */
/* ================================================================== */

/** Crea la propiedad (fila + carpeta en Drive). Se llama con el candado tomado. */
function crearPropiedad_(id, direccion, email) {
  if (id > ID_MAX) throw new Error('Ya no quedan números de propiedad libres. Avisale a mantenimiento.');
  const carpeta = raiz_().createFolder(pad4_(id));   // carpeta de propiedad: nombre = ID con 4 cifras
  const prop = {
    id: id, direccion: direccion, id_anterior: '', fecha_alta: new Date(), creado_por: email,
    estado: 'activa', carpeta_url: carpeta.getUrl(), borrado_por: '', fecha_borrado: ''
  };
  agregar_('Propiedades', prop);
  return propiedadActiva_(id);
}

/** Historial completo de una propiedad, con los archivos reales de cada carpeta de evento. */
function getHistorial(id) {
  emailActual_();
  id = idValido_(id);
  const prop = propiedadActiva_(id);
  if (!prop) throw new Error('No encontramos la propiedad ' + pad4_(id) + '.');

  // Orden cronológico inverso: fecha del evento, después fecha de carga, después número de evento.
  const eventos = eventosDe_(id).sort((a, b) => {
    if (a.fecha_evento !== b.fecha_evento) return a.fecha_evento < b.fecha_evento ? 1 : -1;
    if (a.fecha_carga !== b.fecha_carga) return a.fecha_carga < b.fecha_carga ? 1 : -1;
    return a.id_evento < b.id_evento ? 1 : -1;
  });

  // Se listan los archivos REALES de cada carpeta (no solo los de la planilla),
  // así los videos subidos a mano a Drive aparecen igual.
  const desfasados = [];
  const salida = eventos.map(ev => {
    const c = limpio_(ev);
    try {
      c.archivos = listarArchivos_(carpetaDe_(ev.carpeta_url));
      if (c.archivos.length !== ev.cantidad_archivos) desfasados.push(ev.id_evento);
      c.cantidad_archivos = c.archivos.length;
    } catch (e) {
      c.archivos = [];
      c.sin_carpeta = true;
    }
    return c;
  });

  // Si alguien agregó o sacó archivos a mano, se actualizan cantidad_archivos y evento.json.
  if (desfasados.length) {
    try {
      conBloqueo_(() => {
        desfasados.forEach(idEv => {
          const ev = eventosActivos_().filter(e => e.id_evento === idEv)[0];
          if (!ev) return;
          const archivos = reconstruirJson_(ev, carpetaDe_(ev.carpeta_url));
          actualizar_('Eventos', ev._fila, { cantidad_archivos: archivos.length });
        });
      });
    } catch (e) { /* si no se pudo, se reintenta la próxima vez que se abra el historial */ }
  }

  return { propiedad: limpio_(prop), eventos: salida };
}

/** Cambia la dirección de una propiedad. Solo ADMINS. */
function modificarPropiedad(id, direccion) {
  const email = emailActual_();
  exigirAdmin_(email);
  id = idValido_(id);
  direccion = texto_(direccion, 200);
  if (!direccion) throw new Error('Escribí la dirección de la propiedad.');

  return conBloqueo_(() => {
    const prop = propiedadActiva_(id);
    if (!prop) throw new Error('No encontramos la propiedad ' + pad4_(id) + '.');
    const anterior = prop.direccion;
    if (anterior === direccion) return { ok: true };
    // Primero la planilla (la dirección está copiada en cada evento), después los evento.json.
    actualizarColumna_('Eventos', 'direccion', eventosDe_(id).map(e => e._fila), direccion);
    actualizar_('Propiedades', prop._fila, { direccion: direccion });
    log_(email, 'modificar_propiedad', pad4_(id), 'Dirección: "' + anterior + '" -> "' + direccion + '"');
    eventosDe_(id).forEach(ev => {
      try { reconstruirJson_(ev, carpetaDe_(ev.carpeta_url)); } catch (e) {}
    });
    return { ok: true };
  });
}

/**
 * RENUMERACIÓN (regla de negocio). Una propiedad puede cambiar de ID después
 * (pasó a Mirol, error de carga). Solo ADMINS. Se valida que el nuevo ID esté
 * libre, se renombra la carpeta en Drive, se actualizan todas las filas de
 * Eventos, los evento.json y los nombres de archivo (el prefijo lleva el ID).
 * El ID anterior queda en la columna id_anterior.
 */
function renumerarPropiedad(id, nuevoId) {
  const email = emailActual_();
  exigirAdmin_(email);
  id = idValido_(id);
  nuevoId = idValido_(nuevoId);
  if (id === nuevoId) throw new Error('El número nuevo es igual al actual.');

  return conBloqueo_(() => {
    const prop = propiedadActiva_(id);
    if (!prop) throw new Error('No encontramos la propiedad ' + pad4_(id) + '.');
    const ocupada = propiedadActiva_(nuevoId);
    if (ocupada) {
      throw new Error('El ID ' + pad4_(nuevoId) + ' ya está usado por otra propiedad (' + ocupada.direccion + ').');
    }

    // 1) Primero la planilla, en dos escrituras: todos los eventos juntos y después la propiedad.
    //    Así, si el paso de Drive se corta por la mitad, los datos igual quedan bien.
    actualizarColumna_('Eventos', 'id_propiedad', eventosDe_(id).map(e => e._fila), nuevoId);
    actualizar_('Propiedades', prop._fila, { id: nuevoId, id_anterior: id });
    log_(email, 'renumerar_propiedad', pad4_(nuevoId), 'ID anterior: ' + pad4_(id));

    // 2) Después Drive: nombre de la carpeta, nombres de archivo y evento.json.
    aplicarNombres_(propiedadActiva_(nuevoId));
    return { ok: true, id: nuevoId };
  });
}

/**
 * Deja los nombres de Drive de una propiedad como dice la planilla: carpeta
 * con el ID de 4 cifras, archivos con el prefijo del ID y evento.json al día.
 * Se puede correr más de una vez sin problema.
 */
function aplicarNombres_(prop) {
  const carpetaProp = carpetaDe_(prop.carpeta_url);
  if (carpetaProp.getName() !== pad4_(prop.id)) carpetaProp.setName(pad4_(prop.id));
  eventosDe_(prop.id).forEach(ev => {
    try {
      const carpeta = carpetaDe_(ev.carpeta_url);
      renombrarArchivos_(carpeta, prefijoArchivos_(ev));
      reconstruirJson_(ev, carpeta);
    } catch (e) {}
  });
}

/**
 * BORRAR PROPIEDAD: va a la papelera y se puede recuperar. Solo BORRAN.
 * La fila pasa a estado = papelera, la carpeta se mueve a Historial/_Papelera/
 * y sus eventos quedan ocultos pero intactos.
 */
function borrarPropiedad(id) {
  const email = emailActual_();
  exigirBorrar_(email);
  id = idValido_(id);

  return conBloqueo_(() => {
    const prop = propiedadActiva_(id);
    if (!prop) throw new Error('No encontramos la propiedad ' + pad4_(id) + '.');
    carpetaDe_(prop.carpeta_url).moveTo(subcarpeta_(raiz_(), CARPETA_PAPELERA));
    actualizar_('Propiedades', prop._fila, { estado: 'papelera', borrado_por: email, fecha_borrado: new Date() });
    const eventos = eventosDe_(id);
    actualizarColumna_('Eventos', 'estado', eventos.map(e => e._fila), 'papelera');
    log_(email, 'borrar_propiedad', pad4_(id), prop.direccion + ' · ' + eventos.length + ' evento(s) a la papelera');
    return { ok: true };
  });
}

/** Lista de propiedades en la papelera. Solo BORRAN. */
function getPapelera() {
  const email = emailActual_();
  exigirBorrar_(email);
  const eventos = leer_('Eventos');
  return leer_('Propiedades').filter(p => p.estado === 'papelera').map(p => ({
    id: p.id, direccion: p.direccion, borrado_por: p.borrado_por, fecha_borrado: p.fecha_borrado,
    clave: idDeUrl_(p.carpeta_url),
    ocupado: !!propiedadActiva_(p.id),
    eventos: eventos.filter(e => e.id_propiedad === p.id && e.estado === 'papelera').length
  }));
}

/**
 * RESTAURAR PROPIEDAD. Solo BORRAN. Vuelve la carpeta a Historial/<id>/ y el
 * estado a activa. Si el ID ya fue reutilizado por otra propiedad, se bloquea.
 * "clave" es el identificador de la carpeta en Drive (distingue dos propiedades
 * borradas que hayan tenido el mismo ID).
 */
function restaurarPropiedad(clave) {
  const email = emailActual_();
  exigirBorrar_(email);
  clave = String(clave || '');

  return conBloqueo_(() => {
    const prop = leer_('Propiedades').filter(p => p.estado === 'papelera' && idDeUrl_(p.carpeta_url) === clave)[0];
    if (!prop) throw new Error('Esa propiedad ya no está en la papelera.');
    const ocupada = propiedadActiva_(prop.id);
    if (ocupada) {
      throw new Error('No se puede restaurar: el ID ' + pad4_(prop.id) + ' ahora lo usa otra propiedad (' +
        ocupada.direccion + '). Primero hay que cambiarle el número a esa.');
    }
    const carpeta = carpetaDe_(prop.carpeta_url);
    carpeta.moveTo(raiz_());

    // Los eventos de ESTA propiedad son los que tienen su carpeta adentro de la suya.
    const hijas = {};
    vivos_(carpeta.getFolders()).forEach(c => { hijas[c.getId()] = true; });
    const suyos = leer_('Eventos')
      .filter(e => e.estado === 'papelera' && e.id_propiedad === prop.id && hijas[idDeUrl_(e.carpeta_url)]);
    const n = suyos.length;
    actualizarColumna_('Eventos', 'estado', suyos.map(e => e._fila), 'activo');

    actualizar_('Propiedades', prop._fila, { estado: 'activa', borrado_por: '', fecha_borrado: '' });
    log_(email, 'restaurar_propiedad', pad4_(prop.id), prop.direccion + ' · ' + n + ' evento(s) restaurados');
    return { ok: true, id: prop.id };
  });
}

/* ================================================================== */
/* API · eventos                                                       */
/* ================================================================== */

/** Reclamos de una propiedad, para el desplegable "reclamo vinculado" del formulario. */
function getReclamos(idPropiedad) {
  emailActual_();
  idPropiedad = idValido_(idPropiedad);
  return eventosDe_(idPropiedad).filter(e => e.tipo === 'RECLAMO')
    .sort((a, b) => a.fecha_evento < b.fecha_evento ? 1 : -1)
    .map(e => ({ id_evento: e.id_evento, fecha_evento: e.fecha_evento, descripcion: e.descripcion }));
}

/** Valida los campos del formulario de evento. Devuelve los datos limpios. */
function validarEvento_(datos) {
  datos = datos || {};
  const d = {};
  d.id_propiedad = idValido_(datos.id_propiedad);
  d.tipo = String(datos.tipo || '');
  if (!tipo_(d.tipo)) throw new Error('Elegí el tipo de evento.');
  d.fecha_evento = String(datos.fecha_evento || '');
  if (!esFechaValida_(d.fecha_evento)) throw new Error('Revisá la fecha del evento.');
  d.descripcion = texto_(datos.descripcion).replace(/\s+/g, ' ');
  if (!d.descripcion) throw new Error('Escribí una descripción corta del evento.');
  if (d.descripcion.length > DESCRIPCION_MAX) {
    throw new Error('La descripción puede tener hasta ' + DESCRIPCION_MAX + ' caracteres.');
  }
  d.origen = String(datos.origen || '');
  if (ORIGENES.indexOf(d.origen) === -1) throw new Error('Elegí quién produjo el material (origen).');
  d.notas = texto_(datos.notas, NOTAS_MAX);
  d.visible_propietario = datos.visible_propietario !== false;   // por defecto, marcado
  d.reclamo_vinculado = String(datos.reclamo_vinculado || '');
  d.direccion_nueva = texto_(datos.direccion_nueva, 200);
  return d;
}

/** El reclamo vinculado solo vale para REPARACION y tiene que ser un RECLAMO de la misma propiedad. */
function reclamoValido_(d, idEventoPropio) {
  if (d.tipo !== 'REPARACION' || !d.reclamo_vinculado) return '';
  const r = eventosDe_(d.id_propiedad).filter(e =>
    e.id_evento === d.reclamo_vinculado && e.tipo === 'RECLAMO' && e.id_evento !== idEventoPropio)[0];
  if (!r) throw new Error('El reclamo elegido no es de esta propiedad. Elegilo de nuevo.');
  return r.id_evento;
}

/** Quita el vínculo en las reparaciones que apuntaban a un reclamo que dejó de serlo. */
function desvincularReclamo_(idReclamo) {
  eventosActivos_().filter(e => e.reclamo_vinculado === idReclamo).forEach(ev => {
    actualizar_('Eventos', ev._fila, { reclamo_vinculado: '' });
    ev.reclamo_vinculado = '';
    try { reconstruirJson_(ev, carpetaDe_(ev.carpeta_url)); } catch (e) {}
  });
}

/**
 * Paso 1 de la carga: crea el evento (fila + carpeta) todavía sin archivos.
 * Después la pantalla sube los archivos de a uno (subirArchivo) y al final
 * llama a cerrarCarga. Cualquier usuario del dominio.
 *
 * Si la propiedad no existe y viene direccion_nueva, se crea en el mismo paso.
 * Si la pantalla creyó que era nueva pero el ID ya existe, no se crea nada y
 * se devuelve { yaExiste: true } para que la persona revise el número.
 */
function crearEvento(datos) {
  const email = emailActual_();
  const d = validarEvento_(datos);

  return conBloqueo_(() => {
    let prop = propiedadActiva_(d.id_propiedad);
    let propiedadCreada = false;
    if (prop && d.direccion_nueva) {
      return { yaExiste: true, propiedad: { id: prop.id, direccion: prop.direccion } };
    }
    if (!prop) {
      if (!d.direccion_nueva) {
        throw new Error('La propiedad ' + pad4_(d.id_propiedad) + ' no existe. Escribí la dirección para crearla.');
      }
      prop = crearPropiedad_(d.id_propiedad, d.direccion_nueva, email);
      propiedadCreada = true;
    }

    const reclamo = reclamoValido_(d, '');
    const carpetaProp = carpetaDe_(prop.carpeta_url);
    // Carpeta de evento: AAAA-MM-DD_TIPO_Descripcion (con _2, _3 si ya existe).
    const nombre = nombreCarpetaLibre_(carpetaProp, nombreBaseCarpeta_(d.fecha_evento, d.tipo, d.descripcion), '');
    const carpeta = carpetaProp.createFolder(nombre);

    const ev = {
      id_evento: siguienteIdEvento_(), fecha_carga: new Date(), id_propiedad: prop.id,
      direccion: prop.direccion, tipo: d.tipo, fecha_evento: d.fecha_evento,
      descripcion: d.descripcion, origen: d.origen, notas: d.notas,
      visible_propietario: d.visible_propietario, reclamo_vinculado: reclamo,
      cargado_por: email, carpeta_url: carpeta.getUrl(), cantidad_archivos: 0,
      modificado_por: '', fecha_modificacion: '', estado: 'activo'
    };
    agregar_('Eventos', ev);
    const guardado = eventoActivo_(ev.id_evento);
    reconstruirJson_(guardado, carpeta);

    return {
      evento: limpio_(guardado), propiedadCreada: propiedadCreada,
      propiedad: { id: prop.id, direccion: prop.direccion }
    };
  });
}

/** ¿Puede esta persona subir archivos a este evento? Quien lo acaba de crear, o un administrador. */
function autorizarCarga_(ev, email) {
  // VENTANA DE CARGA (regla de negocio): quien creó el evento puede subirle sus
  // archivos durante las HORAS_DE_CARGA siguientes. Es lo que dura la carga
  // inicial (y los reintentos si algún archivo falló). Después, solo un
  // administrador puede agregar o quitar archivos.
  const limite = Utilities.formatDate(new Date(Date.now() - HORAS_DE_CARGA * 3600000), TZ, "yyyy-MM-dd'T'HH:mm:ss");
  if (ev.cargado_por === email && ev.fecha_carga >= limite) return 'carga';
  if (esAdmin_(email)) return 'admin';
  throw new Error('No tenés permiso para modificar este evento. Si hay que corregir algo, pedíselo a un administrador.');
}

/**
 * Paso 2 de la carga: sube UN archivo a la carpeta del evento. La pantalla los
 * manda de a uno, en orden. El archivo se guarda tal cual (sin recomprimir ni
 * tocar metadatos); solo cambia el nombre a ID_AAAA-MM-DD_TIPO_NNN.ext.
 */
function subirArchivo(idEvento, base64, nombreOriginal, mime) {
  const email = emailActual_();
  const ev = eventoActivo_(idEvento);
  autorizarCarga_(ev, email);

  nombreOriginal = String(nombreOriginal || 'archivo').replace(/[\\\/]/g, '_').slice(0, 200);
  const ext = extension_(nombreOriginal, mime);
  mime = String(mime || '') || mimePorExtension_(ext);
  if (!esImagen_(mime) && !esVideo_(mime)) throw new Error('Solo se pueden subir fotos y videos.');
  if (!base64) throw new Error('El archivo llegó vacío. Probá subirlo de nuevo.');

  const bytes = Utilities.base64Decode(base64);
  // LÍMITE DE TAMAÑO (regla técnica): ver MAX_ARCHIVO_MB arriba.
  if (bytes.length > MAX_ARCHIVO_MB * 1024 * 1024) {
    throw new Error('Este archivo es demasiado grande para subirlo desde acá. Subilo a mano a la carpeta del evento en Drive.');
  }

  const carpeta = carpetaDe_(ev.carpeta_url);
  // Numeración: sigue al número más alto que ya haya en la carpeta.
  let n = 0;
  vivos_(carpeta.getFiles()).forEach(f => {
    const m = /_(\d{3,})\.[a-z0-9]+$/.exec(f.getName());
    if (m && Number(m[1]) > n) n = Number(m[1]);
  });
  const nombre = prefijoArchivos_(ev) + pad3_(n + 1) + '.' + ext;
  const archivo = carpeta.createFile(Utilities.newBlob(bytes, mime, nombre));
  archivo.setDescription('Nombre original: ' + nombreOriginal + ' · subido por ' + email);

  return { id: archivo.getId(), nombre: nombre, nombre_original: nombreOriginal, tamano: bytes.length, mime: mime };
}

/**
 * Paso 3 de la carga: actualiza cantidad_archivos y reescribe evento.json.
 * Cuando un admin agrega archivos al editar (esEdicion), cuenta como modificación.
 */
function cerrarCarga(idEvento, esEdicion) {
  const email = emailActual_();
  return conBloqueo_(() => {
    const ev = eventoActivo_(idEvento);
    const modo = autorizarCarga_(ev, email);
    if (esEdicion) exigirAdmin_(email);
    const archivos = reconstruirJson_(ev, carpetaDe_(ev.carpeta_url));
    const cambios = { cantidad_archivos: archivos.length };
    if (esEdicion || modo === 'admin') {
      cambios.modificado_por = email;
      cambios.fecha_modificacion = new Date();
      if (archivos.length !== ev.cantidad_archivos) {
        log_(email, 'agregar_archivos', ev.id_evento,
          pad4_(ev.id_propiedad) + ' · de ' + ev.cantidad_archivos + ' a ' + archivos.length + ' archivo(s)');
      }
    }
    actualizar_('Eventos', ev._fila, cambios);
    const c = limpio_(eventoActivo_(idEvento));
    c.archivos = archivos;
    return c;
  });
}

/**
 * MODIFICAR EVENTO. Solo ADMINS. Se puede cambiar cualquier campo, incluso
 * pasarlo a otra propiedad si se cargó en la equivocada. Si cambian la fecha,
 * el tipo, la descripción o la propiedad, se renombran la carpeta y los
 * archivos para que Drive siga coincidiendo con la planilla.
 */
function modificarEvento(idEvento, datos) {
  const email = emailActual_();
  exigirAdmin_(email);
  const d = validarEvento_(datos);

  return conBloqueo_(() => {
    const ev = eventoActivo_(idEvento);
    const destino = propiedadActiva_(d.id_propiedad);
    if (!destino) throw new Error('No encontramos la propiedad ' + pad4_(d.id_propiedad) + '.');
    const reclamo = reclamoValido_(d, ev.id_evento);

    const cambios = [];
    const cambioProp = destino.id !== ev.id_propiedad;
    if (cambioProp) cambios.push('propiedad ' + pad4_(ev.id_propiedad) + ' -> ' + pad4_(destino.id));
    if (d.tipo !== ev.tipo) cambios.push('tipo ' + ev.tipo + ' -> ' + d.tipo);
    if (d.fecha_evento !== ev.fecha_evento) cambios.push('fecha ' + ev.fecha_evento + ' -> ' + d.fecha_evento);
    if (d.descripcion !== ev.descripcion) cambios.push('descripción "' + ev.descripcion + '" -> "' + d.descripcion + '"');
    if (d.origen !== ev.origen) cambios.push('origen ' + ev.origen + ' -> ' + d.origen);
    if (d.notas !== ev.notas) cambios.push('notas');
    if (d.visible_propietario !== ev.visible_propietario) cambios.push('visible para propietario: ' + (d.visible_propietario ? 'sí' : 'no'));
    if (reclamo !== ev.reclamo_vinculado) cambios.push('reclamo vinculado: ' + (reclamo || 'ninguno'));
    if (!cambios.length) { const igual = limpio_(ev); return { evento: igual, sinCambios: true }; }

    // Si era un reclamo y deja de serlo (o se va a otra propiedad), las
    // reparaciones que lo tenían vinculado quedan sin vínculo.
    if (ev.tipo === 'RECLAMO' && (d.tipo !== 'RECLAMO' || cambioProp)) desvincularReclamo_(ev.id_evento);

    const carpeta = carpetaDe_(ev.carpeta_url);
    const nuevo = {
      id_propiedad: destino.id, direccion: destino.direccion, tipo: d.tipo, fecha_evento: d.fecha_evento,
      descripcion: d.descripcion, origen: d.origen, notas: d.notas,
      visible_propietario: d.visible_propietario, reclamo_vinculado: reclamo,
      modificado_por: email, fecha_modificacion: new Date()
    };

    const baseVieja = nombreBaseCarpeta_(ev.fecha_evento, ev.tipo, ev.descripcion);
    const baseNueva = nombreBaseCarpeta_(d.fecha_evento, d.tipo, d.descripcion);
    if (cambioProp || baseVieja !== baseNueva) {
      const padre = carpetaDe_(destino.carpeta_url);
      if (cambioProp) carpeta.moveTo(padre);
      carpeta.setName(nombreCarpetaLibre_(padre, baseNueva, carpeta.getId()));
    }
    if (cambioProp || d.tipo !== ev.tipo || d.fecha_evento !== ev.fecha_evento) {
      renombrarArchivos_(carpeta, pad4_(destino.id) + '_' + d.fecha_evento + '_' + d.tipo + '_');
    }

    actualizar_('Eventos', ev._fila, nuevo);
    const guardado = eventoActivo_(ev.id_evento);
    const archivos = reconstruirJson_(guardado, carpeta);
    log_(email, 'modificar_evento', ev.id_evento, pad4_(guardado.id_propiedad) + ' · ' + cambios.join('; '));

    const c = limpio_(guardado);
    c.archivos = archivos;
    return { evento: c };
  });
}

/** Quita un archivo de un evento (va a la papelera de Drive). Solo ADMINS. */
function quitarArchivo(idEvento, idArchivo) {
  const email = emailActual_();
  exigirAdmin_(email);

  return conBloqueo_(() => {
    const ev = eventoActivo_(idEvento);
    const carpeta = carpetaDe_(ev.carpeta_url);
    // Solo se puede quitar un archivo que esté realmente en la carpeta de este evento.
    const archivo = listarArchivos_(carpeta).filter(a => a.id === String(idArchivo))[0];
    if (!archivo) throw new Error('Ese archivo ya no está en el evento.');
    DriveApp.getFileById(archivo.id).setTrashed(true);
    const archivos = reconstruirJson_(ev, carpeta);
    actualizar_('Eventos', ev._fila, {
      cantidad_archivos: archivos.length, modificado_por: email, fecha_modificacion: new Date()
    });
    log_(email, 'quitar_archivo', ev.id_evento, pad4_(ev.id_propiedad) + ' · ' + archivo.nombre);
    return { ok: true, archivos: archivos };
  });
}

/**
 * BORRAR EVENTO: es definitivo. Solo BORRAN. Se elimina la fila de Eventos y la
 * carpeta va a la papelera de Drive (Google la vacía sola a los 30 días).
 */
function borrarEvento(idEvento) {
  const email = emailActual_();
  exigirBorrar_(email);

  return conBloqueo_(() => {
    const ev = eventoActivo_(idEvento);
    if (ev.tipo === 'RECLAMO') desvincularReclamo_(ev.id_evento);
    let nombreCarpeta = '';
    try {
      const carpeta = carpetaDe_(ev.carpeta_url);
      nombreCarpeta = carpeta.getName();
      carpeta.setTrashed(true);
    } catch (e) { /* si la carpeta ya no está, se borra igual la fila */ }
    const fila = eventoActivo_(idEvento)._fila;
    borrarFila_('Eventos', fila);
    log_(email, 'borrar_evento', ev.id_evento, pad4_(ev.id_propiedad) + ' · ' + (nombreCarpeta ||
      nombreBaseCarpeta_(ev.fecha_evento, ev.tipo, ev.descripcion)) + ' · ' + ev.cantidad_archivos + ' archivo(s)');
    return { ok: true };
  });
}

/* ================================================================== */
/* API · miniaturas                                                    */
/* ================================================================== */

/**
 * Plan B para las miniaturas. La pantalla primero prueba el link directo de
 * Drive; en iPhone (Safari) ese link suele fallar aunque la carpeta esté
 * compartida, y entonces las pide por acá.
 * Solo devuelve miniaturas de archivos que estén en la carpeta de ese evento.
 */
function getMiniaturas(idEvento, idsArchivo) {
  emailActual_();
  const ev = eventoActivo_(idEvento);
  const enCarpeta = {};
  listarArchivos_(carpetaDe_(ev.carpeta_url)).forEach(a => { enCarpeta[a.id] = a; });
  const ids = (idsArchivo || []).map(String).filter(id => enCarpeta[id]).slice(0, 40);
  const blobs = miniaturas_(ids, 400);
  const salida = {};
  ids.forEach((id, i) => {
    const b = blobs[i];
    salida[id] = b ? 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) : '';
  });
  return salida;
}

/** Baja de Drive versiones reducidas de las imágenes (los originales no se tocan). */
function miniaturas_(ids, ancho) {
  const token = ScriptApp.getOAuthToken();
  const salida = [];
  for (let i = 0; i < ids.length; i += 10) {
    const tanda = ids.slice(i, i + 10);
    let respuestas = [];
    try {
      respuestas = UrlFetchApp.fetchAll(tanda.map(id => ({
        url: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + ancho,
        headers: { Authorization: 'Bearer ' + token },
        muteHttpExceptions: true
      })));
    } catch (e) { respuestas = []; }
    tanda.forEach((id, j) => {
      let blob = null;
      const r = respuestas[j];
      try {
        if (r && r.getResponseCode() === 200) {
          const b = r.getBlob();
          if (esImagen_(b.getContentType())) blob = b;
        }
      } catch (e) {}
      if (!blob) {
        // Segundo intento: pedirle a la API de Drive el link de la miniatura y bajarla al ancho pedido.
        try {
          const meta = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '?fields=thumbnailLink',
            { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
          const link = meta.getResponseCode() === 200 ? JSON.parse(meta.getContentText()).thumbnailLink : '';
          if (link) {
            const r2 = UrlFetchApp.fetch(link.replace(/=s\d+$/, '=w' + ancho),
              { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
            if (r2.getResponseCode() === 200 && esImagen_(r2.getBlob().getContentType())) blob = r2.getBlob();
          }
        } catch (e) {}
      }
      if (!blob) {
        // Último recurso: la miniatura chica que da DriveApp (se ve, pero con menos definición).
        try { blob = DriveApp.getFileById(id).getThumbnail() || null; } catch (e) { blob = null; }
      }
      salida.push(blob);
    });
  }
  return salida;
}

/* ================================================================== */
/* API · control                                                       */
/* ================================================================== */

/** Listas para detectar qué falta documentar. Solo lectura, para todos. */
function getControl() {
  emailActual_();
  const hoy = hoy_();
  const propiedades = leer_('Propiedades').filter(p => p.estado === 'activa');
  const eventos = eventosActivos_();

  const conIngreso = {}, ultimoEvento = {}, reclamosAtendidos = {};
  eventos.forEach(e => {
    if (e.tipo === 'INGRESO') conIngreso[e.id_propiedad] = true;
    if (!ultimoEvento[e.id_propiedad] || e.fecha_evento > ultimoEvento[e.id_propiedad]) {
      ultimoEvento[e.id_propiedad] = e.fecha_evento;
    }
    if (e.tipo === 'REPARACION' && e.reclamo_vinculado) reclamosAtendidos[e.reclamo_vinculado] = true;
  });

  // Fecha de hace 12 meses, en formato AAAA-MM-DD.
  const p = hoy.split('-');
  const haceUnAnio = new Date(Date.UTC(+p[0] - 1, +p[1] - 1, +p[2])).toISOString().slice(0, 10);

  const porId = (a, b) => a.id - b.id;
  return {
    hoy: hoy,
    sinIngreso: propiedades.filter(pr => !conIngreso[pr.id])
      .map(pr => ({ id: pr.id, direccion: pr.direccion })).sort(porId),
    reclamosSinReparacion: eventos.filter(e => e.tipo === 'RECLAMO' && !reclamosAtendidos[e.id_evento])
      .map(e => ({
        id: e.id_propiedad, direccion: e.direccion, id_evento: e.id_evento,
        descripcion: e.descripcion, fecha: e.fecha_evento, dias: diasEntre_(e.fecha_evento, hoy)
      }))
      .sort((a, b) => b.dias - a.dias),
    sinMovimiento: propiedades.filter(pr => !ultimoEvento[pr.id] || ultimoEvento[pr.id] < haceUnAnio)
      .map(pr => ({ id: pr.id, direccion: pr.direccion, ultimo: ultimoEvento[pr.id] || '' })).sort(porId)
  };
}

/* ================================================================== */
/* API · informe para el propietario (Word)                            */
/* ================================================================== */

/**
 * Genera el informe en Word a partir de la plantilla de Google Docs. Solo ADMINS.
 * Copia la plantilla, reemplaza los marcadores, inserta los eventos elegidos y
 * exporta la copia a .docx en Historial/<id>/_Informes/.
 *
 * Nunca incluye eventos marcados como no visibles para el propietario.
 * Las fotos van en versión reducida (INFORME_ANCHO_PX): Google Docs no acepta
 * fotos muy grandes y el Word quedaría inmanejable. Los originales no se tocan.
 */
function generarInforme(idPropiedad, idsEventos, confirmado) {
  const email = emailActual_();
  exigirAdmin_(email);
  idPropiedad = idValido_(idPropiedad);
  const prop = propiedadActiva_(idPropiedad);
  if (!prop) throw new Error('No encontramos la propiedad ' + pad4_(idPropiedad) + '.');

  const elegidos = {};
  (idsEventos || []).forEach(id => { elegidos[String(id)] = true; });
  const todos = eventosDe_(idPropiedad);
  const eventos = todos.filter(e => elegidos[e.id_evento])
    .sort((a, b) => a.fecha_evento !== b.fecha_evento ? (a.fecha_evento < b.fecha_evento ? -1 : 1)
      : (a.id_evento < b.id_evento ? -1 : 1));
  if (!eventos.length) throw new Error('Elegí al menos un evento para el informe.');
  if (eventos.some(e => !e.visible_propietario)) {
    throw new Error('Elegiste un evento que no es visible para el propietario. Sacale el tilde y probá de nuevo.');
  }

  // Archivos reales de cada evento.
  let totalFotos = 0;
  eventos.forEach(e => {
    e._archivos = listarArchivos_(carpetaDe_(e.carpeta_url));
    e._fotos = e._archivos.filter(a => esImagen_(a.mime));
    totalFotos += e._fotos.length;
  });
  if (totalFotos > INFORME_AVISO_FOTOS && !confirmado) {
    return { aviso: true, fotos: totalFotos };
  }

  const carpetaInformes = subcarpeta_(carpetaDe_(prop.carpeta_url), CARPETA_INFORMES);
  // Nombre: Informe_<id>_<fecha>.docx; si ya hay uno de hoy, _2, _3...
  const base = 'Informe_' + pad4_(prop.id) + '_' + hoy_();
  let nombre = base, n = 1;
  while (vivos_(carpetaInformes.getFilesByName(nombre + '.docx')).length ||
         vivos_(carpetaInformes.getFilesByName(nombre)).length) { n++; nombre = base + '_' + n; }

  // Mientras se arma, la copia se llama "EN PROCESO ...": si la ejecución se cortara,
  // en la carpeta queda claro que ese documento está incompleto y se puede borrar.
  const inicio = Date.now();
  let copia;
  try { copia = DriveApp.getFileById(TEMPLATE_DOC_ID).makeCopy('EN PROCESO · ' + nombre, carpetaInformes); }
  catch (e) { throw new Error('No se pudo abrir la plantilla del informe. Avisale a mantenimiento.'); }

  try {
    const doc = DocumentApp.openById(copia.getId());
    const body = doc.getBody();

    // 1) Marcadores simples (en el cuerpo, el encabezado y el pie).
    const reemplazos = {
      '{{DIRECCION}}': prop.direccion,
      '{{ID}}': pad4_(prop.id),
      '{{PERIODO}}': eventos[0].fecha_evento === eventos[eventos.length - 1].fecha_evento
        ? fechaAr_(eventos[0].fecha_evento)
        : fechaAr_(eventos[0].fecha_evento) + ' al ' + fechaAr_(eventos[eventos.length - 1].fecha_evento),
      '{{CANTIDAD_EVENTOS}}': String(eventos.length),
      '{{FECHA_EMISION}}': fechaAr_(hoy_())
    };
    [body, doc.getHeader(), doc.getFooter()].forEach(seccion => {
      if (!seccion) return;
      Object.keys(reemplazos).forEach(k => {
        seccion.replaceText(k.replace(/[{}]/g, '\\$&'), reemplazos[k]);
      });
    });

    // 2) Contenido: se inserta donde esté {{CONTENIDO}} (o al final si no está).
    let marcador = null;
    const hallado = body.findText('\\{\\{CONTENIDO\\}\\}');
    if (hallado) {
      let el = hallado.getElement();
      while (el && el.getType() !== DocumentApp.ElementType.PARAGRAPH &&
             el.getType() !== DocumentApp.ElementType.BODY_SECTION) el = el.getParent();
      if (el && el.getType() === DocumentApp.ElementType.PARAGRAPH && el.getParent() &&
          el.getParent().getType() === DocumentApp.ElementType.BODY_SECTION) marcador = el;
    }
    if (!marcador) {
      // El marcador no está, o quedó adentro de una tabla o lista: el contenido va al final.
      if (hallado) body.replaceText('\\{\\{CONTENIDO\\}\\}', '');
      marcador = body.appendParagraph('');
    }
    const pos = () => body.getChildIndex(marcador);

    const anchoUtil = body.getPageWidth() - body.getMarginLeft() - body.getMarginRight();
    const anchoFoto = Math.floor(anchoUtil / 2) - 16;
    const todosPorId = {};
    todos.forEach(e => { todosPorId[e.id_evento] = e; });

    eventos.forEach(e => {
      // Apps Script corta cualquier ejecución a los 6 minutos. Si se acerca, se frena con un mensaje claro.
      if (Date.now() - inicio > INFORME_TOPE_SEGUNDOS * 1000) {
        throw new Error('son demasiadas fotos para un solo documento. Elegí menos eventos y generá dos informes.');
      }
      // Título: fecha + etiqueta del tipo + descripción.
      body.insertParagraph(pos(), fechaAr_(e.fecha_evento) + ' · ' + etiquetaTipo_(e.tipo) + ' · ' + e.descripcion)
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);

      const pOrigen = normal_(body.insertParagraph(pos(), ''));
      pOrigen.appendText('Origen: ').setBold(true);
      pOrigen.appendText(e.origen).setBold(false);

      // Si el reclamo vinculado NO es visible para el propietario, no se nombra.
      const r = e.tipo === 'REPARACION' && e.reclamo_vinculado ? todosPorId[e.reclamo_vinculado] : null;
      if (r && r.visible_propietario) {
        const pRec = normal_(body.insertParagraph(pos(), 'Responde al reclamo del ' + fechaAr_(r.fecha_evento) + ': ' + r.descripcion));
        pRec.editAsText().setItalic(true);
      }

      // Notas: solo de eventos visibles (los no visibles ya se rechazaron arriba).
      if (e.notas) {
        e.notas.split('\n').forEach(linea => {
          if (linea.trim()) normal_(body.insertParagraph(pos(), linea.trim()));
        });
      }

      // Fotos en grilla de 2 columnas, ancho uniforme, con pie "Foto N de M".
      if (e._fotos.length) {
        const blobs = miniaturas_(e._fotos.map(a => a.id), INFORME_ANCHO_PX);
        const tabla = body.insertTable(pos());
        tabla.setBorderWidth(0);
        let fila = null;
        e._fotos.forEach((foto, i) => {
          if (i % 2 === 0) fila = tabla.appendTableRow();
          const celda = fila.appendTableCell('');
          celda.setPaddingTop(4).setPaddingBottom(6).setPaddingLeft(4).setPaddingRight(4);
          const par = celda.getNumChildren() ? celda.getChild(0).asParagraph() : celda.appendParagraph('');
          par.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          let puesta = false;
          if (blobs[i]) {
            try {
              const img = par.appendInlineImage(blobs[i]);
              const w = img.getWidth(), h = img.getHeight();
              if (w > 0) { img.setWidth(anchoFoto); img.setHeight(Math.round(h * anchoFoto / w)); }
              puesta = true;
            } catch (err) { puesta = false; }
          }
          if (!puesta) par.appendText('(No se pudo incluir esta foto: ' + foto.nombre + ')');
          const pie = celda.appendParagraph('Foto ' + (i + 1) + ' de ' + e._fotos.length);
          pie.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          pie.editAsText().setFontSize(8).setForegroundColor('#6d7888').setBold(false).setItalic(false);
        });
        if (e._fotos.length % 2 === 1) fila.appendTableCell('');   // completa la última fila
        try { tabla.setColumnWidth(0, anchoUtil / 2); tabla.setColumnWidth(1, anchoUtil / 2); } catch (err) {}
      }

      // Videos y otros archivos: solo el nombre, sin link (el documento sale de JB).
      e._archivos.filter(a => !esImagen_(a.mime)).forEach(a => {
        normal_(body.insertParagraph(pos(), (esVideo_(a.mime) ? 'Video: ' : 'Archivo: ') + a.nombre));
      });

      normal_(body.insertParagraph(pos(), ''));
    });

    // Se saca el renglón del marcador (si es el último del documento, solo se vacía).
    try { marcador.removeFromParent(); } catch (err) { try { marcador.clear(); } catch (err2) {} }
    doc.saveAndClose();
  } catch (e) {
    try { copia.setTrashed(true); } catch (e2) {}
    throw new Error('No se pudo armar el informe: ' + (e.message || e));
  }

  // 3) Exportar la copia a Word y dejar solo el .docx.
  let docx = null;
  try {
    const r = UrlFetchApp.fetch(
      'https://docs.google.com/feeds/download/documents/export/Export?id=' + copia.getId() + '&exportFormat=docx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (r.getResponseCode() === 200) docx = r.getBlob();
  } catch (e) { docx = null; }

  if (!docx) {
    // No se pudo pasar a Word (casi siempre por peso). El informe queda como Google Docs.
    copia.setName(nombre);
    return {
      ok: true, word: false, nombre: nombre, url: copia.getUrl(), fotos: totalFotos,
      mensaje: 'El informe quedó armado como Google Docs, pero no se pudo pasar a Word (suele pasar cuando pesa demasiado). ' +
        'Probá con menos eventos, o abrilo y usá Archivo > Descargar > Microsoft Word.'
    };
  }
  const archivo = carpetaInformes.createFile(docx.setName(nombre + '.docx'));
  copia.setTrashed(true);
  return {
    ok: true, word: true, nombre: nombre + '.docx', url: archivo.getUrl(), fotos: totalFotos,
    descarga: 'https://drive.google.com/uc?export=download&id=' + archivo.getId()
  };
}

/** Deja un párrafo recién insertado con estilo "Texto normal", sin negrita ni cursiva heredadas. */
function normal_(par) {
  par.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  if (par.getText()) par.editAsText().setBold(false).setItalic(false);
  return par;
}

/* ================================================================== */
/* Respaldo automático (igual que Pipeline ACM)                        */
/* ================================================================== */

function folderNextTo_(name) {
  // Crea (o reutiliza) la carpeta al lado de la planilla, dentro del Drive de mantenimiento@.
  const parents = DriveApp.getFileById(SHEET_ID).getParents();
  const parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  return subcarpeta_(parent, name);
}

/**
 * Las funciones de mantenimiento se corren desde el editor, como mantenimiento@.
 * Como cualquier función sin guion bajo al final se puede llamar también desde
 * el navegador, acá se frena a cualquiera que no sea la cuenta dueña.
 * (Cuando corre el disparador automático no hay usuario activo, y pasa.)
 */
function soloDuenio_() {
  const e = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (e && e !== OWNER.toLowerCase()) throw new Error('Esta función solo la puede ejecutar ' + OWNER + ' desde el editor.');
}

/** Ejecutar UNA vez para programar el respaldo diario (crea el disparador). */
function installDailyBackup() {
  soloDuenio_();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'dailyBackup')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(3).create();
  return 'Respaldo diario programado (~03:00). Carpeta: ' + BACKUP_FOLDER;
}

/** Genera un respaldo: copia de la planilla + export JSON. Conserva los últimos BACKUP_KEEP días. */
function dailyBackup() {
  soloDuenio_();
  const folder = folderNextTo_(BACKUP_FOLDER);
  const stamp = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd_HH-mm');

  DriveApp.getFileById(SHEET_ID).makeCopy('Historial Multimedia · Base ' + stamp, folder);
  folder.createFile(
    'historial-multimedia-' + stamp + '.json',
    JSON.stringify({
      exportedAt: new Date().toISOString(),
      propiedades: leer_('Propiedades').map(limpio_),
      eventos: leer_('Eventos').map(limpio_)
    }, null, 2),
    'application/json'
  );

  pruneBackups_(folder, BACKUP_KEEP);
  return 'Respaldo generado: ' + stamp;
}

function pruneBackups_(folder, keep) {
  const files = vivos_(folder.getFiles());
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  files.slice(keep * 2).forEach(f => f.setTrashed(true)); // *2: por copia + json de cada día
}

/* ================================================================== */
/* Funciones para correr UNA vez desde el editor                       */
/* ================================================================== */

/**
 * Si un cambio de número de propiedad se cortó por la mitad (pasa solo con
 * propiedades de cientos de archivos), los datos quedan bien pero algunos
 * archivos conservan el prefijo viejo. Esta función repasa todas las
 * propiedades que alguna vez cambiaron de número y deja los nombres como
 * corresponde. Se puede correr las veces que haga falta.
 */
function repararNombres() {
  soloDuenio_();
  return conBloqueo_(() => {
    const props = leer_('Propiedades').filter(p => p.estado === 'activa' && p.id_anterior !== '');
    props.forEach(p => aplicarNombres_(p));
    const msg = 'Propiedades revisadas: ' + props.length;
    Logger.log(msg);
    return msg;
  });
}

/**
 * Revisa que la configuración esté bien y arma las hojas de la planilla.
 * Correla desde el editor después de pegar los IDs: de paso te pide todos los
 * permisos juntos. El resultado se ve en "Registro de ejecución".
 */
function verificarInstalacion() {
  soloDuenio_();
  const r = [];
  const ok = t => r.push('OK   · ' + t);
  const mal = t => r.push('MAL  · ' + t);
  const ojo = t => r.push('OJO  · ' + t);

  ok('Cuenta que ejecuta: ' + Session.getEffectiveUser().getEmail());

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    ss.setSpreadsheetTimeZone(TZ);
    Object.keys(COLUMNAS).forEach(n => hoja_(n));
    ok('Planilla "' + ss.getName() + '": hojas Propiedades, Eventos y Log listas.');

    // Prueba de escritura: la app guarda textos como "texto sin formato" para que
    // Sheets no los convierta en números o fechas. Acá se comprueba que sea así.
    const prueba = ss.insertSheet('_prueba_' + Date.now());
    try {
      const textos = ['0057', '2026-03-15', '+54 351 1234567', '15/03'];
      const rango = prueba.getRange(1, 1, 1, textos.length);
      rango.setNumberFormats([textos.map(() => '@')]);
      rango.setValues([textos]);
      SpreadsheetApp.flush();
      const leidos = rango.getValues()[0];
      const distintos = textos.filter((t, i) => leidos[i] !== t);
      if (distintos.length) mal('La planilla cambió estos textos al guardarlos: ' + distintos.join(' | ') + '. Avisá antes de usar la app.');
      else ok('Prueba de escritura en la planilla: los textos se guardan tal cual.');
    } finally { ss.deleteSheet(prueba); }
  } catch (e) { mal('Planilla (SHEET_ID): ' + (e.message || e)); }

  try {
    const raiz = DriveApp.getFolderById(ROOT_FOLDER_ID);
    subcarpeta_(raiz, CARPETA_PAPELERA);
    ok('Carpeta "' + raiz.getName() + '" encontrada.');
    try {
      const acceso = raiz.getSharingAccess();
      if (acceso === DriveApp.Access.DOMAIN || acceso === DriveApp.Access.DOMAIN_WITH_LINK) {
        ok('La carpeta está compartida con el dominio.');
      } else {
        ojo('La carpeta todavía NO está compartida con el dominio como Lector (paso 6 de DEPLOY.md).');
      }
    } catch (e2) { ojo('No se pudo revisar si la carpeta está compartida. Revisalo a mano (paso 6 de DEPLOY.md).'); }
  } catch (e) { mal('Carpeta Historial (ROOT_FOLDER_ID): ' + (e.message || e)); }

  try {
    const doc = DocumentApp.openById(TEMPLATE_DOC_ID);
    const texto = doc.getBody().getText();
    ok('Plantilla "' + doc.getName() + '" encontrada.');
    if (texto.indexOf('{{CONTENIDO}}') === -1) {
      ojo('La plantilla no tiene el marcador {{CONTENIDO}}: los eventos se van a agregar al final.');
    }
  } catch (e) { mal('Plantilla del informe (TEMPLATE_DOC_ID): ' + (e.message || e)); }

  try {
    UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true });
    ok('Permiso para exportar a Word: concedido.');
  } catch (e) { mal('Permiso de conexión externa: ' + (e.message || e)); }

  const salida = r.join('\n');
  Logger.log(salida);
  return salida;
}
