const { MongoClient, GridFSBucket } = require('mongodb');

async function testGridFS() {
    const client = new MongoClient('mongodb://admin:admin123@localhost:27017/?authSource=admin');
    
    try {
        await client.connect();
        console.log('✅ Conectado a MongoDB');
        
        const db = client.db('fintech');
        const bucket = new GridFSBucket(db);
        
        console.log('📁 Creando archivo de prueba en memoria...');
        
        const testData = 'Este es un archivo de prueba para GridFS\nLínea 2\nLínea 3\n';
        
        const uploadStream = bucket.openUploadStream('test-file.txt', {
            metadata: { 
                test: true,
                uploadedAt: new Date()
            }
        });
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout después de 5 segundos'));
            }, 5000);
            
            uploadStream.on('finish', () => {
                clearTimeout(timeout);
                console.log('✅ Archivo subido exitosamente');
                console.log('FileID:', uploadStream.id.toString());
                resolve(uploadStream.id);
            });
            
            uploadStream.on('error', (error) => {
                clearTimeout(timeout);
                console.error('❌ Error en upload:', error);
                reject(error);
            });
            
            console.log('🚀 Escribiendo datos...');
            uploadStream.write(Buffer.from(testData));
            uploadStream.end();
        });
    } finally {
        await client.close();
    }
}

testGridFS()
    .then(() => {
        console.log('🎉 Test exitoso');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Error:', error.message);
        process.exit(1);
    });
