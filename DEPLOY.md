# Despliegue en Vercel o Netlify

Este proyecto está listo para desplegarse en **Vercel** o **Netlify**. Sigue los pasos según la plataforma que elijas.

---

## Opción 1: Vercel (recomendado)

### Desde la web (sin instalar nada)

1. **Sube el proyecto a GitHub**
   - Crea un repositorio en [github.com](https://github.com)
   - Sube tu código (o conéctalo desde tu máquina con `git`)

2. **Despliega en Vercel**
   - Entra en [vercel.com](https://vercel.com) e inicia sesión (puedes usar tu cuenta de GitHub)
   - Clic en **"Add New..."** → **"Project"**
   - Importa el repositorio de GitHub
   - Vercel detectará automáticamente que es un proyecto Vite
   - Clic en **"Deploy"**

3. **Listo.** Te dará una URL como `https://tu-proyecto.vercel.app`

### Desde la terminal (con Vercel CLI)

```bash
# Instalar Vercel CLI (una vez)
npm i -g vercel

# En la carpeta del proyecto
cd StartingProject
vercel
```

Sigue las preguntas (login, nombre del proyecto, etc.). Cada vez que hagas `vercel` se desplegará de nuevo.

---

## Opción 2: Netlify

### Desde la web

1. **Sube el proyecto a GitHub** (igual que arriba).

2. **Despliega en Netlify**
   - Entra en [netlify.com](https://netlify.com) e inicia sesión
   - **"Add new site"** → **"Import an existing project"**
   - Conecta GitHub y elige el repositorio
   - Netlify usará el archivo `netlify.toml` del proyecto:
     - **Build command:** `npm run build`
     - **Publish directory:** `dist`
   - Clic en **"Deploy site"**

3. **Listo.** URL tipo `https://nombre-aleatorio.netlify.app`

### Desde la terminal (con Netlify CLI)

```bash
# Instalar Netlify CLI (una vez)
npm i -g netlify-cli

# En la carpeta del proyecto
npm run build
netlify deploy --prod
```

---

## Importante: Cámara y HTTPS

- **HTTPS:** Vercel y Netlify sirven tu sitio por HTTPS. Los navegadores solo permiten acceso a la cámara en páginas seguras (HTTPS), así que en producción funcionará correctamente.
- **Permisos:** Los archivos `vercel.json` y `netlify.toml` ya incluyen los headers necesarios para que el navegador permita usar la cámara.

---

## Variables de entorno (opcional)

Si más adelante quieres guardar el API token en variables de entorno en lugar de en `config.ts`:

- **Vercel:** Proyecto → Settings → Environment Variables
- **Netlify:** Site settings → Build & deploy → Environment variables

En el código tendrías que leer `import.meta.env.VITE_API_TOKEN` (en Vite las variables deben empezar por `VITE_` para exponerse al cliente).

---

## Resumen rápido

| Plataforma | Qué hacer |
|------------|-----------|
| **Vercel** | Conectar repo en GitHub → Import → Deploy |
| **Netlify** | Conectar repo en GitHub → Import → Deploy |

Ambas detectan Vite y usan la configuración del proyecto. Solo necesitas tener el código en GitHub (o en GitLab/Bitbucket si la plataforma lo soporta).
