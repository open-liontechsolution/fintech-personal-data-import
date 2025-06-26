import { FileProcessorService } from '../services/file-processor.service';
import { MongoClient, GridFSBucket } from 'mongodb';

jest.mock('mongodb');
jest.mock('amqplib');

describe('FileProcessorService', () => {
  let fileProcessorService: FileProcessorService;
  let mockMongoClient: jest.Mocked<MongoClient>;
  let mockGridFSBucket: jest.Mocked<GridFSBucket>;

  beforeEach(() => {
    mockMongoClient = {
      db: jest.fn(),
      close: jest.fn(),
    } as any;

    mockGridFSBucket = {
      openDownloadStream: jest.fn(),
      delete: jest.fn(),
    } as any;

    (MongoClient.connect as jest.Mock).mockResolvedValue(mockMongoClient);
    mockMongoClient.db.mockReturnValue({
      collection: jest.fn().mockReturnValue({
        insertOne: jest.fn(),
        updateOne: jest.fn(),
        findOne: jest.fn(),
      }),
    } as any);

    fileProcessorService = new FileProcessorService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processFile', () => {
    it('should process CSV file successfully', async () => {
      const mockEvent = {
        fileId: '507f1f77bcf86cd799439011',
        userId: 'test-user',
        fileName: 'test.csv',
        fileType: 'text/csv',
        options: {
          headers: true,
          delimiter: ',',
        },
      };

      // Mock successful processing
      const result = await fileProcessorService.processFile(mockEvent);
      
      expect(result).toBeDefined();
    });

    it('should handle file processing errors', async () => {
      const mockEvent = {
        fileId: 'invalid-id',
        userId: 'test-user',
        fileName: 'test.csv',
        fileType: 'text/csv',
        options: {},
      };

      // Mock error scenario
      mockMongoClient.db.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(fileProcessorService.processFile(mockEvent)).rejects.toThrow();
    });
  });

  describe('downloadFileFromGridFS', () => {
    it('should download file from GridFS successfully', async () => {
      const fileId = '507f1f77bcf86cd799439011';
      const filePath = '/tmp/test-file.csv';

      // Mock successful download
      const mockStream = {
        pipe: jest.fn().mockReturnValue({
          on: jest.fn((event, callback) => {
            if (event === 'finish') callback();
            return { on: jest.fn() };
          }),
        }),
      };

      mockGridFSBucket.openDownloadStream.mockReturnValue(mockStream as any);

      const result = await fileProcessorService.downloadFileFromGridFS(fileId, filePath);
      
      expect(result).toBe(filePath);
      expect(mockGridFSBucket.openDownloadStream).toHaveBeenCalledWith(expect.any(Object));
    });
  });
});
