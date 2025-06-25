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
    disconnect(): Promise<void>;
    /**
     * Alias para disconnect (mantener compatibilidad)
     */
    close(): Promise<void>;
    /**
     * Verifica el estado de la conexión con MongoDB
     */
    healthCheck(): Promise<{
        status: string;
        latency?: number;
    }>;
    /**
     * Verifica si está conectado
     */
    isConnected(): boolean;
    /**
     * Obtiene estadísticas de la base de datos
     */
    getStats(): Promise<any>;
}
declare const _default: MongoDBService;
export default _default;
