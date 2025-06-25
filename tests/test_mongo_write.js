const { MongoClient } = require('mongodb');

async function testWrite() {
    const client = new MongoClient('mongodb://admin:admin123@localhost:27017/?authSource=admin');
    
    try {
        await client.connect();
        console.log('✅ Conectado a MongoDB');
        
        const db = client.db('fintech');
        
        // Test 1: Escribir a colección normal
        console.log('📄 Test 1: Insertando en colección normal...');
        const result = await db.collection('test_files').insertOne({
            fileName: 'movements-242025.xls',
            uploadedAt: new Date(),
            size: 12345
        });
        console.log('✅ Documento insertado:', result.insertedId);
        
        // Test 2: Verificar colecciones GridFS
        console.log('📁 Test 2: Verificando colecciones GridFS...');
        const collections = await db.listCollections().toArray();
        console.log('Colecciones existentes:');
        collections.forEach(col => console.log(`  - ${col.name}`));
        
        // Test 3: Crear colecciones GridFS manualmente
        console.log('🗂️ Test 3: Creando colecciones GridFS...');
        await db.createCollection('fs.files');
        await db.createCollection('fs.chunks');
        console.log('✅ Colecciones GridFS creadas');
        
        // Test 4: Verificar permisos de escritura en GridFS collections
        console.log('🔐 Test 4: Verificando permisos...');
        const fsFilesResult = await db.collection('fs.files').insertOne({
            filename: 'test.txt',
            length: 100,
            chunkSize: 261120,
            uploadDate: new Date()
        });
        console.log('✅ Escritura en fs.files exitosa:', fsFilesResult.insertedId);
        
        // Limpiar
        await db.collection('test_files').deleteMany({});
        await db.collection('fs.files').deleteMany({});
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await client.close();
    }
}

testWrite();
