import 'dotenv/config';
import express, { Request, Response } from 'express';

const app = express();
const PORT: number = parseInt(process.env.PORT || '3000', 10);

// Ruta principal: cuando alguien visite "/"
app.get('/', (req: Request, res: Response) => {
  res.send('¡Hola Mundo! Tu servidor Express con TypeScript está funcionando.');
});

// Ruta con parámetro: cuando alguien visite "/saludo?nombre=alguien"
app.get('/saludo', (req: Request, res: Response) => {
  const nombre: string = typeof req.query.nombre === 'string' ? req.query.nombre : 'mundo';
  res.send(`¡Bienvenido al mundo de Express con TypeScript, ${nombre}!`);
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});