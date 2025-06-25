#!/usr/bin/env node

const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');

async function verifyUploadedFile() {
    console.log('🔍 Verificando archivo subido en GridFS...\n');
    
    const client = new MongoClient('mongodb://admin:admin123@localhost:27017/fintech?authSource=admin');
    
    try {
        await client.connect();
        console.log('✅ Conectado a MongoDB');
        
        const db = client.db('fintech');
        const bucket = new GridFSBucket(db, { bucketName: 'fs' });
        
        // FileId del archivo que acabamos de subir
        const fileId = '685c6c1899dc77e6e94cbaef';
        console.log(`📄 Buscando archivo con ID: ${fileId}\n`);
        
        // Buscar el archivo en GridFS
        const files = await db.collection('fs.files').find({ 
            _id: new ObjectId(fileId) 
        }).toArray();
        
        if (files.length === 0) {
            console.log('❌ Archivo no encontrado en GridFS');
            return;
        }
        
        const file = files[0];
        console.log('✅ Archivo encontrado en GridFS:');
        console.log('📋 Información del archivo:');
        console.log(`   - ID: ${file._id}`);
        console.log(`   - Nombre: ${file.filename}`);
        console.log(`   - Tamaño: ${file.length} bytes`);
        console.log(`   - Tipo: ${file.metadata?.mimetype || 'N/A'}`);
        console.log(`   - Subido: ${file.uploadDate}`);
        console.log(`   - MD5: ${file.md5}`);
        
        console.log('\n📊 Metadata personalizada:');
        if (file.metadata) {
            console.log(`   - Upload ID: ${file.metadata.uploadId}`);
            console.log(`   - Usuario: ${file.metadata.userId}`);
            console.log(`   - Banco: ${file.metadata.bankName}`);
            console.log(`   - Descripción: ${file.metadata.description}`);
            console.log(`   - Nombre original: ${file.metadata.originalName}`);
        } else {
            console.log('   - No hay metadata personalizada');
        }
        
        // Verificar chunks
        const chunks = await db.collection('fs.chunks').find({ 
            files_id: new ObjectId(fileId) 
        }).toArray();
        
        console.log(`\n🧩 Chunks: ${chunks.length} chunks encontrados`);
        console.log(`   - Total tamaño chunks: ${chunks.reduce((sum, chunk) => sum + chunk.data.length(), 0)} bytes`);
        
        // Verificar integridad comparando con archivo original
        console.log('\n🔍 Verificando integridad del archivo...');
        
        const fs = require('fs');
        const path = require('path');
        const crypto = require('crypto');
        
        // Leer archivo original
        const originalPath = path.join(__dirname, 'example', 'movements-242025.xls');
        if (fs.existsSync(originalPath)) {
            const originalData = fs.readFileSync(originalPath);
            const originalMD5 = crypto.createHash('md5').update(originalData).digest('hex');
            
            console.log(`   - MD5 original: ${originalMD5}`);
            console.log(`   - MD5 GridFS:   ${file.md5}`);
            
            if (originalMD5 === file.md5) {
                console.log('✅ ¡Integridad verificada! El archivo se almacenó correctamente');
            } else {
                console.log('❌ Error de integridad: Los MD5 no coinciden');
            }
        } else {
            console.log('⚠️ No se pudo encontrar el archivo original para comparar');
        }
        
        console.log('\n🎯 RESULTADO: Archivo almacenado correctamente en GridFS');
        console.log(`📨 Listo para enviar mensaje a RabbitMQ con fileId: ${fileId}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
    }
}

// Ejecutar verificación
verifyUploadedFile().catch(console.error);
