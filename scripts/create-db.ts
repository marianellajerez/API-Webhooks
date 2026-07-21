import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'admin',
  password: 'admin',
  database: 'postgres', // Conectamos a la base por defecto
});

async function createDatabase() {
  try {
    const dbName = 'sistema_documento';
    
    // Verificar si la base ya existe
    const check = await pool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (check.rowCount === 0) {
      console.log(`Base de datos ${dbName} no existe. Creando...`);
      await pool.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Base de datos ${dbName} creada exitosamente`);
    } else {
      console.log(`✅ Base de datos ${dbName} ya existe`);
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error al crear la base de datos:', error);
    process.exit(1);
  }
}

createDatabase();