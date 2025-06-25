const path = require('path');
const fs = require('fs');

console.log('🔍 Iniciando análisis del archivo...');

async function analyzeFile() {
  try {
    // Verificar que read-excel-file esté disponible
    let readXlsxFile;
    try {
      readXlsxFile = require('read-excel-file/node');
      console.log('✅ Dependencia read-excel-file cargada correctamente');
    } catch (error) {
      console.error('❌ Error cargando read-excel-file:', error.message);
      console.log('💡 Ejecuta: npm install read-excel-file');
      return;
    }

    const filePath = path.join(__dirname, '../example/movements-242025.xls');
    console.log('📄 Ruta del archivo:', filePath);
    
    // Verificar que el archivo existe
    if (!fs.existsSync(filePath)) {
      console.error('❌ El archivo no existe:', filePath);
      return;
    }
    
    const stats = fs.statSync(filePath);
    console.log('📊 Tamaño del archivo:', (stats.size / 1024).toFixed(2), 'KB');
    
    console.log('🔄 Leyendo archivo...');
    
    // Leer las primeras filas
    const rows = await readXlsxFile(filePath, { sheet: 1 });
    
    console.log('\n=== ✅ ARCHIVO LEÍDO CORRECTAMENTE ===');
    console.log('📊 Total de filas:', rows.length);
    
    if (rows.length > 0) {
      console.log('\n=== 🏷️ HEADERS (Fila 1) ===');
      console.log(rows[0]);
      
      console.log('\n=== 💳 PRIMERA TRANSACCIÓN (Fila 2) ===');
      if (rows[1]) {
        console.log(rows[1]);
      }
      
      console.log('\n=== 💳 SEGUNDA TRANSACCIÓN (Fila 3) ===');
      if (rows[2]) {
        console.log(rows[2]);
      }
      
      console.log('\n=== 📋 PRIMERAS 5 FILAS ===');
      rows.slice(0, 5).forEach((row, index) => {
        console.log(`Fila ${index + 1}:`, row);
      });
      
      // Análisis de columnas
      console.log('\n=== 📊 ANÁLISIS DE COLUMNAS ===');
      const headers = rows[0] || [];
      headers.forEach((header, index) => {
        console.log(`Columna ${index + 1}: "${header}"`);
      });
    }
    
    // Intentar obtener información de las hojas
    try {
      const sheets = await readXlsxFile.readSheetNames(filePath);
      console.log('\n=== 📑 HOJAS DISPONIBLES ===');
      sheets.forEach((sheet, index) => {
        console.log(`Hoja ${index + 1}: "${sheet}"`);
      });
    } catch (sheetError) {
      console.log('\n⚠️ No se pudieron leer los nombres de las hojas:', sheetError.message);
    }
    
    console.log('\n✅ Análisis completado exitosamente');
    
  } catch (error) {
    console.error('\n❌ Error al analizar el archivo:');
    console.error('Mensaje:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

// Ejecutar la función
analyzeFile().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
