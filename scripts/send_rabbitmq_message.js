#!/usr/bin/env node

const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');

async function sendFileUploadedMessage() {
    console.log(' Enviando mensaje a RabbitMQ para procesar archivo...\n');
    
    const connection = await amqp.connect('amqp://guest:guest@localhost:5672');
    const channel = await connection.createChannel();
    
    try {
        console.log(' Conectado a RabbitMQ');
        
        // Configuración del exchange y queue
        const exchangeName = 'file-upload-exchange';
        const queueName = 'file-import-queue';
        const routingKey = 'file.uploaded';
        
        // Asegurar que el exchange y queue existen
        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, routingKey);
        
        console.log(` Exchange: ${exchangeName}`);
        console.log(` Queue: ${queueName}`);
        console.log(` Routing Key: ${routingKey}\n`);
        
        // Obtener parámetros de línea de comandos
        const fileId = process.argv[2] || '685c6c1899dc77e6e94cbaef';
        const fileName = process.argv[3] || 'movements-242025.xls';
        const eventId = `manual-trigger-${Date.now()}`;
        
        // Mensaje FileUploaded
        const message = {
            eventId: eventId,
            eventType: 'FileUploaded',
            timestamp: new Date().toISOString(),
            data: {
                fileId: fileId,
                fileName: fileName,
                userId: 'test-user',
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
                source: 'manual-curl-upload',
                description: 'Test upload via curl - manual trigger',
                uploadId: '65ef832b-9e1f-4adf-8b6d-efb301055514'
            }
        };
        
        console.log(' Mensaje a enviar:');
        console.log(JSON.stringify(message, null, 2));
        console.log('\n Enviando mensaje...');
        
        // Enviar mensaje
        const messageBuffer = Buffer.from(JSON.stringify(message));
        await channel.publish(
            exchangeName,
            routingKey,
            messageBuffer,
            {
                persistent: true,
                messageId: uuidv4(),
                timestamp: Date.now(),
                contentType: 'application/json'
            }
        );
        
        console.log(' Mensaje enviado exitosamente!');
        console.log(` Event ID: ${eventId}`);
        console.log(` File ID: ${fileId}`);
        console.log(` File Name: ${fileName}`);
        
        console.log('\n El archivo debería comenzar a procesarse automáticamente...');
        console.log(' Puedes monitorearlo en los logs del contenedor:');
        console.log('   docker logs fintech-data-import -f');
        
        // Verificar estado de la cola después del envío
        setTimeout(async () => {
            try {
                const queueInfo = await channel.checkQueue(queueName);
                console.log(`\n Estado de la cola después del envío:`);
                console.log(`   - Mensajes en cola: ${queueInfo.messageCount}`);
                console.log(`   - Consumidores: ${queueInfo.consumerCount}`);
                
                if (queueInfo.messageCount === 0) {
                    console.log(' Mensaje procesado inmediatamente (cola vacía)');
                } else {
                    console.log(' Mensaje en cola, esperando procesamiento');
                }
            } catch (error) {
                console.log(' No se pudo verificar estado de cola:', error.message);
            } finally {
                await channel.close();
                await connection.close();
            }
        }, 1000);
        
    } catch (error) {
        console.error(' Error enviando mensaje:', error.message);
        await channel.close();
        await connection.close();
    }
}

// Ejecutar
sendFileUploadedMessage().catch(console.error);
