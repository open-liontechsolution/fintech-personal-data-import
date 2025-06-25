#!/usr/bin/env node

/**
 * Script complementario para inicialización del entorno de test
 * Maneja operaciones específicas con MongoDB y RabbitMQ
 */

const { MongoClient, GridFSBucket } = require('mongodb');
const amqp = require('amqplib');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Configuración
const CONFIG = {
    mongodb: {
        uri: 'mongodb://admin:admin123@localhost:27017/fintech?authSource=admin',
        dbName: 'fintech'
    },
    rabbitmq: {
        url: 'amqp://guest:guest@localhost:5672',
        exchange: 'fintech-events',
        exchangeType: 'topic',
        queue: 'file-import-queue',
        routingKey: 'file.uploaded'
    },
    files: {
        exampleFile: path.join(__dirname, '..', 'example', 'movements-242025.xls')
    }
};

// Utilidades de colores para console
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function colorLog(color, message) {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function info(message) { colorLog('blue', `[INFO] ${message}`); }
function success(message) { colorLog('green', `[SUCCESS] ${message}`); }
function error(message) { colorLog('red', `[ERROR] ${message}`); }
function warning(message) { colorLog('yellow', `[WARNING] ${message}`); }

/**
 * Clase para manejar operaciones con MongoDB GridFS
 */
class GridFSManager {
    constructor() {
        this.client = null;
        this.db = null;
        this.bucket = null;
    }

    async connect() {
        try {
            this.client = new MongoClient(CONFIG.mongodb.uri);
            await this.client.connect();
            this.db = this.client.db(CONFIG.mongodb.dbName);
            this.bucket = new GridFSBucket(this.db);
            success('Conectado a MongoDB');
        } catch (err) {
            error(`Error conectando a MongoDB: ${err.message}`);
            throw err;
        }
    }

    async disconnect() {
        if (this.client) {
            await this.client.close();
            info('Desconectado de MongoDB');
        }
    }

    async uploadFile(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Archivo no encontrado: ${filePath}`);
        }

        const fileName = path.basename(filePath);
        const fileSize = fs.statSync(filePath).size;
        
        info(`Subiendo archivo: ${fileName} (${fileSize} bytes)`);

        const uploadStream = this.bucket.openUploadStream(fileName, {
            metadata: {
                originalName: fileName,
                uploadedAt: new Date(),
                userId: 'test-user',
                fileType: this.getFileType(fileName),
                fileSize: fileSize,
                source: 'test-environment'
            }
        });

        const readStream = fs.createReadStream(filePath);

        return new Promise((resolve, reject) => {
            readStream.pipe(uploadStream)
                .on('error', reject)
                .on('finish', () => {
                    const fileId = uploadStream.id.toString();
                    success(`Archivo subido a GridFS con ID: ${fileId}`);
                    resolve(fileId);
                });
        });
    }

    getFileType(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        switch (ext) {
            case '.csv': return 'csv';
            case '.xls':
            case '.xlsx': return 'excel';
            default: return 'unknown';
        }
    }

    async listFiles() {
        try {
            const files = await this.bucket.find({}).toArray();
            
            console.log('\n📁 Archivos en GridFS:');
            console.log('========================');
            
            if (files.length === 0) {
                warning('No hay archivos en GridFS');
                return;
            }

            files.forEach(file => {
                console.log(`🔹 ID: ${file._id}`);
                console.log(`   Nombre: ${file.filename}`);
                console.log(`   Tamaño: ${file.length} bytes`);
                console.log(`   Fecha: ${file.uploadDate}`);
                console.log(`   Metadata: ${JSON.stringify(file.metadata, null, 2)}`);
                console.log('');
            });
        } catch (err) {
            error(`Error listando archivos: ${err.message}`);
            throw err;
        }
    }

    async cleanFiles() {
        try {
            const files = await this.bucket.find({}).toArray();
            
            if (files.length === 0) {
                info('No hay archivos para limpiar en GridFS');
                return;
            }

            for (const file of files) {
                await this.bucket.delete(file._id);
                info(`Eliminado archivo: ${file.filename} (${file._id})`);
            }
            
            success(`Eliminados ${files.length} archivos de GridFS`);
        } catch (err) {
            error(`Error limpiando archivos: ${err.message}`);
            throw err;
        }
    }
}

/**
 * Clase para manejar operaciones con RabbitMQ
 */
class RabbitMQManager {
    constructor() {
        this.connection = null;
        this.channel = null;
    }

    async connect() {
        try {
            this.connection = await amqp.connect(CONFIG.rabbitmq.url);
            this.channel = await this.connection.createChannel();
            success('Conectado a RabbitMQ');
        } catch (err) {
            error(`Error conectando a RabbitMQ: ${err.message}`);
            throw err;
        }
    }

    async disconnect() {
        if (this.channel) {
            await this.channel.close();
        }
        if (this.connection) {
            await this.connection.close();
        }
        info('Desconectado de RabbitMQ');
    }

    async setupQueues() {
        try {
            // Asegurar que el exchange existe
            await this.channel.assertExchange(
                CONFIG.rabbitmq.exchange, 
                CONFIG.rabbitmq.exchangeType, 
                { durable: true }
            );

            // Asegurar que la cola existe
            await this.channel.assertQueue(CONFIG.rabbitmq.queue, { durable: true });

            // Hacer bind de la cola al exchange
            await this.channel.bindQueue(
                CONFIG.rabbitmq.queue, 
                CONFIG.rabbitmq.exchange, 
                CONFIG.rabbitmq.routingKey
            );

            success('Colas y exchange configurados correctamente');
        } catch (err) {
            error(`Error configurando colas: ${err.message}`);
            throw err;
        }
    }

    async sendFileUploadedEvent(fileId, fileName) {
        try {
            const message = {
                eventId: uuidv4(),
                eventType: 'FileUploaded',
                timestamp: new Date().toISOString(),
                data: {
                    fileId: fileId,
                    fileName: fileName,
                    fileType: 'excel',
                    userId: 'test-user',
                    uploadedAt: new Date().toISOString(),
                    importOptions: {
                        hasHeaders: true,
                        skipRows: 0,
                        delimiter: ',',
                        encoding: 'utf8'
                    }
                }
            };

            await this.channel.publish(
                CONFIG.rabbitmq.exchange,
                CONFIG.rabbitmq.routingKey,
                Buffer.from(JSON.stringify(message)),
                {
                    persistent: true,
                    messageId: uuidv4(),
                    timestamp: Date.now()
                }
            );

            success('Evento FileUploaded enviado a RabbitMQ');
            
            console.log('\n📨 Detalles del mensaje:');
            console.log('========================');
            console.log(`🔹 Event ID: ${message.eventId}`);
            console.log(`🔹 File ID: ${message.data.fileId}`);
            console.log(`🔹 File Name: ${message.data.fileName}`);
            console.log(`🔹 Routing Key: ${CONFIG.rabbitmq.routingKey}`);
            console.log(`🔹 Timestamp: ${message.timestamp}`);
            
        } catch (err) {
            error(`Error enviando mensaje: ${err.message}`);
            throw err;
        }
    }

    async getQueueInfo() {
        try {
            const queueInfo = await this.channel.checkQueue(CONFIG.rabbitmq.queue);
            
            console.log('\n📊 Información de la cola:');
            console.log('===========================');
            console.log(`🔹 Cola: ${CONFIG.rabbitmq.queue}`);
            console.log(`🔹 Mensajes: ${queueInfo.messageCount}`);
            console.log(`🔹 Consumidores: ${queueInfo.consumerCount}`);
            
            return queueInfo;
        } catch (err) {
            error(`Error obteniendo info de cola: ${err.message}`);
            throw err;
        }
    }

    async purgeQueue() {
        try {
            const result = await this.channel.purgeQueue(CONFIG.rabbitmq.queue);
            success(`Cola purgada. ${result.messageCount} mensajes eliminados`);
        } catch (err) {
            error(`Error purgando cola: ${err.message}`);
            throw err;
        }
    }
}

/**
 * Comandos disponibles
 */
const commands = {
    async upload() {
        info('🚀 Subiendo archivo de ejemplo a GridFS...');
        
        const gridfs = new GridFSManager();
        await gridfs.connect();
        
        try {
            const fileId = await gridfs.uploadFile(CONFIG.files.exampleFile);
            console.log(`\n✅ File ID: ${fileId}`);
            return fileId;
        } finally {
            await gridfs.disconnect();
        }
    },

    async send(fileId, fileName) {
        info('📨 Enviando mensaje FileUploaded a RabbitMQ...');
        
        const rabbitmq = new RabbitMQManager();
        await rabbitmq.connect();
        
        try {
            await rabbitmq.setupQueues();
            await rabbitmq.sendFileUploadedEvent(fileId, fileName);
        } finally {
            await rabbitmq.disconnect();
        }
    },

    async init() {
        info('🔄 Inicializando entorno completo...');
        
        // Subir archivo
        const fileId = await commands.upload();
        const fileName = path.basename(CONFIG.files.exampleFile);
        
        // Enviar mensaje
        await commands.send(fileId, fileName);
        
        success('🎉 Inicialización completa');
        
        console.log('\n📋 Resumen:');
        console.log('============');
        console.log(`🔹 File ID: ${fileId}`);
        console.log(`🔹 File Name: ${fileName}`);
        console.log(`🔹 Exchange: ${CONFIG.rabbitmq.exchange}`);
        console.log(`🔹 Queue: ${CONFIG.rabbitmq.queue}`);
        console.log(`🔹 Routing Key: ${CONFIG.rabbitmq.routingKey}`);
    },

    async status() {
        info('📊 Verificando estado del entorno...');
        
        const gridfs = new GridFSManager();
        const rabbitmq = new RabbitMQManager();
        
        try {
            // Conectar a ambos servicios
            await gridfs.connect();
            await rabbitmq.connect();
            
            // Mostrar información
            await gridfs.listFiles();
            await rabbitmq.getQueueInfo();
            
        } finally {
            await gridfs.disconnect();
            await rabbitmq.disconnect();
        }
    },

    async clean() {
        info('🧹 Limpiando entorno...');
        
        const gridfs = new GridFSManager();
        const rabbitmq = new RabbitMQManager();
        
        try {
            await gridfs.connect();
            await rabbitmq.connect();
            
            await gridfs.cleanFiles();
            await rabbitmq.purgeQueue();
            
            success('Entorno limpiado');
        } finally {
            await gridfs.disconnect();
            await rabbitmq.disconnect();
        }
    },

    help() {
        console.log(`
🚀 Script de Inicialización del Entorno de Test
==============================================

Uso: node ${path.basename(__filename)} <comando>

Comandos disponibles:

  init     Inicialización completa (upload + send)
  upload   Solo subir archivo a GridFS
  send     Solo enviar mensaje a RabbitMQ (requiere fileId fileName)
  status   Mostrar estado actual del entorno
  clean    Limpiar archivos y mensajes
  help     Mostrar esta ayuda

Ejemplos:

  node ${path.basename(__filename)} init
  node ${path.basename(__filename)} upload
  node ${path.basename(__filename)} send 507f1f77bcf86cd799439011 movements-242025.xls
  node ${path.basename(__filename)} status
  node ${path.basename(__filename)} clean

Configuración actual:
  MongoDB: ${CONFIG.mongodb.uri}
  RabbitMQ: ${CONFIG.rabbitmq.url}
  Archivo ejemplo: ${CONFIG.files.exampleFile}
        `);
    }
};

/**
 * Función principal
 */
async function main() {
    const command = process.argv[2];
    
    if (!command || command === 'help' || command === '--help' || command === '-h') {
        commands.help();
        return;
    }
    
    if (!commands[command]) {
        error(`Comando desconocido: ${command}`);
        commands.help();
        process.exit(1);
    }
    
    try {
        switch (command) {
            case 'send':
                const fileId = process.argv[3];
                const fileName = process.argv[4];
                if (!fileId || !fileName) {
                    error('Uso: node init-test-env.js send <fileId> <fileName>');
                    process.exit(1);
                }
                await commands.send(fileId, fileName);
                break;
            default:
                await commands[command]();
                break;
        }
        
        success('Operación completada');
    } catch (err) {
        error(`Error ejecutando comando '${command}': ${err.message}`);
        process.exit(1);
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    main();
}

module.exports = { GridFSManager, RabbitMQManager, commands };
