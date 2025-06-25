const { MongoClient, ObjectId } = require('mongodb');

async function verifyImportData() {
  const client = new MongoClient('mongodb://admin:admin123@localhost:27017');
  
  try {
    await client.connect();
    console.log('🔍 Conectado a MongoDB');
    
    const db = client.db('fintech');
    
    // Verificar resumen de importación
    console.log('\n📊 VERIFICANDO RESÚMENES DE IMPORTACIÓN:');
    const summariesCollection = db.collection('import_summaries');
    const summaries = await summariesCollection.find({}).sort({ createdAt: -1 }).limit(3).toArray();
    
    console.log(`📋 Total de resúmenes: ${summaries.length}`);
    
    summaries.forEach((summary, index) => {
      console.log(`\n📄 Resumen ${index + 1}:`);
      console.log(`  🆔 Import ID: ${summary.importId}`);
      console.log(`  📁 Archivo: ${summary.fileName}`);
      console.log(`  📊 Estado: ${summary.status}`);
      console.log(`  📈 Progreso: ${summary.progress}%`);
      console.log(`  📄 Filas totales: ${summary.totalRows}`);
      console.log(`  ✅ Filas importadas: ${summary.importedRows}`);
      console.log(`  ❌ Filas fallidas: ${summary.failedRows}`);
      console.log(`  🕐 Creado: ${summary.createdAt}`);
      console.log(`  🏦 Banco detectado: ${summary.detectedBank || 'No detectado'}`);
      console.log(`  📋 Headers: ${(summary.headers || []).slice(0, 5).join(', ')}${summary.headers?.length > 5 ? '...' : ''}`);
    });
    
    // Verificar datos crudos importados
    console.log('\n📊 VERIFICANDO DATOS CRUDOS IMPORTADOS:');
    const rawImportsCollection = db.collection('raw_imports');
    
    // Buscar por el último importId
    const latestSummary = summaries[0];
    if (latestSummary) {
      const importId = latestSummary.importId;
      console.log(`🔍 Buscando datos para Import ID: ${importId}`);
      
      const rawDataCount = await rawImportsCollection.countDocuments({ importId });
      console.log(`📊 Total de registros crudos: ${rawDataCount}`);
      
      // Mostrar primeros 5 registros
      const sampleData = await rawImportsCollection.find({ importId }).limit(5).toArray();
      
      console.log('\n📄 MUESTRA DE DATOS (primeros 5 registros):');
      sampleData.forEach((record, index) => {
        console.log(`\n📋 Registro ${index + 1}:`);
        console.log(`  🆔 Row ID: ${record.rowId}`);
        console.log(`  📊 Fila #: ${record.rowNumber}`);
        console.log(`  📊 Datos: ${JSON.stringify(record.rawData).substring(0, 100)}...`);
        console.log(`  🕐 Procesado: ${record.processedAt}`);
      });
      
      // Verificar si hay datos de transacciones válidos
      console.log('\n💰 VERIFICANDO ESTRUCTURA DE TRANSACCIONES:');
      const transactionSample = await rawImportsCollection.findOne({ 
        importId,
        'rawData.0': { $exists: true, $ne: null, $ne: '' }
      });
      
      if (transactionSample && transactionSample.rawData) {
        console.log('✅ Ejemplo de datos de transacción:');
        console.log(`   📅 Columna 1 (posible fecha): ${transactionSample.rawData[0]}`);
        console.log(`   📝 Columna 2 (posible descripción): ${transactionSample.rawData[1]}`);
        console.log(`   💰 Columna 3 (posible importe): ${transactionSample.rawData[2]}`);
        console.log(`   🏦 Columna 4 (posible saldo): ${transactionSample.rawData[3]}`);
        console.log(`   📊 Total columnas: ${transactionSample.rawData.length}`);
      }
    }
    
    // Verificar distribución temporal
    console.log('\n📈 ESTADÍSTICAS POR FECHA:');
    const importStats = await summariesCollection.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 },
          totalRows: { $sum: '$totalRows' },
          totalImported: { $sum: '$importedRows' },
          totalFailed: { $sum: '$failedRows' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1 } },
      { $limit: 5 }
    ]).toArray();
    
    importStats.forEach(stat => {
      console.log(`📅 ${stat._id.year}-${stat._id.month.toString().padStart(2, '0')}-${stat._id.day.toString().padStart(2, '0')}: ${stat.count} importaciones, ${stat.totalRows} filas totales, ${stat.totalImported} importadas`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

verifyImportData().catch(console.error);
