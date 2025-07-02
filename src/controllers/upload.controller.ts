import { Request, Response } from 'express';
import { GridFSBucket, ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import MongoDBService from '../services/mongodb.service';
import logger from '../utils/logger';

/**
 * Controlador para manejo de uploads de archivos
 */
export const uploadController = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        error: 'No file provided',
        message: 'Please provide a file using the "file" field',
        timestamp: new Date().toISOString()
      });
      return;
    }

    const db = MongoDBService.getDB();
    if (!db) {
      throw new Error('Database not connected');
    }

    // Usar GridFS para almacenar el archivo
    const bucket = new GridFSBucket(db, { bucketName: 'fs' });
    
    // Generar ID único para el archivo
    const fileId = new ObjectId();
    const uploadId = uuidv4();

    // Metadata del archivo
    const metadata = {
      uploadId,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date(),
      userId: req.body.userId || 'anonymous', // Opcional desde el form
      bankName: req.body.bankName || 'unknown', // Opcional desde el form
      description: req.body.description || '',
    };

    // Crear stream de upload a GridFS
    const uploadStream = bucket.openUploadStreamWithId(fileId, req.file.originalname, {
      metadata
    });

    // Promesa para manejar la subida
    const uploadPromise = new Promise<ObjectId>((resolve, reject) => {
      uploadStream.on('error', reject);
      uploadStream.on('finish', () => {
        logger.info({
          fileId: fileId.toString(),
          uploadId,
          fileName: req.file!.originalname,
          size: req.file!.size
        }, 'File uploaded to GridFS successfully');
        resolve(fileId);
      });
    });

    // Escribir el buffer al stream
    uploadStream.end(req.file.buffer);

    // Esperar a que se complete la subida
    await uploadPromise;

    // Respuesta exitosa (SIN enviar mensaje a RabbitMQ)
    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        fileId: fileId.toString(),
        uploadId,
        fileName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        uploadedAt: metadata.uploadedAt.toISOString(),
        metadata
      },
      note: 'File is stored in GridFS but not yet queued for processing. Use RabbitMQ to trigger processing.',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error({ error, fileName: req.file?.originalname }, 'Error uploading file');
    
    res.status(500).json({
      error: 'Upload failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString()
    });
  }
};
