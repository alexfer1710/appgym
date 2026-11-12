# Gym11 · appgym

App de pesos del Gym Eleven.

PWA móvil para registrar entrenamientos de pesas, consultar el historial y proponer cargas a partir de los registros anteriores. HTML, CSS y JavaScript sin dependencias de ejecución, build ni backend.

Los datos se guardan en IndexedDB en cada instalación. No hay cuentas, perfiles ni sincronización entre dispositivos. El catálogo se puede editar desde la aplicación; las imágenes incluidas permiten usarlo sin conexión.

## Abrir en local

```sh
python3 -m http.server 4173
```

Abre `http://localhost:4173`. Los módulos y el service worker necesitan HTTP(S); no abras `index.html` directamente como archivo.

## Pruebas

Con Node.js 20 o posterior, sin instalar paquetes:

```sh
npm test
```

Las pruebas incluidas usan ejemplos y no necesitan historiales personales. Para comparar opcionalmente las referencias con un proyecto Swift conservado y unas notas históricas locales:

```sh
node tests/compare-swift.mjs /ruta/proyecto-swift /ruta/notas-historicas.json
```

Esa comparación requiere Xcode y compila únicamente una herramienta de prueba temporal. No compila ni instala la app iOS.

## Publicar en GitHub Pages

El repositorio tiene `index.html` y `.nojekyll` en la raíz.

1. En GitHub abre **Settings → Pages**.
2. En **Source**, selecciona **Deploy from a branch**.
3. Selecciona **main** y **/(root)**, y guarda.
4. Abre la URL HTTPS que indique GitHub.

Las rutas relativas permiten alojarla también bajo `/appgym/`.

## Publicar en Cloudflare Pages

Conecta este repositorio y configura:

- Rama de producción: `main`.
- Framework: ninguno.
- Comando de build: vacío.
- Directorio de salida: `.` (raíz del repositorio).

También puedes utilizar una subida directa de los archivos estáticos. Publicar el código en GitHub no activa por sí solo ninguno de los dos alojamientos.

## Instalar en iPhone

1. Abre la URL HTTPS publicada desde Safari.
2. **Compartir → Añadir a pantalla de inicio**, con **Abrir como app web** si aparece.
3. Abre Gym11 desde el icono y espera en Ajustes a **Lista para usar sin conexión**. La primera preparación descarga las ilustraciones, unos 24 MB.
4. Importa tu copia JSON desde Ajustes si tienes registros anteriores.

La sesión activa se guarda tras cada cambio. El cronómetro utiliza marcas de tiempo para reconstruirse al volver de bloquear la pantalla. La app solicita almacenamiento persistente; Safari decide si lo concede. Guarda copias JSON en Archivos periódicamente.

## Perfiles y copias en la nube

Al abrir la app por primera vez se pide el nombre y la inicial del apellido, por ejemplo «Alex F» (sin contraseña). Cualquier nombre nuevo crea su perfil; mayúsculas, acentos y el resto del apellido no cuentan («Alex Fernández» entra en «Alex F»). Los datos se sincronizan con la nube: la última copia del perfil es la versión compartida, así que Safari, el icono de la pantalla de inicio y otros móviles ven lo mismo. Cada dispositivo guarda una copia completa para funcionar sin conexión; los cambios se suben cuando hay internet y las versiones más nuevas de otro dispositivo se descargan al abrir la app (y cada 2 minutos con la app abierta).

- `functions/api/[[path]].js`: API en Cloudflare Pages Functions. `POST /api/login`, `GET|POST /api/profiles/<id>/backups`, `GET /api/profiles/<id>/backups/<fecha|latest>`.
- Las copias se guardan en Workers KV (binding `BACKUPS`: `gym11-backups` en producción, `gym11-backups-preview` en previsualizaciones). Cada copia es una entrada nueva; nunca se sobrescriben.
- `js/cloud.js`: perfil y sincronización (`sync()`), recuperar y cerrar sesión. Cerrar sesión sincroniza y vacía el dispositivo.
- Todo es automático, sin preguntas: si este dispositivo tiene cambios sin subir y la nube tiene una versión más nueva, se fusionan registro a registro (gana la edición más reciente de cada entreno; los entrenos borrados quedan marcados en `settings/deleted-sessions` para que no reaparezcan).
- Un entreno en curso (borrador) nunca se toca al sincronizar.
- Al entrar en un móvil vacío se recupera la última copia. Desde **Ajustes → Recuperar una copia** se puede volver a cualquier copia anterior.

Para probar en local con KV simulado:

```sh
npx wrangler@4 pages dev . --kv BACKUPS
```

## Exportar e importar

En **Ajustes → Exportar copia JSON** se guardan catálogo, entrenos, preferencias y sesión activa. El importador muestra las cantidades antes de confirmar y evita duplicados por identificador. La opción de reemplazar permite actualizar explícitamente entrenos que ya existan.

También acepta exportaciones Swift con `sessions`, `customExercises` y `gripSettings`, o una lista de sesiones codificadas por `JSONEncoder`. Convierte las fechas de Apple (segundos desde 01/01/2001), conserva los pesos decimales y resuelve las identidades antiguas de los ejercicios.

Para extraer los datos de un contenedor descargado del iPhone mediante Xcode, sin modificar ese contenedor:

```sh
python3 tools/extract-swift-container.py /ruta/Gym11.xcappdata /ruta/Gym11-export.json
```

Para el antiguo almacenamiento de Alba, añade `--profile alba`. Después pasa el JSON al iPhone e impórtalo en su instalación de la PWA. Conserva el contenedor y la app Swift hasta comprobar la migración.

Los historiales y las copias personales no forman parte del repositorio. Los entrenos no se envían al alojamiento. Cambiar de dominio crea un almacenamiento distinto: exporta antes e importa después.

## Actualizaciones y offline

El service worker prepara toda la aplicación y sus ilustraciones antes de completar la instalación. Una versión nueva espera y ofrece **Actualizar ahora** en Ajustes. Se aplaza la activación mientras haya un entreno pendiente.

En cada publicación de una versión cambia `VERSION` en `sw.js`; si añades archivos de ejecución, añádelos también a `FILES`. Publica todos los archivos juntos. La actualización elimina las cachés antiguas de Gym11, nunca IndexedDB.

## Estructura

- `index.html`, `styles.css`: interfaz móvil, modo claro y oscuro.
- `js/db.js`: IndexedDB `gym11`, versión 1; almacenes `exercises`, `sessions`, `settings`, `drafts`.
- `js/model.js`: identidad, orden por recientes y referencias de peso.
- `js/app.js`: navegación y flujo de entrenamiento.
- `js/transfer.js`: validación y transferencia de datos.
- `data/catalog.json`: catálogo inicial; se copia una sola vez al almacenamiento editable.
- `assets/`: ilustraciones e iconos.
- `manifest.json`, `sw.js`: instalación y funcionamiento offline.
- `tests/`, `tools/`: pruebas y herramienta de migración.

Las referencias de peso conservan el comportamiento de Swift: última carga positiva para la misma identidad, agarre y polea, excluyendo las entradas posteriores al flag de fatiga del mismo músculo y día. Cada polea tiene un historial independiente.

El acceso a datos está separado de las funciones de cálculo para poder añadir sincronización en el futuro. Antes de hacerlo habrá que definir usuarios, conflictos y eliminaciones; no hay sincronización activa.

Algunas ilustraciones proceden de [RepDB](https://repdb.co). Otras se aportaron al proyecto como imágenes personalizadas.
