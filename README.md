# Biprop · Bitácora de propiedades · Juárez Beltrán

Archivador online de **fotos y videos de las propiedades** que administra JB, organizado por **evento**
(ingreso de inquilino, reclamo, reparación, etc.), con fecha, notas y registro de quién lo cargó.

Hoy ese material llega por email y WhatsApp y no queda en ningún lado. Con Biprop:

1. Cualquiera de JB carga fotos de una propiedad en un minuto, desde la PC o el celular.
2. El historial de una propiedad se ve completo, filtrado por tipo y fecha.
3. Se genera un informe en Word para el propietario con los eventos elegidos.
4. Todo queda en el Drive de `mantenimiento@juarezbeltran.com.ar`, navegable aunque la app no exista.

**Nada se carga solo.** Una persona decide qué sube, de qué propiedad, con qué fecha y qué notas.
No se leen mails ni WhatsApp, y no hay integración con Mirol ni con otros sistemas.

Es **online y multiusuario**: corre sobre **Google Apps Script + Google Sheets + Google Drive**, igual que
[Pipeline ACM](https://github.com/Majaxu/pipelineacm). Cada persona entra con su cuenta de Google del dominio.

## Acceso

Se entra desde **https://majaxu.github.io/Biprop/**, que redirige a la aplicación (hay que iniciar sesión con la
cuenta del dominio `@juarezbeltran.com.ar`). Esa página es el `index.html` de la raíz, servido por GitHub Pages.

Para dejar el ícono en el celular: **https://majaxu.github.io/Biprop/?instalar**

## Estructura

```
Biprop/
├── apps-script/                → la app que se publica en Google Apps Script
│   ├── Code.gs                 → backend (permisos, planilla, Drive, subida, informe, respaldo)
│   ├── Index.html              → interfaz (HTML + CSS + JS en un solo archivo)
│   ├── appsscript.json         → manifiesto (permisos y acceso por dominio)
│   └── DEPLOY.md               → guía paso a paso para publicarla
├── plantilla-informe/
│   └── INSTRUCCIONES.md        → cómo armar la plantilla de Google Docs del informe y qué marcadores usar
├── index.html                  → página de acceso (GitHub Pages): redirige a la app
├── favicon*.png, icon-*.png, apple-touch-icon-180.png, favicon.ico   → íconos de JB
├── logo-jb-azul.png, logo-jb-blanco.png, isologo-jb.png              → logos de JB
└── README.md
```

## Puesta en marcha

Ver **[apps-script/DEPLOY.md](apps-script/DEPLOY.md)**. En resumen, logueado como `mantenimiento@`: crear la planilla,
la carpeta `Historial` y la plantilla del informe; crear el proyecto en [script.google.com](https://script.google.com)
con los archivos de `apps-script/`; completar tres IDs; publicarlo como **Aplicación web** (ejecutar como el dueño,
acceso restringido al dominio) y compartir la carpeta `Historial` con el dominio como Lector.

## Pantallas

| Pantalla | Qué hace | Quién |
|---|---|---|
| Inicio | Buscador por ID o dirección y los últimos 30 eventos cargados | Todos |
| Cargar evento | Formulario con fotos y videos; crea la propiedad si no existe | Todos |
| Historial de propiedad | Eventos en orden cronológico inverso, con filtros por tipo y fecha | Todos |
| Control | Qué falta documentar: propiedades sin ingreso, reclamos sin reparación, propiedades sin eventos en 12 meses | Todos |
| Informe para propietario | Elige eventos y genera un Word | Administradores |
| Editar evento / propiedad | Corrige cualquier campo, agrega o quita archivos, cambia el número de propiedad | Administradores |
| Borrar y Papelera | Borra eventos (definitivo) y propiedades (recuperables) | Solo quienes pueden borrar |

## Permisos

Se definen en tres constantes arriba de todo en `Code.gs` (`OWNER`, `ADMINS`, `BORRAN`). El backend valida el
permiso en cada función con el email real de Google; la pantalla solo oculta los botones.

| Acción | Quién |
|---|---|
| Ver todo, crear propiedad, cargar evento | Cualquier usuario del dominio |
| Modificar evento o propiedad, renumerar, generar informe | `ADMINS` |
| Borrar evento, borrar propiedad, restaurar | `BORRAN` |

Quien carga un evento no puede editarlo después: le pide a un administrador. Lo único que puede hacer es terminar
de subir sus archivos (o reintentar los que fallaron) durante las 2 horas siguientes. Toda modificación o borrado
queda asentado en la hoja `Log`.

Las funciones de mantenimiento (`verificarInstalacion`, `installDailyBackup`, `dailyBackup`, `repararNombres`) solo
las puede ejecutar `mantenimiento@` desde el editor.

## Dónde queda todo

**Planilla `Historial Multimedia · Base`** (fuente de verdad), con tres hojas:

- `Propiedades`: una fila por propiedad.
- `Eventos`: una fila por evento.
- `Log`: fecha, usuario, acción, id afectado y detalle de cada modificación o borrado.

**Drive**, bajo la carpeta `Historial`:

```
Historial/
  1234/
    2026-03-15_INGRESO_Ingreso-Perez/
      1234_2026-03-15_INGRESO_001.jpg
      1234_2026-03-15_INGRESO_002.jpg
      1234_2026-03-15_INGRESO_003.mp4
      evento.json
    _Informes/
      Informe_1234_2026-10-05.docx
  0057/
    ...
  _Papelera/
    1240/
```

- La carpeta de cada propiedad se llama como su **ID, siempre con 4 cifras** (la 57 es `0057`).
- Los archivos se guardan **tal cual** se subieron: solo se les cambia el nombre. No se recomprimen ni se tocan sus metadatos.
- Cada carpeta de evento tiene un `evento.json` con todos los datos del evento y el nombre original de cada archivo.
  Es el respaldo por si la planilla se pierde.

## Reglas de ID

- **1 a 4999:** propiedades que ya existen en Mirol. El ID se escribe a mano y tiene que coincidir con el de Mirol.
- **5000 en adelante:** propiedades nuevas. La app propone el siguiente número libre.
- Una propiedad puede **cambiar de número** después (pasó a Mirol, error de carga): se renombran la carpeta y todos
  sus archivos, y el número anterior queda en la columna `id_anterior`.

## Límites conocidos

- **Tamaño por archivo: 30 MB** (constante `MAX_ARCHIVO_MB`). Lo que pesa más se sube a mano a la carpeta del evento
  en Drive y aparece solo en el historial. El límite viene de cómo Apps Script recibe los archivos. Como el dominio
  tiene la carpeta en solo lectura, a mano solo puede subir quien entre a Drive como `mantenimiento@`.
- **Informe con muchas fotos:** desde 150 fotos la app avisa antes de generar. Si el documento resulta demasiado
  pesado para pasarlo a Word, queda armado como Google Docs y la app lo avisa.
- **Miniaturas en iPhone:** Safari bloquea las imágenes de Drive dentro de otra página. En ese caso la app las pide
  al backend; se ven igual, un instante después.

## Diferencias con la especificación original

Para poder cumplir lo pedido se agregaron tres columnas que no estaban en la lista:

- `Propiedades.borrado_por` y `Propiedades.fecha_borrado`: para mostrar en la Papelera quién borró y cuándo.
- `Eventos.estado` (`activo` / `papelera`): para ocultar los eventos de una propiedad borrada sin tocarlos, y para
  que no se mezclen con los de otra propiedad que reutilice el mismo ID.

Además, no estaban en el listado de entregables: la página de acceso (`index.html` de la raíz) y dos funciones de
mantenimiento para correr desde el editor, `verificarInstalacion` (revisa la configuración al desplegar) y
`repararNombres` (empareja nombres de archivo si un cambio de número se cortó por la mitad).

## Fuera de alcance

- Subida directa a Drive desde el navegador, sin pasar por Apps Script (eliminaría el límite de tamaño).
- Integración con Mirol, JB2.0, Tokko, Roque o Pilar.
- Edición del evento por quien lo cargó.
- Etiquetas por ambiente.
- Notificaciones.
