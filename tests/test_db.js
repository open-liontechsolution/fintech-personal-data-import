const { MongoClient } = require('mongodb');

async function testDB() {
    const client = new MongoClient('mongodb://admin:admin123@localhost:27017/?authSource=admin');
    
    try {
        await client.connect();
        console.log('✅ Conectado a MongoDB');
        
        // Listar bases de datos
        const adminDb = client.db().admin();
        const dbs = await adminDb.listDatabases();
        console.log('📚 Bases de datos disponibles:');
        dbs.databases.forEach(db => console.log(`  - ${db.name}`));
        
        // Crear/verificar base de datos fintech
        const fintechDb = client.db('fintech');
        
        // Crear una colección de prueba
        console.log('📄 Creando colección de prueba...');
        await fintechDb.createCollection('test');
        
        // Insertar un documento de prueba
        console.log('💾 Insertando documento de prueba...');
        const result = await fintechDb.collection('test').insertOne({
            test: true,
            timestamp: new Date()
        });
        console.log('✅ Documento insertado:', result.insertedId);
        
        // Verificar GridFS
        console.log('🗂️ Verificando GridFS...');
        const collections = await fintechDb.listCollections().toArray();
        console.log('📁 Colecciones existentes:');
        collections.forEach(col => console.log(`  - ${col.name}`));
        
        // Limpiar
        await fintechDb.collection('test').deleteMany({});
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
    }
}

testDB();
