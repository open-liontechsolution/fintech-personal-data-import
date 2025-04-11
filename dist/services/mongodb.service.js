"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongodb_1 = require("mongodb");
const config_1 = __importDefault(require("../config/config"));
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Clase para gestionar la conexión con MongoDB
 */
class MongoDBService {
    constructor() {
        this.client = null;
        this.db = null;
        this.gridFSBucket = null;
    }
    /**
     * Conecta a MongoDB
     */
    async connect() {
        try {
            this.client = new mongodb_1.MongoClient(config_1.default.mongodb.uri);
            await this.client.connect();
            this.db = this.client.db(config_1.default.mongodb.dbName);
            this.gridFSBucket = new mongodb_1.GridFSBucket(this.db);
            logger_1.default.info('Conectado a MongoDB');
        }
        catch (error) {
            logger_1.default.error({ error }, 'Error al conectar con MongoDB');
            throw error;
        }
    }
    /**
     * Devuelve la instancia de la base de datos
     */
    getDB() {
        if (!this.db) {
            throw new Error('MongoDB no está conectado');
        }
        return this.db;
    }
    /**
     * Devuelve la instancia de GridFSBucket
     */
    getGridFSBucket() {
        if (!this.gridFSBucket) {
            throw new Error('MongoDB no está conectado');
        }
        return this.gridFSBucket;
    }
    /**
     * Cierra la conexión con MongoDB
     */
    async close() {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
            this.gridFSBucket = null;
            logger_1.default.info('Conexión con MongoDB cerrada');
        }
    }
}
// Singleton instance
exports.default = new MongoDBService();
//# sourceMappingURL=mongodb.service.js.map