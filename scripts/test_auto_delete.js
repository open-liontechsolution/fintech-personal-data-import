#!/usr/bin/env node

const { spawn } = require('child_process');
const amqp = require('amqplib');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

async function testAutoDelete() {
    console.log('🧪 TESTING: Auto-delete after successful processing\n');
    
    // 1. Configurar variable de entorno para habilitar auto-delete
    process.env.DELETE_AFTER_PROCESSING = 'true';
    
    console.log('✅ DELETE_AFTER_PROCESSING = true');
    console.log('🔄 Reiniciando servicio data-import para aplicar configuración...\n');
    
    // 2. Reiniciar servicio para que tome la nueva configuración
    try {
        // Parar servicio actual
        console.log('⏹️ Deteniendo servicio actual...');
        await runCommand('docker compose stop data-import');
        
        // Iniciar con nueva configuración
        console.log('▶️ Iniciando servicio con auto-delete habilitado...');
        await runCommand('docker compose up -d data-import');
        
        // Esperar a que esté listo
        console.log('⏳ Esperando a que el servicio esté listo...');
        await sleep(10000);
        
        console.log('✅ Servicio reiniciado\n');
        
    } catch (error) {
        console.error('❌ Error reiniciando servicio:', error.message);
        return;
    }
    
    // 3. Subir archivo de test
    console.log('📤 Subiendo archivo de test...');
    const uploadResponse = await uploadTestFile();
    
    if (!uploadResponse.success) {
        console.error('❌ Error subiendo archivo');
        return;
    }
    
    const fileId = uploadResponse.data.fileId;
    console.log(`✅ Archivo subido: ${fileId}\n`);
    
    // 4. Verificar que existe en GridFS
    console.log('🔍 Verificando archivo en GridFS...');
    const existsBefore = await checkFileInGridFS(fileId);
    console.log(`📁 Archivo existe en GridFS: ${existsBefore ? '✅ SÍ' : '❌ NO'}\n`);
    
    if (!existsBefore) {
        console.error('❌ Archivo no encontrado en GridFS después del upload');
        return;
    }
    
    // 5. Enviar mensaje para procesamiento
    console.log('📨 Enviando mensaje para procesamiento...');
    await sendProcessingMessage(fileId, 'movements-242025.xls');
    console.log('✅ Mensaje enviado\n');
    
    // 6. Esperar procesamiento y verificar eliminación
    console.log('⏳ Esperando procesamiento (30 segundos)...');
    await sleep(30000);
    
    // 7. Verificar que el archivo fue eliminado
    console.log('🔍 Verificando si archivo fue eliminado de GridFS...');
    const existsAfter = await checkFileInGridFS(fileId);
    console.log(`📁 Archivo existe en GridFS después del procesamiento: ${existsAfter ? '❌ SÍ (NO se eliminó)' : '✅ NO (se eliminó correctamente)'}\n`);
    
    // 8. Verificar que los datos fueron procesados
    console.log('📊 Verificando datos procesados...');
    const processedData = await checkProcessedData();
    console.log(`📈 Registros procesados: ${processedData}\n`);
    
    // 9. Resultado
    if (!existsAfter && processedData > 0) {
        console.log('🎉 ✅ TEST EXITOSO: Archivo eliminado automáticamente después del procesamiento exitoso');
    } else if (existsAfter) {
        console.log('❌ TEST FALLÓ: Archivo NO fue eliminado automáticamente');
    } else {
        console.log('❌ TEST FALLÓ: No se procesaron datos');
    }
}

async function uploadTestFile() {
    const { execSync } = require('child_process');
    
    try {
        const result = execSync(`curl -s -X POST -F "file=@example/movements-242025.xls" -F "userId=test-auto-delete" -F "bankName=ING" -F "description=Auto-delete test" http://localhost:3001/upload`, { encoding: 'utf-8' });
        return JSON.parse(result);
    } catch (error) {
        console.error('Error uploading file:', error);
        return { success: false };
    }
}

async function sendProcessingMessage(fileId, fileName) {
    const connection = await amqp.connect('amqp://guest:guest@localhost:5672');
    const channel = await connection.createChannel();
    
    const exchangeName = 'file-upload-exchange';
    const queueName = 'file-import-queue';
    const routingKey = 'file.uploaded';
    
    await channel.assertExchange(exchangeName, 'direct', { durable: true });
    await channel.assertQueue(queueName, { durable: true });
    await channel.bindQueue(queueName, exchangeName, routingKey);
    
    const message = {
        eventId: `auto-delete-test-${Date.now()}`,
        eventType: 'FileUploaded',
        timestamp: new Date().toISOString(),
        data: {
            fileId: fileId,
            fileName: fileName,
            userId: 'test-auto-delete',
            bankName: 'ING',
            fileSize: 71168,
            mimeType: 'application/octet-stream',
            uploadedAt: new Date().toISOString(),
            options: {
                hasHeaders: true,
                delimiter: 'auto',
                skipRows: 0,
                encoding: 'utf-8'
            }
        },
        metadata: {
            source: 'auto-delete-test',
            description: 'Testing auto-delete functionality'
        }
    };
    
    await channel.publish(
        exchangeName,
        routingKey,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
    );
    
    await channel.close();
    await connection.close();
}

async function checkFileInGridFS(fileId) {
    const client = new MongoClient('mongodb://admin:admin123@localhost:27017/fintech?authSource=admin');
    
    try {
        await client.connect();
        const db = client.db('fintech');
        
        const files = await db.collection('fs.files').find({ 
            _id: new ObjectId(fileId) 
        }).toArray();
        
        return files.length > 0;
    } catch (error) {
        console.error('Error checking file in GridFS:', error);
        return false;
    } finally {
        await client.close();
    }
}

async function checkProcessedData() {
    const client = new MongoClient('mongodb://admin:admin123@localhost:27017/fintech?authSource=admin');
    
    try {
        await client.connect();
        const db = client.db('fintech');
        
        const count = await db.collection('raw_imports').countDocuments({});
        return count;
    } catch (error) {
        console.error('Error checking processed data:', error);
        return 0;
    } finally {
        await client.close();
    }
}

function runCommand(command) {
    return new Promise((resolve, reject) => {
        const process = spawn('bash', ['-c', command], { stdio: 'inherit' });
        process.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with code ${code}`));
            }
        });
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Ejecutar test
testAutoDelete().catch(console.error);
