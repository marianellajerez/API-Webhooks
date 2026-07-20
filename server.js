const express = require('express');
const app = express();
const PORT = 3000;

// Ruta principal: cuando alguien visite "/"
app.get('/', (req, res) => {
  res.send('¡Hola Mundo! Tu servidor Express está funcionando.');
});

// Ruta con parámetro: cuando alguien visite "/saludo?nombre=alguien"
app.get('/saludo', (req, res) => {
  const nombre = req.query.nombre || 'terricola';
  res.send(`¡Bienvenido al mundo de Express, ${nombre}!`);
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});