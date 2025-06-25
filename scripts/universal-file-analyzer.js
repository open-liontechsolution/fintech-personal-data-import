const path = require('path');
const fs = require('fs');

console.log('🚀 Analizador universal de archivos iniciado...');

async function analyzeFile() {
  try {
    const filePath = path.join(__dirname, '../example/movements-242025.xls');
    console.log('📄 Archivo:', filePath);
    
    if (!fs.existsSync(filePath)) {
      console.error('❌ El archivo no existe');
      return;
    }
    
    const stats = fs.statSync(filePath);
    console.log('📊 Tamaño:', (stats.size / 1024).toFixed(2), 'KB');
    
    // Intentar leer como Excel primero
    console.log('\n🔄 Intentando leer como Excel...');
    try {
      const readXlsxFile = require('read-excel-file/node');
      const rows = await readXlsxFile(filePath, { sheet: 1 });
      
      console.log('✅ ¡Éxito! Archivo Excel leído correctamente');
      console.log('📊 Total de filas:', rows.length);
      
      if (rows.length > 0) {
        console.log('\n🏷️ Headers:', rows[0]);
        if (rows[1]) {
          console.log('💳 Primera transacción:', rows[1]);
        }
      }
      return;
      
    } catch (excelError) {
      console.log('❌ Error leyendo como Excel:', excelError.message);
    }
    
    // Si Excel falla, intentar como CSV
    console.log('\n🔄 Intentando leer como CSV...');
    try {
      const csvParser = require('csv-parser');
      const results = [];
      
      // Primero, detectar el delimitador
      const sample = fs.readFileSync(filePath, 'utf8').slice(0, 1000);
      const commas = (sample.match(/,/g) || []).length;
      const semicolons = (sample.match(/;/g) || []).length;
      const tabs = (sample.match(/\t/g) || []).length;
      
      let delimiter = ',';
      if (semicolons > commas && semicolons > tabs) delimiter = ';';
      else if (tabs > commas && tabs > semicolons) delimiter = '\t';
      
      console.log(`🔧 Delimitador detectado: "${delimiter}"`);
      
      return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csvParser({ separator: delimiter }))
          .on('data', (data) => {
            if (results.length < 5) { // Solo guardar las primeras 5 filas
              results.push(data);
            }
          })
          .on('end', () => {
            console.log('✅ ¡Éxito! Archivo CSV leído correctamente');
            console.log('📊 Columnas encontradas:', Object.keys(results[0] || {}));
            console.log('📊 Primeras filas de datos:');
            results.forEach((row, index) => {
              console.log(`  Fila ${index + 1}:`, row);
            });
            resolve();
          })
          .on('error', (csvError) => {
            console.log('❌ Error leyendo como CSV:', csvError.message);
            tryAsText();
            resolve();
          });
      });
      
    } catch (csvError) {
      console.log('❌ Error cargando csv-parser:', csvError.message);
    }
    
    function tryAsText() {
      // Si CSV falla, intentar como texto plano
      console.log('\n🔄 Intentando leer como texto plano...');
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').slice(0, 10); // Primeras 10 líneas
        
        console.log('✅ Archivo leído como texto');
        console.log('📄 Primeras líneas:');
        lines.forEach((line, index) => {
          if (line.trim()) {
            console.log(`  ${index + 1}: ${line.slice(0, 100)}${line.length > 100 ? '...' : ''}`);
          }
        });
        
      } catch (textError) {
        console.log('❌ Error leyendo como texto:', textError.message);
        
        // Como último recurso, leer como binario y mostrar info
        console.log('\n🔬 Análisis binario básico...');
        const buffer = fs.readFileSync(filePath);
        const firstBytes = Array.from(buffer.slice(0, 16))
          .map(b => '0x' + b.toString(16).padStart(2, '0'))
          .join(' ');
        console.log('🔬 Primeros 16 bytes:', firstBytes);
        
        // Verificar si es un archivo OLE (Excel antiguo)
        if (buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) {
          console.log('🏷️ Signature: Microsoft OLE Document (Excel .xls)');
        } else if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
          console.log('🏷️ Signature: ZIP archive (posible .xlsx)');
        } else {
          console.log('🏷️ Signature: No reconocida');
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

analyzeFile().catch(error => {
  console.error('❌ Error fatal:', error);
});
