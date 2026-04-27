import { useRef, useCallback, useEffect, useMemo } from 'react';

/**
 * Hook mejorado para detectar escaneo de código de barras
 * Los escáneres de código de barras escriben muy rápido (típicamente < 50ms entre caracteres)
 * y terminan con Enter, Tab, o caracteres de terminación configurados
 * Compatible con dispositivos móviles, tablet y PC (Bluetooth y USB)
 */
export const useBarcodeScanner = (onBarcodeScanned, options = {}) => {
  const {
    minLength = 3, // Longitud mínima para considerar código de barras
    maxTimeBetweenChars = 50, // Tiempo máximo entre caracteres (ms) - para USB
    //maxTimeBetweenCharsBluetooth = 150, // Tiempo máximo entre caracteres para Bluetooth (ms) - más largo
    onScanComplete = null, // Callback cuando se completa el escaneo
    autoSubmit = true, // Si debe procesar automáticamente después de detectar
    maxLength = 50, // Longitud máxima esperada para código de barras
    clearInput = true, // Si debe limpiar el input después de escanear
    endCharacter = null, // Carácter de terminación adicional (ej: '\n', '\r', etc.)
    waitForEndChar = true, // Si debe esperar el carácter de terminación antes de procesar
    bluetoothMode = false // Si se detecta automáticamente o se fuerza modo Bluetooth
  } = options;

  const inputRef = useRef(null);
  const lastCharTimeRef = useRef(null);
  const barcodeBufferRef = useRef('');
  const timeoutRef = useRef(null);
  const isProcessingRef = useRef(false); // Prevenir procesamiento múltiple
  const lastInputValueRef = useRef(''); // Para detectar cambios en móviles
  const scanStartTimeRef = useRef(null); // Tiempo de inicio del escaneo
  const isFromScannerRef = useRef(false); // Flag para identificar si viene del escáner
  const ignoreNextInputRef = useRef(false); // Flag para ignorar el próximo evento input (evitar loops)
  const isBluetoothModeRef = useRef(bluetoothMode); // Detectar si es modo Bluetooth
  const consecutiveInputEventsRef = useRef(0); // Contador de eventos input consecutivos (para detectar Bluetooth)
  const lastInputEventTimeRef = useRef(null); // Tiempo del último evento input
  const stableValueTimeoutRef = useRef(null); // Timeout para detectar cuando el valor se estabiliza (Bluetooth)
  const lastStableValueRef = useRef(''); // Último valor estable detectado
  const emergencyStopTimeoutRef = useRef(null); // Timeout para detener automáticamente si hay un loop
  const maxScanDurationRef = useRef(5000); // Duración máxima de un escaneo (5 segundos)
  const isBlockedRef = useRef(false); // Flag para bloquear completamente la entrada
  const eventCountRef = useRef(0); // Contador de eventos para detectar loops
  const lastEventResetTimeRef = useRef(Date.now()); // Tiempo del último reset del contador

  // Caracteres de terminación comunes - memoizado para evitar cambios en cada render
  const endCharacters = useMemo(() => {
    const chars = ['Enter', 'Tab'];
    if (endCharacter) {
      chars.push(endCharacter);
    }
    return chars;
  }, [endCharacter]);

  // Función de emergencia para detener todo (definida primero para evitar problemas de orden)
  const emergencyStop = useCallback(() => {
    // Marcar como bloqueado para prevenir cualquier entrada
    isBlockedRef.current = true;

    // Limpiar todos los timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (stableValueTimeoutRef.current) {
      clearTimeout(stableValueTimeoutRef.current);
      stableValueTimeoutRef.current = null;
    }
    if (emergencyStopTimeoutRef.current) {
      clearTimeout(emergencyStopTimeoutRef.current);
      emergencyStopTimeoutRef.current = null;
    }

    // Resetear todos los estados
    barcodeBufferRef.current = '';
    lastCharTimeRef.current = null;
    lastInputValueRef.current = '';
    scanStartTimeRef.current = null;
    isProcessingRef.current = false;
    isFromScannerRef.current = false;
    ignoreNextInputRef.current = false;
    consecutiveInputEventsRef.current = 0;
    lastStableValueRef.current = '';
    eventCountRef.current = 0;
    lastEventResetTimeRef.current = Date.now();

    // Deshabilitar el input temporalmente si es necesario, pero NO borrar el valor
    if (inputRef.current) {
      inputRef.current.disabled = true;
      inputRef.current.blur(); // Quitar el foco

      // Rehabilitar después de 2 segundos
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.disabled = false;
          isBlockedRef.current = false;
        }
      }, 2000);
    }
  }, []);

  // Función para procesar el código de barras
  const processBarcode = useCallback((barcode) => {
    // Prevenir procesamiento múltiple
    if (isProcessingRef.current) {
      return;
    }

    const trimmedBarcode = barcode.trim();

    // Validar longitud
    if (trimmedBarcode.length < minLength || trimmedBarcode.length > maxLength) {
      // Si no cumple, limpiar pero no procesar
      barcodeBufferRef.current = '';
      lastCharTimeRef.current = null;
      lastInputValueRef.current = '';
      scanStartTimeRef.current = null;
      isFromScannerRef.current = false;
      return;
    }

    if (!onBarcodeScanned) {
      return;
    }

    // Marcar como procesando
    isProcessingRef.current = true;

    // Limpiar todos los timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (emergencyStopTimeoutRef.current) {
      clearTimeout(emergencyStopTimeoutRef.current);
      emergencyStopTimeoutRef.current = null;
    }

    // Limpiar buffer y estado ANTES de procesar
    const barcodeToProcess = trimmedBarcode;
    barcodeBufferRef.current = '';
    lastCharTimeRef.current = null;
    lastInputValueRef.current = '';
    scanStartTimeRef.current = null;
    isFromScannerRef.current = false;

    // Marcar que debemos ignorar el próximo evento input (para evitar loops)
    ignoreNextInputRef.current = true;

    // Limpiar el input ANTES de llamar al callback (evita loops)
    if (clearInput && inputRef.current) {
      inputRef.current.value = '';
    }

    // Llamar al callback
    try {
      onBarcodeScanned(barcodeToProcess);
    } catch (error) {
      console.error('Error en callback de código de barras:', error);
    }

    if (onScanComplete) {
      try {
        onScanComplete(barcodeToProcess);
      } catch (error) {
        console.error('Error en callback de escaneo completo:', error);
      }
    }

    // Resetear flag después de un delay más largo para evitar procesamiento duplicado
    // Más tiempo para Bluetooth - tiempo suficiente para que todos los eventos pendientes terminen
    const resetDelay = 300; // Reducido para ser más responsivo
    setTimeout(() => {
      isProcessingRef.current = false;
      ignoreNextInputRef.current = false;
    }, resetDelay);

  }, [minLength, maxLength, onBarcodeScanned, onScanComplete, clearInput]);

  const handleKeyDown = useCallback((e) => {
    // Si está bloqueado, BLOQUEAR TODO (incluso Escape puede pasar, pero bloqueamos todo lo demás)
    if (isBlockedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Tecla Escape: DETENER TODO (emergencia) - funciona siempre
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      emergencyStop();
      return;
    }

    // Si está procesando, ignorar todos los eventos excepto Escape
    if (isProcessingRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Detectar loops: si hay demasiados eventos en poco tiempo, bloquear
    const now = Date.now();
    if (now - lastEventResetTimeRef.current > 1000) {
      // Resetear contador cada segundo
      eventCountRef.current = 0;
      lastEventResetTimeRef.current = now;
    }

    eventCountRef.current += 1;

    // Si hay más de 50 eventos en 1 segundo, es un loop infinito
    if (eventCountRef.current > 50) {
      console.error('Loop infinito detectado, bloqueando entrada');
      emergencyStop();
      return;
    }

    // Detectar caracteres de terminación (Enter, Tab, o carácter personalizado)
    const isEndCharacter = endCharacters.includes(e.key) ||
      (endCharacter && e.key === endCharacter);

    if (isEndCharacter) {
      e.preventDefault();
      e.stopPropagation();

      // Obtener el valor actual del input (sin el carácter de terminación)
      const currentValue = inputRef.current?.value || barcodeBufferRef.current;
      const trimmedValue = currentValue.trim();

      // Si tenemos un código válido, procesarlo
      if (trimmedValue.length >= minLength && trimmedValue.length <= maxLength) {
        isFromScannerRef.current = true; // Marcar como escaneo
        processBarcode(trimmedValue);
      } else {
        // Si no cumple la longitud mínima, no hacer nada (dejar que el usuario siga escribiendo)
        isFromScannerRef.current = false;
      }
      return;
    }

    // Si es un carácter imprimible (no es tecla especial)
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      const now = Date.now();

      // Si pasó mucho tiempo desde el último carácter, resetear buffer (usuario escribiendo manualmente)
      if (lastCharTimeRef.current && (now - lastCharTimeRef.current) > maxTimeBetweenChars * 5) {
        barcodeBufferRef.current = '';
        scanStartTimeRef.current = null;
        isFromScannerRef.current = false;
      }

      // Si es el primer carácter del escaneo, registrar tiempo de inicio
      if (!scanStartTimeRef.current) {
        scanStartTimeRef.current = now;
        isFromScannerRef.current = true; // Asumir que es escáner si es rápido

        // Configurar timeout de emergencia: si el escaneo dura más de 5 segundos, detener
        if (emergencyStopTimeoutRef.current) {
          clearTimeout(emergencyStopTimeoutRef.current);
        }
        emergencyStopTimeoutRef.current = setTimeout(() => {
          if (scanStartTimeRef.current && (Date.now() - scanStartTimeRef.current) > maxScanDurationRef.current) {
            console.warn('Escaneo demasiado largo detectado, deteniendo automáticamente');
            emergencyStop();
          }
        }, maxScanDurationRef.current);
      }

      // Verificar si el código es demasiado largo (posible loop infinito)
      const currentBufferLength = inputRef.current ? inputRef.current.value.length : barcodeBufferRef.current.length;
      if (currentBufferLength > maxLength * 2) {
        console.warn('Código demasiado largo detectado, deteniendo automáticamente');
        emergencyStop();
        return;
      }

      // Actualizar buffer con el valor actual del input (más confiable)
      if (inputRef.current) {
        barcodeBufferRef.current = inputRef.current.value;
      } else {
        barcodeBufferRef.current += e.key;
      }

      lastCharTimeRef.current = now;

      // Limpiar timeout anterior
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Si alcanzamos la longitud máxima, simplemente no permitir más caracteres en el buffer
      // pero no procesar automáticamente para evitar errores en nombres largos
      if (barcodeBufferRef.current.length >= maxLength) {
        return;
      }

      // Si waitForEndChar es false y autoSubmit es true, usar timeout
      // Si waitForEndChar es true, solo procesar cuando llegue el carácter de terminación
      if (autoSubmit && !waitForEndChar) {
        // Esperar más tiempo para asegurar que todos los caracteres lleguen
        timeoutRef.current = setTimeout(() => {
          const barcode = barcodeBufferRef.current.trim();
          const timeSinceLastChar = Date.now() - lastCharTimeRef.current;

          // Solo procesar si:
          // 1. No se está procesando ya
          // 2. Tiene longitud válida
          // 3. Pasó suficiente tiempo desde el último carácter (asegura que terminó)
          if (!isProcessingRef.current &&
            barcode.length >= minLength &&
            barcode.length <= maxLength &&
            timeSinceLastChar >= maxTimeBetweenChars * 2) {
            processBarcode(barcode);
          }
        }, maxTimeBetweenChars * 3); // Tiempo más largo para asegurar que todos los caracteres lleguen
      }
    }
  }, [maxTimeBetweenChars, minLength, maxLength, autoSubmit, processBarcode, endCharacters, endCharacter, waitForEndChar, emergencyStop]);

  // Manejar cambios en el input (importante para móviles, tablet y lectores Bluetooth/USB)
  // Esta función es CRÍTICA para lectores Bluetooth que envían principalmente eventos input
  const handleInputChange = useCallback((e) => {
    // Si está bloqueado, BLOQUEAR TODO
    if (isBlockedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      return;
    }

    // Si estamos ignorando el próximo evento (para evitar loops), ignorarlo y resetear el flag
    if (ignoreNextInputRef.current) {
      ignoreNextInputRef.current = false;
      lastInputValueRef.current = e.target.value;
      consecutiveInputEventsRef.current = 0;
      if (stableValueTimeoutRef.current) {
        clearTimeout(stableValueTimeoutRef.current);
        stableValueTimeoutRef.current = null;
      }
      lastStableValueRef.current = '';
      return;
    }

    // No bloquear el evento input, dejar que React maneje el estado
    if (isProcessingRef.current) {
      return;
    }

    // Detectar loops: si hay demasiados eventos input en poco tiempo, bloquear
    const now = Date.now();
    if (now - lastEventResetTimeRef.current > 1000) {
      // Resetear contador cada segundo
      eventCountRef.current = 0;
      lastEventResetTimeRef.current = now;
    }

    eventCountRef.current += 1;

    // Si hay más de 50 eventos en 1 segundo, es un loop infinito
    if (eventCountRef.current > 50) {
      console.error('Loop infinito detectado en input, bloqueando entrada');
      emergencyStop();
      return;
    }

    // Limitar la longitud directamente en el input para prevenir loops
    const currentValue = e.target.value;
    if (currentValue.length > maxLength * 2) {
      console.error('Valor demasiado largo detectado, bloqueando entrada');
      emergencyStop();
      return;
    }

    const valueLength = currentValue.length;
    const lastLength = lastInputValueRef.current.length;

    // Solo registramos el valor y el tiempo para escritura manual
    barcodeBufferRef.current = currentValue;
    lastCharTimeRef.current = now;
    lastInputValueRef.current = currentValue;

    // Detectar modo Bluetooth: muchos eventos input consecutivos en poco tiempo
    if (lastInputEventTimeRef.current && (now - lastInputEventTimeRef.current) < 100) {
      consecutiveInputEventsRef.current += 1;
      if (consecutiveInputEventsRef.current >= 2) {
        isBluetoothModeRef.current = true;
      }
    } else {
      consecutiveInputEventsRef.current = 0;
    }
    lastInputEventTimeRef.current = now;

    // ESTRATEGIA PARA USB/LECTORES: Solo si la velocidad es muy alta
    if (valueLength > lastLength) {
      const timeSinceLastChar = lastCharTimeRef.current ? (now - lastCharTimeRef.current) : Infinity;
      const maxTimeThreshold = maxTimeBetweenChars * 2; // Más estricto para evitar falsos positivos

      if (timeSinceLastChar < maxTimeThreshold) {
        isFromScannerRef.current = true;

        if (!scanStartTimeRef.current) {
          scanStartTimeRef.current = now;
        }

        // Limpiar timeout anterior
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        // Solo auto-procesamos si NO estamos esperando un carácter de fin (como Enter)
        // y si la velocidad es de escáner.
        if (autoSubmit && !waitForEndChar && currentValue.length >= minLength) {
          timeoutRef.current = setTimeout(() => {
            const barcode = barcodeBufferRef.current.trim();
            if (!isProcessingRef.current && isFromScannerRef.current && barcode.length >= minLength) {
              processBarcode(barcode);
            }
          }, maxTimeBetweenChars * 3);
        }
      } else {
        // Si la velocidad es normal, reseteamos el flag de escáner
        isFromScannerRef.current = false;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    }
  }, [maxTimeBetweenChars, minLength, autoSubmit, processBarcode, waitForEndChar, emergencyStop, maxLength]);

  // Listener global de Escape para detener en cualquier momento
  useEffect(() => {
    const handleGlobalEscape = (e) => {
      if (e.key === 'Escape' && (isBlockedRef.current || isProcessingRef.current || barcodeBufferRef.current.length > 0)) {
        e.preventDefault();
        e.stopPropagation();
        emergencyStop();
      }
    };

    // Agregar listener global
    window.addEventListener('keydown', handleGlobalEscape, true); // Usar capture phase

    return () => {
      window.removeEventListener('keydown', handleGlobalEscape, true);
    };
  }, [emergencyStop]);

  // Limpiar timeouts al desmontar
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (stableValueTimeoutRef.current) {
        clearTimeout(stableValueTimeoutRef.current);
      }
      if (emergencyStopTimeoutRef.current) {
        clearTimeout(emergencyStopTimeoutRef.current);
      }
    };
  }, []);

  const reset = useCallback(() => {
    emergencyStop(); // Usar la función de emergencia que limpia todo
  }, [emergencyStop]);

  const stop = useCallback(() => {
    emergencyStop(); // Alias para claridad
  }, [emergencyStop]);

  // Agregar atributo maxLength al input para prevenir loops a nivel de DOM
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.setAttribute('maxlength', (maxLength * 2).toString());
    }
  }, [maxLength]);

  return {
    inputRef,
    handleKeyDown,
    handleInputChange,
    reset,
    stop: stop, // Función para detener manualmente
    emergencyStop: emergencyStop // Función de emergencia para detener todo
  };
};
