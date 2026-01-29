# Subir proyecto a GitHub (usuario: Perroloco3000)

Sigue estos pasos **en orden**. Ejecuta los comandos en la terminal (PowerShell o CMD) dentro de la carpeta del proyecto:  
`c:\Users\Promiley\Desktop\projects\camera-kit-app\StartingProject`

---

## Paso 1: Crear el repositorio en GitHub

1. Entra en **https://github.com** e inicia sesión con tu cuenta (**Perroloco3000**).
2. Clic en el **+** (arriba derecha) → **New repository**.
3. Rellena:
   - **Repository name:** por ejemplo `camera-kit-app` (o el nombre que quieras).
   - **Description:** opcional, ej. "Camera Kit Web - Lens test".
   - **Public**.
   - **No** marques "Add a README", "Add .gitignore" ni "Choose a license" (el proyecto ya tiene archivos).
4. Clic en **Create repository**.
5. **Copia la URL del repositorio** que te muestra GitHub, algo como:
   - `https://github.com/Perroloco3000/camera-kit-app.git`

---

## Paso 2: Abrir terminal en la carpeta del proyecto

Abre PowerShell o CMD y ve a la carpeta del proyecto:

```powershell
cd "c:\Users\Promiley\Desktop\projects\camera-kit-app\StartingProject"
```

---

## Paso 3: Inicializar Git y configurar tu usuario (solo la primera vez)

```powershell
git init
git config user.name "Perroloco3000"
git config user.email "perrosdemilp@gmail.com"
```

*(Si ya tienes Git configurado globalmente, puedes saltar la parte de `user.name` y `user.email`.)*

---

## Paso 4: Añadir archivos y primer commit

```powershell
git add .
git status
```

Revisa que no aparezcan archivos que no quieras subir (por ejemplo `.pem`). Luego:

```powershell
git commit -m "Primer commit: Camera Kit Web con Lens"
```

---

## Paso 5: Conectar con GitHub y subir

Sustituye `TU-URL-DEL-REPO` por la URL que copiaste en el Paso 1 (ej: `https://github.com/Perroloco3000/camera-kit-app.git`):

```powershell
git branch -M main
git remote add origin https://github.com/Perroloco3000/TU-REPOSITORIO.git
git push -u origin main
```

**Ejemplo** si el repo se llama `camera-kit-app`:

```powershell
git remote add origin https://github.com/Perroloco3000/camera-kit-app.git
git push -u origin main
```

Te pedirá **usuario y contraseña**:
- Usuario: **Perroloco3000**
- Contraseña: ya **no** es la de tu cuenta de GitHub. Debes usar un **Personal Access Token (PAT)**.

---

## Paso 6: Crear un Personal Access Token (si Git pide contraseña)

1. En GitHub: **Settings** (tu foto) → **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
2. **Generate new token (classic)**.
3. **Note:** por ejemplo "Subir camera-kit-app".
4. **Expiration:** 90 days o No expiration (según prefieras).
5. Marca al menos: **repo** (acceso a repositorios).
6. **Generate token**.
7. **Copia el token** (solo se muestra una vez).
8. Cuando Git pida **Password**, pega ese **token** (no tu contraseña de GitHub).

---

## Resumen de comandos (después de crear el repo en GitHub)

```powershell
cd "c:\Users\Promiley\Desktop\projects\camera-kit-app\StartingProject"
git init
git config user.name "Perroloco3000"
git config user.email "perrosdemilp@gmail.com"
git add .
git commit -m "Primer commit: Camera Kit Web con Lens"
git branch -M main
git remote add origin https://github.com/Perroloco3000/NOMBRE-DE-TU-REPO.git
git push -u origin main
```

Sustituye `NOMBRE-DE-TU-REPO` por el nombre real del repositorio que creaste.
