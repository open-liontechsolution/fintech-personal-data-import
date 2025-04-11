import { Db, GridFSBucket } from 'mongodb';
/**
 * Clase para gestionar la conexión con MongoDB
 */
declare class MongoDBService {
    private client;
    private db;
    private gridFSBucket;
    /**
     * Conecta a MongoDB
     */
    connect(): Promise<void>;
    /**
     * Devuelve la instancia de la base de datos
     */
    getDB(): Db;
    /**
     * Devuelve la instancia de GridFSBucket
     */
    getGridFSBucket(): GridFSBucket;
    /**
     * Cierra la conexión con MongoDB
     */
    close(): Promise<void>;
}
declare const _default: MongoDBService;
export default _default;
