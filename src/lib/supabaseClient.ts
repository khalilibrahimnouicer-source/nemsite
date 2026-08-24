import { createClient } from '@supabase/supabase-js';

/**
 * Inicializa y exporta el cliente de Supabase.
 * Asegura que se lean las credenciales del entorno local.
 * @returns {any} El cliente de Supabase inicializado.
 */
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Error: Supabase URL or Anon Key not found in environment variables.");
    // Devuelve un cliente nulo o simulado para evitar fallos en tiempo de ejecución
    // en modo desarrollo si las variables de entorno no están cargadas.
    throw new Error("Supabase credentials missing.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);