import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import RouterComponent from './RouterComponent';
import { App as AppComponent } from './App'; // Exportation del App original o un componente cliente aquí

/**
 * Componente wrapper que envuelve toda la aplicación con el Context Provider.
 * Esto asegura que todos los componentes hijos tengan acceso al estado de autenticación y al cliente de Supabase.
 */
const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { loading, user, supabase } = useAuth();

    // 1. Mostrar cargando mientras se verifica la sesión
    if (loading) {
        return <div className="loading-state">Chargement de la connexion à la base de données et de l'état utilisateur...</div>;
    }

    // 2. Redirección basada en el estado de autenticación
    // Si el usuario está autenticado, el contenido debería ser el dashboard del dueño.
    if (user) {
        // Aquí se debería manejar la redirección lógica completa.
        // Por ahora, simulamos el Dashboard con el componente Owner
        // Esto requiere importar el componente Owner y passarle las props necesarias.
        // Dado que no tenemos el componente Owner importado directamente aquí,
        // usaremos un componente placeholder para indicar la lógica.
        console.log("Usuario autenticado detectado. Redireccionando al Dashboard.");
        // En un entorno real: return <Owner />;
        return <div className="owner-placeholder">Bienvenue Propriétaire! (Accès Dashboard)</div>;
    }

    // 3. Si no hay usuario, mostrar la aplicación pública normal
    return <>{children}</>;
};

// Componente principal que exporta el proveedor
const App: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <AuthProvider>
        <AppWrapper>{children}</AppWrapper>
    </AuthProvider>
);

export default App;