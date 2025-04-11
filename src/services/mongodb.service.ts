import { MongoClient, Db, GridFSBucket } from 'mongodb';
import config from '../config/config';
import logger from '../utils/logger';

/**
 * Clase para gestionar la conexión con MongoDB
 */
class MongoDBService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private gridFSBucket: GridFSBucket | null = null;

  /**
   * Conecta a MongoDB
   */
  async connect(): Promise<void> {
    try {
      this.client = new MongoClient(config.mongodb.uri);
      await this.client.connect();
      
      this.db = this.client.db(config.mongodb.dbName);
      this.gridFSBucket = new GridFSBucket(this.db);
      
      logger.info('Conectado a MongoDB');
    } catch (error) {
      logger.error({ error }, 'Error al conectar con MongoDB');
      throw error;
    }
  }

  /**
   * Devuelve la instancia de la base de datos
   */
  getDB(): Db {
    if (!this.db) {
      throw new Error('MongoDB no está conectado');
    }
    return this.db;
  }

  /**
   * Devuelve la instancia de GridFSBucket
   */
  getGridFSBucket(): GridFSBucket {
    if (!this.gridFSBucket) {
      throw new Error('MongoDB no está conectado');
    }
    return this.gridFSBucket;
  }

  /**
   * Cierra la conexión con MongoDB
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.gridFSBucket = null;
      logger.info('Conexión con MongoDB cerrada');
    }
  }
}

// Singleton instance
export default new MongoDBService();
