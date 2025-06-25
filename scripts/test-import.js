const path = require('path');
const fs = require('fs');

console.log('🚀 Iniciando test de importación...');

async function testImport() {
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
    console.log('🔍 Analizando archivo:', filePath);
    
    // Verificar que el archivo existe
    if (!fs.existsSync(filePath)) {
      console.error('❌ El archivo no existe:', filePath);
      return;
    }
    
    console.log('📊 Tamaño del archivo:', (fs.statSync(filePath).size / 1024).toFixed(2), 'KB');
    
    let rows = [];
    let headers = [];
    let isExcelFile = false;
    
    // Intentar leer como Excel primero
    try {
      console.log('🔄 Intentando leer como archivo Excel...');
      
      // Leer todas las hojas
      let sheets;
      try {
        sheets = await readXlsxFile.readSheetNames(filePath);
        console.log('\n📊 Hojas disponibles:', sheets);
      } catch (error) {
        console.log('\n⚠️ No se pudieron leer los nombres de las hojas, usando hoja 1 por defecto');
        sheets = ['Hoja1'];
      }
      
      // Leer la primera hoja
      rows = await readXlsxFile(filePath, { sheet: 1 });
      headers = rows[0] || [];
      isExcelFile = true;
      
      console.log('✅ Archivo Excel leído correctamente');
      
    } catch (excelError) {
      console.log('❌ Error leyendo como Excel:', excelError.message);
      console.log('🔄 Intentando leer como archivo CSV...');
      
      // Fallback: intentar leer como CSV
      try {
        const csvParser = require('csv-parser');
        const results = [];
        
        // Detectar delimitador
        const sample = fs.readFileSync(filePath, 'utf8').slice(0, 1000);
        const commas = (sample.match(/,/g) || []).length;
        const semicolons = (sample.match(/;/g) || []).length;
        const tabs = (sample.match(/\t/g) || []).length;
        
        let delimiter = ',';
        if (semicolons > commas && semicolons > tabs) delimiter = ';';
        else if (tabs > commas && tabs > semicolons) delimiter = '\t';
        
        console.log(`🔧 Delimitador detectado: "${delimiter}"`);
        
        await new Promise((resolve, reject) => {
          fs.createReadStream(filePath)
            .pipe(csvParser({ separator: delimiter }))
            .on('data', (data) => {
              results.push(data);
            })
            .on('end', () => {
              console.log('✅ Archivo CSV leído correctamente');
              
              // Convertir formato CSV a formato similar al Excel
              if (results.length > 0) {
                headers = Object.keys(results[0]);
                rows = [headers, ...results.map(row => headers.map(h => row[h]))];
              }
              
              resolve();
            })
            .on('error', reject);
        });
        
      } catch (csvError) {
        console.log('❌ Error leyendo como CSV:', csvError.message);
        console.log('🔄 Leyendo como texto plano...');
        
        // Último fallback: leer como texto y intentar parsear manualmente
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        if (lines.length > 0) {
          // Intentar detectar delimitador en texto plano
          const firstLine = lines[0];
          let delimiter = ',';
          if (firstLine.includes(';')) delimiter = ';';
          else if (firstLine.includes('\t')) delimiter = '\t';
          
          headers = firstLine.split(delimiter).map(h => h.trim().replace(/"/g, ''));
          rows = lines.slice(0, Math.min(10, lines.length)).map(line => 
            line.split(delimiter).map(cell => cell.trim().replace(/"/g, ''))
          );
          
          console.log('✅ Archivo de texto parseado manualmente');
        }
      }
    }
    
    console.log('\n📋 Total de filas:', rows.length);
    
    if (rows.length > 0) {
      console.log('\n🏷️ HEADERS:');
      headers.forEach((header, index) => {
        console.log(`  ${index + 1}. "${header}"`);
      });
      
      // Detectar si es formato de banco conocido
      const headerStr = headers.map(h => String(h || '')).join('|').toLowerCase();
      
      console.log('\n🏦 DETECCIÓN DE BANCO:');
      let bankDetected = 'Unknown';
      let confidence = 0;
      
      console.log('📝 Headers concatenados:', headerStr);
      
      // Criterios de detección para diferentes bancos
      const bankCriteria = {
        ING: [
          headerStr.includes('fecha'),
          headerStr.includes('nombre') || headerStr.includes('concepto'),
          headerStr.includes('cuenta') || headerStr.includes('contrapartida'),
          headerStr.includes('importe') || headerStr.includes('cantidad') || headerStr.includes('amount')
        ],
        Santander: [
          headerStr.includes('fecha'),
          headerStr.includes('concepto') || headerStr.includes('descripcion'),
          headerStr.includes('importe'),
          headerStr.includes('saldo')
        ],
        BBVA: [
          headerStr.includes('fecha'),
          headerStr.includes('concepto'),
          headerStr.includes('importe'),
          headerStr.includes('cuenta')
        ]
      };
      
      // Evaluar cada banco
      for (const [bank, criteria] of Object.entries(bankCriteria)) {
        const matchedCriteria = criteria.filter(Boolean).length;
        const bankConfidence = matchedCriteria / criteria.length;
        
        if (bankConfidence > confidence) {
          confidence = bankConfidence;
          bankDetected = bank;
        }
        
        console.log(`  📊 ${bank}: ${matchedCriteria}/${criteria.length} criterios (${(bankConfidence * 100).toFixed(1)}%)`);
      }
      
      console.log(`🎯 Banco detectado: ${bankDetected} (confianza: ${(confidence * 100).toFixed(1)}%)`);
      
      // Mostrar transacciones de ejemplo
      const maxExamples = Math.min(3, rows.length - 1);
      for (let i = 1; i <= maxExamples; i++) {
        console.log(`\n💳 TRANSACCIÓN ${i} (Fila ${i + 1}):`);
        if (rows[i]) {
          const transaction = {};
          headers.forEach((header, index) => {
            const value = rows[i][index];
            if (value !== null && value !== undefined && String(value).trim() !== '') {
              transaction[header] = value;
            }
          });
          
          // Mostrar de forma más legible
          Object.entries(transaction).forEach(([key, value]) => {
            console.log(`  📄 ${key}: ${value}`);
          });
        }
      }
      
      // Mostrar estructura de datos como quedaría en MongoDB
      console.log('\n💾 ESTRUCTURA MONGODB (ejemplo para primera transacción):');
      if (rows[1]) {
        const rawData = {};
        headers.forEach((header, index) => {
          rawData[header] = rows[1][index];
        });
        
        const mongoDocument = {
          importId: 'uuid-ejemplo-' + Date.now(),
          fileId: 'gridfs-file-id-ejemplo',
          fileName: path.basename(filePath),
          fileType: isExcelFile ? 'excel' : 'csv',
          userId: 'user123',
          bankName: bankDetected,
          bankCode: bankDetected !== 'Unknown' ? bankDetected : undefined,
          accountInfo: undefined,
          rowNumber: 1,
          rawData: rawData,
          headers: headers,
          importedAt: new Date(),
          confidence: confidence
        };
        
        console.log(JSON.stringify(mongoDocument, null, 2));
      }
      
      // Estadísticas del archivo
      console.log('\n📊 ESTADÍSTICAS DEL ARCHIVO:');
      const dataRows = rows.slice(1); // Excluir headers
      const nonEmptyRows = dataRows.filter(row => 
        row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
      );
      
      console.log(`  📊 Filas con headers: 1`);
      console.log(`  📊 Filas de datos: ${dataRows.length}`);
      console.log(`  📊 Filas no vacías: ${nonEmptyRows.length}`);
      console.log(`  📊 Columnas: ${headers.length}`);
      console.log(`  📊 Tamaño del archivo: ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB`);
      console.log(`  📊 Tipo de archivo: ${isExcelFile ? 'Excel' : 'CSV/Texto'}`);
      
      // Análisis de tipos de datos
      console.log('\n🔍 ANÁLISIS DE TIPOS DE DATOS:');
      headers.forEach((header, colIndex) => {
        const sampleValues = dataRows.slice(0, 5).map(row => row[colIndex]).filter(v => v != null);
        const types = [...new Set(sampleValues.map(v => typeof v))];
        console.log(`  📄 ${header}: tipos detectados [${types.join(', ')}]`);
      });
    }
    
    console.log('\n✅ Test de importación completado exitosamente');
    
  } catch (error) {
    console.error('\n❌ Error en el test de importación:');
    console.error('Mensaje:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

// Ejecutar la función
testImport().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
