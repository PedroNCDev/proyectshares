const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DATA_DIR = path.join(__dirname, 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PROJECTS_FILE)) fs.writeFileSync(PROJECTS_FILE, '{}');

function loadProjects() {
  return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
}
function saveProjects(obj) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(obj, null, 2));
}
function genCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}
// Evita path traversal (../../etc) en rutas relativas que vienen del cliente
function safeRelPath(relPath) {
  const parts = relPath.split(/[/\\]+/).filter(p => p && p !== '.' && p !== '..');
  return parts.join('/');
}

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Crear proyecto subiendo una carpeta completa
app.post('/api/projects', upload.array('files'), (req, res) => {
  try {
    const projectName = (req.body.projectName || 'Proyecto').toString().slice(0, 80);
    const paths = JSON.parse(req.body.paths || '[]');
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se recibieron archivos' });
    }
    const code = genCode();
    const projectDir = path.join(DATA_DIR, code);
    fs.mkdirSync(projectDir, { recursive: true });

    req.files.forEach((file, i) => {
      const rel = safeRelPath(paths[i] || file.originalname);
      const dest = path.join(projectDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.buffer);
    });

    const projects = loadProjects();
    projects[code] = { name: projectName, createdAt: Date.now(), activity: [] };
    saveProjects(projects);

    res.json({ code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el proyecto' });
  }
});

// Unirse a un proyecto existente
app.post('/api/projects/:code/join', (req, res) => {
  const projects = loadProjects();
  const code = req.params.code.toUpperCase();
  if (!projects[code]) return res.status(404).json({ error: 'Proyecto no encontrado' });
  res.json({ code, name: projects[code].name });
});

app.get('/api/projects/:code/info', (req, res) => {
  const projects = loadProjects();
  const code = req.params.code.toUpperCase();
  if (!projects[code]) return res.status(404).json({ error: 'Proyecto no encontrado' });
  res.json({ code, name: projects[code].name, activity: projects[code].activity.slice(-50) });
});

// Arbol de archivos del proyecto
app.get('/api/projects/:code/tree', (req, res) => {
  const code = req.params.code.toUpperCase();
  const projectDir = path.join(DATA_DIR, code);
  if (!fs.existsSync(projectDir)) return res.status(404).json({ error: 'Proyecto no encontrado' });

  function walk(dir, relBase) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    // Carpetas primero, despues archivos; cada grupo en orden alfabetico
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return entries.map(entry => {
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        return { name: entry.name, type: 'folder', path: relPath, children: walk(path.join(dir, entry.name), relPath) };
      }
      return { name: entry.name, type: 'file', path: relPath };
    });
  }
  res.json({ tree: walk(projectDir, '') });
});

// Leer contenido de un archivo
app.get('/api/projects/:code/file', (req, res) => {
  const code = req.params.code.toUpperCase();
  const rel = safeRelPath(req.query.path || '');
  const filePath = path.join(DATA_DIR, code, rel);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }
  const content = fs.readFileSync(filePath, 'utf8');
  res.json({ path: rel, content });
});

// Guardar contenido de un archivo
app.post('/api/projects/:code/file', (req, res) => {
  const code = req.params.code.toUpperCase();
  const { path: relRaw, content, username } = req.body;
  const rel = safeRelPath(relRaw || '');
  const filePath = path.join(DATA_DIR, code, rel);
  if (!fs.existsSync(path.dirname(filePath))) {
    return res.status(404).json({ error: 'Ruta invalida' });
  }
  fs.writeFileSync(filePath, content ?? '');

  const projects = loadProjects();
  if (projects[code]) {
    const entry = { user: username || 'Alguien', action: `modifico ${rel}`, time: Date.now() };
    projects[code].activity.push(entry);
    if (projects[code].activity.length > 200) projects[code].activity.shift();
    saveProjects(projects);
    io.to(code).emit('activity-entry', entry);
  }

  io.to(code).emit('file-saved', { path: rel, by: username });
  res.json({ ok: true });
});

// --- Socket.io: presencia + cursores en vivo ---
const presence = {}; // { code: { socketId: { username, color, file, x, y } } }

io.on('connection', socket => {
  socket.on('join-project', ({ code, username, color }) => {
    code = (code || '').toUpperCase();
    socket.join(code);
    socket.data.code = code;
    socket.data.username = username;
    socket.data.color = color;

    if (!presence[code]) presence[code] = {};
    presence[code][socket.id] = { username, color, file: null, x: 0, y: 0 };
    io.to(code).emit('users-update', Object.values(presence[code]));
  });

  socket.on('content-change', ({ file, content }) => {
    const code = socket.data.code;
    if (!code || !file) return;
    socket.to(code).emit('content-update', {
      file, content,
      username: socket.data.username
    });
  });

  socket.on('cursor-move', ({ file, x, y }) => {
    const code = socket.data.code;
    if (!code || !presence[code] || !presence[code][socket.id]) return;
    presence[code][socket.id].file = file;
    presence[code][socket.id].x = x;
    presence[code][socket.id].y = y;
    socket.to(code).emit('cursor-update', {
      id: socket.id,
      username: socket.data.username,
      color: socket.data.color,
      file, x, y
    });
    io.to(code).emit('users-update', Object.values(presence[code]));
  });

  // Edicion en vivo: reenvia el contenido a los demas que tengan el mismo archivo abierto
  socket.on('content-change', ({ file, content }) => {
    const code = socket.data.code;
    if (!code) return;
    socket.to(code).emit('content-change', { file, content, username: socket.data.username });
  });

  // Chat del proyecto (texto normal o un "boton" de compartir direccion de archivo)
  socket.on('chat-message', ({ text, type, filePath }) => {
    const code = socket.data.code;
    if (!code) return;
    const msg = {
      username: socket.data.username,
      type: type === 'file' ? 'file' : 'text',
      text: type === 'file' ? (filePath || '') : String(text || '').slice(0, 500),
      time: Date.now()
    };
    io.to(code).emit('chat-message', msg);
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    if (code && presence[code]) {
      delete presence[code][socket.id];
      io.to(code).emit('users-update', Object.values(presence[code]));
      io.to(code).emit('cursor-left', { id: socket.id });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`ProyectShares corriendo en puerto ${PORT}`));
