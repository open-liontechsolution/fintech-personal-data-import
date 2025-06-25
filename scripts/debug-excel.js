const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const readXlsxFile = require('read-excel-file/node');

async function debugExcelFile() {
  const client = new MongoClient('mongodb://admin:admin123@localhost:27017');
  
  try {
    await client.connect();
    console.log('🔍 Conectado a MongoDB');
    
    const db = client.db('fintech');
    const filesCollection = db.collection('uploaded_files');
    
    // Buscar el archivo
    const file = await filesCollection.findOne({ filename: 'movements-242025.xls' });
    
    if (!file) {
      console.error('❌ Archivo no encontrado');
      return;
    }
    
    console.log(`📁 Archivo encontrado: ${file.filename}`);
    console.log(`🔑 FileID: ${file._id}`);
    
    // Decodificar y guardar
    const fileBuffer = Buffer.from(file.data, 'base64');
    const tempPath = '/tmp/debug_excel.xls';
    fs.writeFileSync(tempPath, fileBuffer);
    
    console.log(`💾 Archivo guardado en: ${tempPath}`);
    console.log(`📊 Tamaño: ${fileBuffer.length} bytes`);
    
    // Mostrar primeros bytes en hex
    const firstBytes = fileBuffer.slice(0, 16);
    console.log(`🔍 Primeros 16 bytes (hex): ${firstBytes.toString('hex')}`);
    console.log(`🔍 Primeros 16 bytes (little-endian): ${firstBytes.readUInt32LE(0).toString(16)}`);
    console.log(`🔍 Primeros 16 bytes (big-endian): ${firstBytes.readUInt32BE(0).toString(16)}`);
    
    // Intentar leer con read-excel-file
    try {
      console.log('📖 Intentando leer con read-excel-file...');
      const rows = await readXlsxFile(tempPath);
      console.log(`✅ Excel leído correctamente: ${rows.length} filas`);
      console.log('📄 Primeras 3 filas:', rows.slice(0, 3));
    } catch (excelError) {
      console.error('❌ Error al leer Excel con read-excel-file:', excelError.message);
      
      // Intentar con diferentes enfoques
      console.log('🔧 Intentando detectar tipo de archivo...');
      
      // Verificar si es realmente un archivo Excel
      const signature = firstBytes.slice(0, 8).toString('hex');
      console.log(`🔍 Signature completa: ${signature}`);
      
      if (signature.startsWith('d0cf11e0')) {
        console.log('✅ Signature Excel válida detectada');
      } else if (signature.startsWith('504b0304')) {
        console.log('📋 Es un archivo ZIP/XLSX');
      } else {
        console.log('❓ Signature desconocida');
      }
    }
    
    // Verificar contra archivo original
    const originalPath = './example/movements-242025.xls';
    if (fs.existsSync(originalPath)) {
      const originalBuffer = fs.readFileSync(originalPath);
      const originalFirst16 = originalBuffer.slice(0, 16);
      
      console.log('\n🆚 COMPARACIÓN CON ORIGINAL:');
      console.log(`📁 Original hex: ${originalFirst16.toString('hex')}`);
      console.log(`💾 Descargado hex: ${firstBytes.toString('hex')}`);
      console.log(`✅ ¿Son idénticos?: ${originalFirst16.equals(firstBytes)}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

debugExcelFile().catch(console.error);
