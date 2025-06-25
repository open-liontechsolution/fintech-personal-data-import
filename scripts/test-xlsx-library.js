const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const XLSX = require('xlsx');

async function testXlsxLibrary() {
  console.log('🧪 Probando librería XLSX como alternativa...');
  
  try {
    // Verificar si tenemos xlsx instalado
    console.log('📦 Verificando instalación de XLSX...');
    
    const tempPath = '/tmp/debug_excel.xls';
    
    if (!fs.existsSync(tempPath)) {
      console.log('📁 Archivo de prueba no existe, creándolo...');
      
      // Crear archivo desde MongoDB
      const client = new MongoClient('mongodb://admin:admin123@localhost:27017');
      await client.connect();
      
      const db = client.db('fintech');
      const filesCollection = db.collection('uploaded_files');
      const file = await filesCollection.findOne({ filename: 'movements-242025.xls' });
      
      if (file) {
        const fileBuffer = Buffer.from(file.data, 'base64');
        fs.writeFileSync(tempPath, fileBuffer);
        console.log('✅ Archivo creado desde MongoDB');
      }
      
      await client.close();
    }
    
    // Probar con XLSX
    console.log('📖 Leyendo con XLSX...');
    const workbook = XLSX.readFile(tempPath);
    
    console.log('✅ XLSX cargado correctamente');
    console.log('📄 Hojas disponibles:', workbook.SheetNames);
    
    // Leer primera hoja
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convertir a JSON
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log(`📊 Filas leídas: ${data.length}`);
    console.log('📄 Primeras 5 filas:');
    data.slice(0, 5).forEach((row, index) => {
      console.log(`  ${index + 1}: [${row.join(', ')}]`);
    });
    
    return true;
    
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('❌ Librería XLSX no está instalada');
      console.log('💡 Necesitas ejecutar: npm install xlsx');
      return false;
    } else {
      console.error('❌ Error al leer con XLSX:', error.message);
      return false;
    }
  }
}

// También probar con node-xlsx
async function testNodeXlsx() {
  console.log('\n🧪 Probando node-xlsx...');
  
  try {
    const xlsx = require('node-xlsx');
    const tempPath = '/tmp/debug_excel.xls';
    
    const sheets = xlsx.parse(tempPath);
    
    console.log('✅ node-xlsx cargado correctamente');
    console.log(`📄 Hojas encontradas: ${sheets.length}`);
    
    if (sheets.length > 0) {
      const firstSheet = sheets[0];
      console.log(`📊 Nombre de la hoja: ${firstSheet.name}`);
      console.log(`📊 Filas: ${firstSheet.data.length}`);
      
      console.log('📄 Primeras 5 filas:');
      firstSheet.data.slice(0, 5).forEach((row, index) => {
        console.log(`  ${index + 1}: [${row.join(', ')}]`);
      });
    }
    
    return true;
    
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('❌ Librería node-xlsx no está instalada');
      return false;
    } else {
      console.error('❌ Error al leer con node-xlsx:', error.message);
      return false;
    }
  }
}

async function main() {
  console.log('🔧 Probando librerías alternativas para Excel...\n');
  
  const xlsxWorks = await testXlsxLibrary();
  const nodeXlsxWorks = await testNodeXlsx();
  
  console.log('\n📋 RESUMEN:');
  console.log(`📦 XLSX: ${xlsxWorks ? '✅ Funciona' : '❌ No disponible/funciona'}`);
  console.log(`📦 node-xlsx: ${nodeXlsxWorks ? '✅ Funciona' : '❌ No disponible/funciona'}`);
  console.log(`📦 read-excel-file: ❌ Problema con signature`);
  
  if (xlsxWorks || nodeXlsxWorks) {
    console.log('\n💡 RECOMENDACIÓN: Cambiar a una librería que funcione');
  } else {
    console.log('\n💡 RECOMENDACIÓN: Instalar librerías alternativas');
  }
}

main().catch(console.error);
