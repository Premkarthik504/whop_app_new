import { drizzle } from 'drizzle-orm/vercel-postgres';
import { sql } from '@vercel/postgres';
import * as schema from './schema';

// Initialize Drizzle ORM with Vercel Postgres
export const db = drizzle(sql, { schema });

// Export all schema types
export * from './schema';