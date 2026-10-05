# Plantilla del informe para el propietario

El informe se arma a partir de un documento de **Google Docs** que funciona como molde. Cada vez que alguien
toca "Generar informe", la app:

1. hace una copia de la plantilla,
2. reemplaza los **marcadores** (textos entre llaves dobles, como `{{DIRECCION}}`),
3. inserta los eventos elegidos con sus fotos,
4. exporta la copia a **Word (.docx)** y la guarda en `Historial/<id>/_Informes/`.

La plantilla la puede retocar marketing cuando quiera, **sin tocar el código**: logo, textos fijos, tipografía,
colores, márgenes. Lo único que no hay que romper son los marcadores.

---

## Cómo crearla

Logueado como `mantenimiento@juarezbeltran.com.ar`:

1. Entrá a <https://docs.google.com> y creá un documento en blanco.
2. Ponele de nombre **Plantilla Informe Propietario**.
3. **Archivo → Configuración de página**: tamaño **A4**, orientación vertical, márgenes de **2 cm**.
4. Armá el contenido como se indica abajo.
5. Copiá el ID del documento de la URL y pegalo en `TEMPLATE_DOC_ID` (ver `apps-script/DEPLOY.md`, Paso 3).

No hace falta compartir la plantilla con nadie: la usa la app, que corre como `mantenimiento@`.

---

## Marcadores

Escribilos **exactamente** así, con las llaves dobles y en mayúsculas. Lo más seguro es copiarlos y pegarlos de acá.

| Marcador               | Se reemplaza por                                                    | Dónde puede ir               |
|------------------------|---------------------------------------------------------------------|------------------------------|
| `{{DIRECCION}}`        | Dirección de la propiedad                                           | Cuerpo, encabezado o pie     |
| `{{ID}}`               | ID de la propiedad, con 4 cifras (por ejemplo `0057`)               | Cuerpo, encabezado o pie     |
| `{{PERIODO}}`          | Fecha del evento más antiguo al más reciente de los elegidos        | Cuerpo, encabezado o pie     |
| `{{CANTIDAD_EVENTOS}}` | Cantidad de eventos incluidos                                       | Cuerpo, encabezado o pie     |
| `{{FECHA_EMISION}}`    | Fecha en que se genera el informe (DD/MM/AAAA)                      | Cuerpo, encabezado o pie     |
| `{{CONTENIDO}}`        | Los eventos elegidos, con sus fotos                                 | **Solo en el cuerpo**        |

Reglas para `{{CONTENIDO}}`:

- Tiene que estar **solo en su renglón**, sin otro texto al lado.
- **No** lo pongas adentro de una tabla ni de una lista con viñetas.
- Va una sola vez.
- Todo lo que escribas **antes** queda arriba de los eventos (la portada). Todo lo que escribas **después** queda al final (por ejemplo, un cierre o una firma).

---

## Contenido sugerido

### Encabezado

**Insertar → Encabezados y pies de página → Encabezado.**

- A la izquierda, el logo de JB en azul: **Insertar → Imagen → Subir desde el ordenador** y elegí `logo-jb-azul.png`
  (está en la raíz de este repo). Un ancho de unos 5 cm queda bien.
- A la derecha, en gris y chico: `Emitido el {{FECHA_EMISION}}`

No tildes **"Primera página diferente"**: los marcadores que queden en ese encabezado especial no se reemplazan.

### Cuerpo

```
Informe de estado · Propiedad {{DIRECCION}}          (estilo: Título 1)

ID de la propiedad: {{ID}}
Período: {{PERIODO}}
Eventos incluidos: {{CANTIDAD_EVENTOS}}

{{CONTENIDO}}
```

### Pie de página

**Insertar → Encabezados y pies de página → Pie de página.**

- Los datos de contacto de la firma (dirección, teléfono, mail, web), en gris y chico.
- La numeración: **Insertar → Números de página**. El número de página solo se puede poner desde acá;
  la app no lo agrega.

---

## Qué inserta la app por cada evento

En orden cronológico, por cada evento elegido:

| Qué                                                        | Estilo que usa                         |
|------------------------------------------------------------|----------------------------------------|
| Título: `15/03/2026 · Ingreso · Ingreso Pérez`             | **Título 2**                           |
| `Origen: inquilino`                                        | Texto normal ("Origen:" en negrita)    |
| `Responde al reclamo del 02/07/2026: Humedad baño` (solo reparaciones con reclamo vinculado) | Texto normal, cursiva |
| Notas del evento                                           | Texto normal                           |
| Fotos en grilla de 2 columnas, con pie `Foto 1 de 6`       | Tabla sin bordes; pie chico y gris     |
| `Video: nombre-del-archivo.mp4`, sin link                  | Texto normal                           |

Los eventos marcados como **no visibles para el propietario** no se pueden elegir, así que ni ellos ni sus notas
aparecen nunca en el informe.

Las fotos van en una versión reducida (unos 1000 píxeles de ancho) para que el Word no quede inmanejable.
Los originales en Drive no se tocan.

---

## Tipografía y colores

La app no impone tipografía: usa los **estilos de la plantilla**. Para que el informe salga con la imagen de JB,
definí estos tres estilos en la plantilla:

1. **Texto normal.** Escribí un renglón, dale la tipografía y el tamaño que quieras (por ejemplo Arial 10,5, color `#142033`),
   dejá el cursor ahí y andá a **Formato → Estilos de párrafo → Texto normal → Actualizar "Texto normal" para que coincida**.
2. **Título 1** (el título del informe). Por ejemplo 20 pt, negrita, azul JB `#10295a`. Mismo procedimiento con **Título 1**.
3. **Título 2** (el título de cada evento). Por ejemplo 13 pt, negrita, azul JB `#10295a`, con un poco de espacio arriba.
   Mismo procedimiento con **Título 2**.

Después podés borrar los renglones de prueba: los estilos quedan guardados en el documento.

Sobre la tipografía: el informe termina en **Word**. Si usás una fuente que la computadora del propietario no tiene
(por ejemplo Inter), Word la reemplaza por otra. Para que se vea igual en todos lados, conviene **Arial** o **Calibri**.

Criterio general: sobrio, mucho blanco, sin adornos.

---

## Cómo probarla

1. Cargá una propiedad de prueba con dos o tres eventos y algunas fotos.
2. Generá el informe desde el historial y abrí el Word.
3. Si algo no te gusta (tamaños, espacios, logo), retocá **la plantilla** y generá de nuevo. No hace falta publicar nada.

Si en el Word queda escrito un marcador sin reemplazar (por ejemplo `{{DIRECCION}}`), está mal tipeado en la plantilla
o quedó en un encabezado de "primera página diferente".
