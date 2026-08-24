import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { type Database } from '../types/database.types'; // Assuming type definitions exist

// 1. Definición del Context
interface AuthContextType {
    user: import('@supabase/supabase-js').Auth.User | null;
    loading: boolean;
    isLoading: boolean;
    supabase: typeof supabase;
    handleSignIn: (email: string, password: string) => Promise<void>;
    handleSignOut: () => Promise<void>;
    // Podrías añadir funciones para registrar o actualizar perfiles aquí
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth debe ser llamado dentro de un AuthProvider');
    }
    return context;
};

// 2. El Proveedor de Contexto
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<import('@supabase/supabase-js').Auth.User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isLoading, setIsLoading] = useState(false); // Para indicar que se está autenticando

    // Escucha los cambios de estado de autenticación de Supabase
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setUser(session?.user ?? null);
        });

        // Función de limpieza
        return () => {
            subscription.unsubscribe();
        };
    }, [supabase]);

    // Función de inicio de sesión
    const handleSignIn = async (email: string, password: string): Promise<void> => {
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
        } catch (error) {
            console.error("Error al iniciar sesión:", error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    // Función de cierre de sesión
    const handleSignOut = async () => {
        setIsLoading(true);
        try {
            await supabase.auth.signOut();
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
        } finally {
            setIsLoading(false);
            setUser(null); // Forzar el estado a nulo
        }
    };

    const value: AuthContextType = {
        user,
        loading,
        isLoading,
        supabase,
        handleSignIn,
        handleSignOut,
    };

    // Este useEffect inicializa el estado de usuario al cargar el componente
    useEffect(() => {
        // Esto se debe ejecutar al montar el proveedor para obtener el estado de sesión persistente
        const checkSession() => {
            supabase.auth.getSession().then(({ session }) => {
                setUser(session?.user ?? null);
                setLoading(false);
            });
        }
        checkSession();
    }, [supabase]);

    return (
        <AuthContext.Provider value={value}>
            {/* Aquí es donde se renderizaría el contenido de la aplicación */}
            {children}
        </AuthContext.Provider>
    );
};