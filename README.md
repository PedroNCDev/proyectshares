# ProyectShares

App de colaboración en tiempo real sobre carpetas de código: subís una carpeta, se comparte
con un código, y todos los que entren con ese código pueden ver el árbol de archivos,
abrir y editar archivos, y ver el cursor de los demás en vivo (con su color y nombre).

## Cómo funciona (resumen del flujo)

1. `/index.html` — pedís tu nombre de usuario (se guarda en el navegador).
2. `/home.html` — elegís "Nuevo proyecto" (te abre el explorador, elegís una carpeta y se
   sube entera al servidor) o "Join Proyect" con un código.
3. `/project.html?code=XXXX` — a la izquierda ves el log de actividad y la lista de usuarios
   conectados (click en un nombre muestra su archivo actual); a la derecha el árbol de
   carpetas/archivos y el editor. Al escribir aparece el botón "Guardar".
4. Mientras editás, los demás ven un cuadrado de tu color + tu nombre moviéndose en el mismo
   archivo (no ves tu propio cuadrado, solo el de los demás).

## Correrlo en local

```bash
npm install
npm start
```

Abrí `http://localhost:3000`.

## Subir a GitHub

```bash
git init
git add .
git commit -m "ProyectShares inicial"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/proyectshares.git
git push -u origin main
```

## Desplegar en Railway

1. Entrá a https://railway.app y creá un proyecto nuevo → "Deploy from GitHub repo".
2. Elegí el repo `proyectshares` que acabás de subir.
3. Railway detecta el `package.json` y corre `npm install && npm start` solo.
4. En la pestaña "Settings" → "Networking" generá el dominio público
   (te va a quedar algo como `proyectshares-production.up.railway.app`).
5. Listo: esa URL reemplaza el ejemplo `proyectshares.railway.app` de tu mensaje.

## Limitaciones a tener en cuenta (para siguientes mejoras)

- Los archivos de los proyectos y el log de actividad se guardan en el disco del servidor
  (carpeta `data/`). En Railway, si no agregás un **Volume**, ese disco se reinicia en cada
  redeploy y perderías los proyectos subidos — conviene agregar un volumen persistente
  montado en `/app/data`, o migrar a un storage externo (S3, etc.) más adelante.
- La edición es "el último que guarda, gana" (no hay fusión automática de cambios
  simultáneos como Google Docs) — se ve quién está editando gracias al cursor en vivo,
  pero dos personas guardando el mismo archivo a la vez pueden pisarse.
- El navegador no puede escribir de vuelta en tu carpeta local: el flujo es
  "elegís carpeta → se sube una copia al servidor", que es como después todos la ven y editan.
