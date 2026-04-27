const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, 'src/components/forms/ImportarProductosCSV.js');
let jsContent = fs.readFileSync(jsPath, 'utf8');

// 1. Inject state
const stateRegex = /const \[productosRevision, setProductosRevision\] = useState\(\[\]\);/;
const stateReplace = `const [productosRevision, setProductosRevision] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [sortConfig, setSortConfig] = useState({ key: '__rowNumber', direction: 'asc' });`;

if (stateRegex.test(jsContent)) {
  jsContent = jsContent.replace(stateRegex, stateReplace);
  console.log("State injected");
} else {
  console.log("State regex not matched");
}

// 2. Inject useMemo before resetState
const resetStateRegex = /const resetState = \(\) => \{/;
const useMemoLogic = `const productosRevisionFiltrados = React.useMemo(() => {
    let filtrados = productosRevision;
    
    if (filtroEstado !== 'todos') {
      filtrados = filtrados.filter(prod => {
        const erroresProducto = inconsistencias.filter(inc => inc.fila === prod.__rowNumber);
        const tieneError = erroresProducto.length > 0;
        const tieneAdvertencia = !tieneError && prod.__advertenciaStock;
        
        if (filtroEstado === 'errores') return tieneError;
        if (filtroEstado === 'advertencias') return tieneAdvertencia;
        if (filtroEstado === 'validos') return !tieneError && !tieneAdvertencia;
        return true;
      });
    }

    if (sortConfig.key) {
      filtrados = [...filtrados].sort((a, b) => {
        if (sortConfig.key === 'errores') {
          const aErrores = inconsistencias.some(inc => inc.fila === a.__rowNumber) ? 2 : (a.__advertenciaStock ? 1 : 0);
          const bErrores = inconsistencias.some(inc => inc.fila === b.__rowNumber) ? 2 : (b.__advertenciaStock ? 1 : 0);
          return sortConfig.direction === 'asc' ? aErrores - bErrores : bErrores - aErrores;
        }

        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        
        if (valA === undefined || valA === null) valA = '';
        if (valB === undefined || valB === null) valB = '';
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtrados;
  }, [productosRevision, filtroEstado, sortConfig, inconsistencias]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
    return <span style={{ marginLeft: '4px' }}>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  const resetState = () => {`;

if (resetStateRegex.test(jsContent)) {
  jsContent = jsContent.replace(resetStateRegex, useMemoLogic);
  console.log("useMemo logic injected");
} else {
  console.log("resetState regex not matched");
}

// 3. Reset the new state inside resetState
const resetSearch = /setModoRevision\(false\);\s*setProductosRevision\(\[\]\);/;
const resetReplace = `setModoRevision(false);
      setProductosRevision([]);
      setFiltroEstado('todos');
      setSortConfig({ key: '__rowNumber', direction: 'asc' });`;

if (resetSearch.test(jsContent)) {
  // It occurs twice, one in resetState, one in onClose maybe. Let's do global replace or just replace all.
  jsContent = jsContent.replace(new RegExp(resetSearch, 'g'), resetReplace);
  console.log("State resets updated");
}

fs.writeFileSync(jsPath, jsContent, 'utf8');
