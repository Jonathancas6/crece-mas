import React from 'react';
import { motion } from 'framer-motion';
import { ShieldOff, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Pantalla amigable que se muestra cuando un empleado intenta
 * acceder a una sección para la que no tiene permisos.
 */
const SinPermisos = ({ mensaje = 'No tienes acceso a esta sección.' }) => {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '2rem',
        textAlign: 'center',
        gap: '1.2rem'
      }}
    >
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'var(--bg-secondary, #f3f4f6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary, #9ca3af)'
        }}
      >
        <ShieldOff size={36} />
      </motion.div>

      <div>
        <h2 style={{
          margin: 0,
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--text-primary, #111827)'
        }}>
          Acceso restringido
        </h2>
        <p style={{
          marginTop: '0.5rem',
          color: 'var(--text-secondary, #6b7280)',
          fontSize: '0.95rem',
          maxWidth: 320
        }}>
          {mensaje}
        </p>
        <p style={{
          marginTop: '0.25rem',
          color: 'var(--text-tertiary, #9ca3af)',
          fontSize: '0.82rem'
        }}>
          Si crees que esto es un error, habla con el administrador del negocio.
        </p>
      </div>

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => navigate('/empleado')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.6rem 1.4rem',
          borderRadius: 10,
          border: '1.5px solid var(--border-color, #e5e7eb)',
          background: 'var(--bg-card, #fff)',
          color: 'var(--text-primary, #111827)',
          fontWeight: 600,
          fontSize: '0.9rem',
          cursor: 'pointer'
        }}
      >
        <ArrowLeft size={16} />
        Ir al inicio
      </motion.button>
    </motion.div>
  );
};

export default SinPermisos;
