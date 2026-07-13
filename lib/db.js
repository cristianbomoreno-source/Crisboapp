import { Pool } from "pg";

function createPool() {
  const connectionString =
    process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!connectionString) {
    throw new Error(
      "Falta la variable de entorno DATABASE_URL (o POSTGRES_URL). " +
        "Ve el README para crear la base de datos y configurarla."
    );
  }
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
}

// Pool creado de forma diferida (recien en el primer query real), no al
// importar el modulo — asi el build de Next no falla si esta variable de
// entorno todavia no esta configurada en ese momento.
let pool = null;

export async function query(text, params) {
  if (!pool) {
    if (process.env.NODE_ENV !== "production" && global._crisbofilesPool) {
      pool = global._crisbofilesPool;
    } else {
      pool = createPool();
      if (process.env.NODE_ENV !== "production") global._crisbofilesPool = pool;
    }
  }
  return pool.query(text, params);
}
