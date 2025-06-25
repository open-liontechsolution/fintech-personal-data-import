const { MongoClient, GridFSBucket } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function uploadFile() {
    const filePath = 'example/movements-242025.xls';
    const fileName = path.basename(filePath);
    
    if (!fs.existsSync(filePath)) {
        console.error('ERROR: Archivo no encontrado:', filePath);
        process.exit(1);
    }
    
    const client = new MongoClient('mongodb://admin:admin123@localhost:27017/fintech?authSource=admin');
    
    try {
        await client.connect();
        console.log('✅ Conectado a MongoDB');
        
        const db = client.db('fintech');
        const bucket = new GridFSBucket(db);
        
        console.log('📁 Creando upload stream...');
        
        const uploadStream = bucket.openUploadStream(fileName, {
            metadata: { 
                originalName: fileName,
                uploadedAt: new Date(),
                source: 'test-environment'
            }
        });
        
        console.log('📄 Leyendo archivo desde:', filePath);
        const fileStream = fs.createReadStream(filePath);
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Upload timeout después de 10 segundos'));
            }, 10000);
            
            uploadStream.on('finish', () => {
                clearTimeout(timeout);
                console.log('✅ Archivo subido exitosamente');
                console.log('FileID:' + uploadStream.id.toString());
                resolve(uploadStream.id);
            });
            
            uploadStream.on('error', (error) => {
                clearTimeout(timeout);
                console.error('❌ Error en upload stream:', error);
                reject(error);
            });
            
            fileStream.on('error', (error) => {
                clearTimeout(timeout);
                console.error('❌ Error en file stream:', error);
                reject(error);
            });
            
            console.log('🚀 Iniciando upload...');
            fileStream.pipe(uploadStream);
        });
    } finally {
        await client.close();
    }
}

uploadFile()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Error al subir archivo:', error.message);
        process.exit(1);
    });
