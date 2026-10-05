# Biprop · Puesta en marcha (Google)

Biprop es el archivador de fotos y videos de las propiedades, ordenado por evento. Corre sobre
**Google Apps Script + Google Sheets + Google Drive**, igual que Pipeline ACM:

- Cada persona entra con **su cuenta de Google del dominio `juarezbeltran.com.ar`**. No hay usuario ni contraseña propios.
- Los datos quedan en **una planilla de Google Sheets** y los archivos en la carpeta **`Historial`**, las dos en el Drive de `mantenimiento@juarezbeltran.com.ar`.
- **Respaldo automático diario** de la planilla.
- Funciona en **celular** (navegador o "Agregar a pantalla de inicio").
- No hace falta servidor ni pagar hosting.

> **Importante:** hacé todos los pasos **logueado como `mantenimiento@juarezbeltran.com.ar`**, para que la
> planilla, las carpetas y los archivos queden dentro de ese Drive. Conviene usar una ventana de incógnito
> con esa sola cuenta abierta, así Google no mezcla sesiones.

---

## Archivos de esta carpeta

| Archivo            | Qué es                                                              |
|--------------------|---------------------------------------------------------------------|
| `Code.gs`          | Backend: permisos, planilla, Drive, subida de archivos, informe      |
| `Index.html`       | La app (pantallas, estilos y lógica en un solo archivo)              |
| `appsscript.json`  | Configuración (permisos que pide y acceso por dominio)               |

---

## Paso 1 · Crear la planilla

1. Entrá a <https://sheets.google.com> como `mantenimiento@`.
2. Creá una planilla nueva y ponele de nombre **Historial Multimedia · Base**.
3. Mirá la URL. El **ID** es la parte del medio:
   `https://docs.google.com/spreadsheets/d/`**`ESTE_ES_EL_ID`**`/edit`
4. Copiá ese ID. No hace falta crear hojas ni columnas: la app arma sola `Propiedades`, `Eventos` y `Log`.

---

## Paso 2 · Crear la carpeta Historial

1. Entrá a <https://drive.google.com> con la misma cuenta.
2. En **Mi unidad** (la raíz), creá una carpeta que se llame **Historial**.
3. Abrila y mirá la URL. El **ID** es lo que viene después de `folders/`:
   `https://drive.google.com/drive/folders/`**`ESTE_ES_EL_ID`**
4. Copiá ese ID.

---

## Paso 3 · Crear la plantilla del informe

1. Seguí las instrucciones de [`plantilla-informe/INSTRUCCIONES.md`](../plantilla-informe/INSTRUCCIONES.md)
   para armar el documento **Plantilla Informe Propietario** en Google Docs.
2. Abrilo y copiá su **ID** de la URL:
   `https://docs.google.com/document/d/`**`ESTE_ES_EL_ID`**`/edit`

---

## Paso 4 · Crear el proyecto de Apps Script

1. Entrá a <https://script.google.com> con la misma cuenta.
2. **Nuevo proyecto**. Arriba a la izquierda, cambiale el nombre a **Biprop**.
3. Borrá el contenido del archivo `Código.gs` que viene por defecto y pegá **todo** el contenido de `Code.gs` de esta carpeta.
4. En la parte de arriba del código, completá:
   - `const SHEET_ID = '...'` → el ID del Paso 1.
   - `const ROOT_FOLDER_ID = '...'` → el ID del Paso 2.
   - `const TEMPLATE_DOC_ID = '...'` → el ID del Paso 3.
   - Revisá las listas `ADMINS` y `BORRAN` (ya vienen cargadas como se definió).
5. Creá el archivo HTML:
   - Botón **+** al lado de "Archivos" → **HTML** → nombralo exactamente **`Index`** (sin `.html`).
   - Borrá lo que trae y pegá **todo** el contenido de `Index.html` de esta carpeta.
6. Mostrá el manifiesto y pegá la configuración:
   - Rueda de **Configuración del proyecto** (⚙️) → tildá **"Mostrar el archivo de manifiesto appsscript.json"**.
   - Volvé al editor, abrí `appsscript.json` y reemplazá su contenido por el de esta carpeta.
7. Guardá todo (Ctrl+S).
8. Arriba, en el desplegable de funciones, elegí **`verificarInstalacion`** y tocá **Ejecutar** (▶).
   - La primera vez te pide **autorizar permisos**: aceptá con la cuenta `mantenimiento@`
     (leer tu email, trabajar con tu Drive, tus planillas y documentos, y conectarse a Google para exportar a Word).
   - Abajo, en **Registro de ejecución**, tienen que aparecer renglones que empiezan con `OK`.
     Si alguno empieza con `MAL`, casi siempre hay un ID mal pegado: corregilo y volvé a ejecutar.
     Uno de los renglones es una **prueba de escritura en la planilla**: si ese sale `MAL`, no sigas y avisá.
     Un renglón con `OJO` sobre la carpeta compartida es normal en este momento: se resuelve en el Paso 6.

---

## Paso 5 · Publicar como aplicación web

1. Arriba a la derecha: **Implementar → Nueva implementación**.
2. En el engranaje elegí el tipo **Aplicación web**.
3. Configurá:
   - **Descripción:** `Biprop`
   - **Ejecutar como:** *Yo* (`mantenimiento@juarezbeltran.com.ar`).
   - **Quién tiene acceso:** *Cualquier usuario de Juárez Beltrán* (el dominio).
4. **Implementar**.
5. Te da una **URL** que termina en `/exec`. **Esa es la app.** Guardala: la vas a usar en el Paso 9.

> Cada vez que cambies el código, entrá a **Implementar → Gestionar implementaciones → (lápiz) → Versión: Nueva → Implementar**
> para publicar la actualización en la misma URL. Si creás una implementación nueva, cambia la URL.

---

## Paso 6 · Compartir la carpeta Historial con el dominio

Esto hace que las miniaturas y los links de la app le funcionen a cualquiera de JB, y que cualquiera pueda
navegar las carpetas desde Drive, **sin poder borrar ni modificar nada**.

1. En Drive, clic derecho sobre la carpeta **Historial** → **Compartir** → **Compartir**.
2. En **Acceso general**, cambiá "Restringido" por **Juárez Beltrán**.
3. A la derecha, dejá el rol en **Lector**.
4. **Listo**.

No agregues personas como "Editor": la única cuenta que escribe es `mantenimiento@`, a través de la app.

---

## Paso 7 · Probar

Hacé esta prueba completa antes de avisarle a nadie. Usá una cuenta que esté en la lista `BORRAN`
(por ejemplo `mjuarez@`), porque hay que borrar y restaurar.

1. Abrí la URL `/exec`. Arriba a la derecha tiene que aparecer tu email y tu rol.
2. **Cargar evento** → tildá **"Es una propiedad nueva"**: la app propone el ID **5000**. Escribí una dirección de prueba.
3. Completá tipo, descripción y origen, elegí **3 fotos** y guardá.
4. Revisá que:
   - En Drive exista `Historial/5000/` con una carpeta `AAAA-MM-DD_TIPO_Descripcion` y adentro las 3 fotos renombradas más `evento.json`.
   - En la planilla haya una fila nueva en `Propiedades` y otra en `Eventos`.
   - En el historial de la propiedad se vean las miniaturas.
5. Desde el historial, **Informe para propietario** → tildá el evento → **Generar informe**. Abrí el Word y revisá cómo quedó.
6. **Probá el informe con muchas fotos** (un evento de 30 o 40): es lo más pesado que hace la app. Fijate cuánto tarda y cuánto pesa el archivo.
7. **Borrá el evento** (pide confirmación con el nombre). Tiene que desaparecer de la planilla y la carpeta ir a la papelera de Drive.
8. **Borrá la propiedad**. Tiene que desaparecer de la app y la carpeta pasar a `Historial/_Papelera/5000/`.
9. Entrá a **Papelera** y **restaurala**. Tiene que volver a `Historial/5000/`.
10. Pedile a alguien que **no** sea administrador que entre desde su celular y cargue un evento con fotos sacadas en el momento.
    Verificá que no le aparezcan los botones de editar ni de borrar, y que vea las miniaturas (en iPhone pueden tardar un segundo más).
11. Probá el límite de tamaño: elegí un video de más de 30 MB. La app tiene que avisar que es demasiado grande y subir el resto igual.

Cuando termines, borrá la propiedad de prueba. Si querés que no quede ni en la papelera de la app, borrá a mano
la carpeta `Historial/_Papelera/5000/` en Drive y su fila en la hoja `Propiedades`.

---

## Paso 8 · Activar el respaldo automático diario

1. En el editor de Apps Script, elegí en el desplegable de funciones **`installDailyBackup`**.
2. Tocá **Ejecutar** (▶). Autorizá si lo pide.
3. Listo: queda programado un respaldo diario (~03:00) en la carpeta **`Historial Multimedia · Respaldos`**,
   al lado de la planilla (copia de la planilla + un JSON; conserva los últimos 30 días).

> Para probarlo en el momento, ejecutá la función **`dailyBackup`** una vez y revisá la carpeta.

El respaldo es de la **planilla**. Las fotos y videos ya están en Drive, y cada carpeta de evento tiene su
`evento.json` con todos los datos, por si alguna vez hubiera que reconstruir la planilla.

---

## Paso 9 · Página de acceso (GitHub Pages)

Sirve para tener un link fácil de recordar y para que el ícono en el celular sea el de JB.

1. En el repo, abrí el `index.html` de la **raíz** y reemplazá `PEGAR_AQUI_LA_URL_DE_LA_APP` por la URL `/exec` del Paso 5. Guardá y subí el cambio.
2. En GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
3. En un par de minutos queda disponible **https://majaxu.github.io/Biprop/**, que redirige a la app.

El ícono de la pestaña del navegador y el logo de JB de la barra azul de la app también salen de ahí
(`favicon-32.png` y `logo-jb-blanco.png`). Hasta que esta página esté publicada, la barra muestra solo el nombre "Biprop".

Si el repo no se llama `Biprop` o no está en la cuenta `Majaxu`, cambiá la constante `FAVICON_URL` en `Code.gs`
y la dirección del logo en `Index.html` (buscá `logoJB`).

---

## En el celular

Para que quede un ícono de JB como si fuera una app:

1. En el celular, abrí **https://majaxu.github.io/Biprop/?instalar** (con `?instalar` al final: esa página no redirige).
2. **iPhone (Safari):** botón Compartir → **"Agregar a inicio"**.
   **Android (Chrome):** menú ⋮ → **"Agregar a la pantalla principal"**.
3. Listo. Al tocar el ícono se abre la app. La primera vez pide iniciar sesión con la cuenta del dominio.

---

## Preguntas frecuentes

**¿Quién puede hacer qué?**
Cualquiera del dominio ve todo, crea propiedades y carga eventos. Los de la lista `ADMINS` además editan y generan
el informe. Los de la lista `BORRAN` además borran y restauran. Las listas están arriba de todo en `Code.gs`;
si las cambiás, hay que publicar una versión nueva (ver nota del Paso 5).

**Cargué un evento y me equivoqué. ¿Lo puedo corregir?**
Quien carga no puede editar después. Pedile a un administrador.

**¿Qué pasa con los videos grandes?**
Cada archivo puede pesar hasta 30 MB (constante `MAX_ARCHIVO_MB`). Lo que pesa más se sube a mano a la carpeta del
evento en Drive. Ojo: como el resto del dominio es solo Lector, **a mano solo puede subir quien entre a Drive como
`mantenimiento@`**. La próxima vez que alguien abra el historial de esa propiedad, el archivo aparece solo.

**Empecé a cargar un evento y se cortó. ¿Puedo terminar de subir las fotos?**
Sí, desde la misma pantalla con "Reintentar los que fallaron". Quien creó el evento tiene 2 horas para terminar de
subir sus archivos (constante `HORAS_DE_CARGA`). Si cerró la pantalla, las fotos que falten las agrega un administrador
con "Editar".

**Cambié el número de una propiedad y dio error a la mitad.**
Solo puede pasar con propiedades de cientos de archivos. Los datos quedan bien (la propiedad ya tiene el número nuevo),
pero algunos archivos pueden conservar el prefijo viejo en el nombre. Para emparejarlos, ejecutá la función
**`repararNombres`** desde el editor de Apps Script. Se puede correr las veces que haga falta.

**Subí un archivo de menos de 30 MB y falló igual.**
Puede pasar con conexiones lentas o cortes. La pantalla ofrece "Reintentar los que fallaron". Si un tamaño en
particular falla siempre, bajá `MAX_ARCHIVO_MB` a 25 y publicá una versión nueva.

**¿Dónde están los datos?**
En la planilla `Historial Multimedia · Base`. Se puede abrir y filtrar, pero **no cambies el orden ni el nombre de las
columnas** y evitá editar filas a mano: la app y Drive tienen que coincidir.

**¿Se puede renombrar o mover carpetas a mano en Drive?**
Mejor no. La app encuentra cada carpeta por su link, así que no se rompe, pero los nombres dejan de coincidir con la planilla.
Lo único pensado para hacer a mano es **agregar** archivos grandes a la carpeta de un evento.

**Entro y me dice que no tengo acceso, o se queda en blanco.**
Casi siempre es porque el navegador tiene abierta otra cuenta de Google además de la del dominio. Probá en una ventana
de incógnito, entrando solo con la cuenta `@juarezbeltran.com.ar`.

**¿Cuánto cuesta?**
$0 dentro de los límites gratuitos de Google Apps Script. El espacio que ocupan las fotos sí cuenta contra el
almacenamiento de la cuenta `mantenimiento@`.
