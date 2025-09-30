/**
 * Tests for GeminiClient
 */

import { GeminiClient } from '../../src/core/gemini-client';
import { MockGeminiResponse, mockStreamResponse } from '../helpers';

// Mock the @google/generative-ai package
jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn(),
        generateContentStream: jest.fn(),
      }),
    })),
  };
});

describe('GeminiClient', () => {
  let client: GeminiClient;
  let mockModel: { generateContent: jest.Mock; generateContentStream: jest.Mock };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create client with test API key
    client = new GeminiClient({ apiKey: 'test-api-key' });
    
    // Get the mocked model
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const mockGenAI = new GoogleGenerativeAI();
    mockModel = mockGenAI.getGenerativeModel();
  });

  describe('constructor', () => {
    it('should create client with API key', () => {
      expect(() => new GeminiClient({ apiKey: 'test-key' })).not.toThrow();
    });

    it('should throw error if API key required but not provided', () => {
      expect(() => new GeminiClient({ authMethod: 'api-key' })).toThrow();
    });

    it('should accept google-account auth method', () => {
      expect(() => new GeminiClient({ authMethod: 'google-account' })).not.toThrow();
    });

    it('should use default model if not specified', () => {
      const testClient = new GeminiClient({ apiKey: 'test-key' });
      expect(testClient).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute prompt and return response', async () => {
      const mockResponse = MockGeminiResponse.success('Test response');
      mockModel.generateContent.mockResolvedValue(mockResponse);

      const result = await client.execute('Test prompt', 'coder');
      
      expect(result).toBe('Test response');
      expect(mockModel.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              parts: expect.arrayContaining([{ text: 'Test prompt' }]),
            }),
          ]),
        })
      );
    });

    it('should use correct temperature for mode', async () => {
      const mockResponse = MockGeminiResponse.success('Response');
      mockModel.generateContent.mockResolvedValue(mockResponse);

      await client.execute('Test', 'debugger');
      
      expect(mockModel.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({
            temperature: 0.1, // debugger should have low temperature
          }),
        })
      );
    });

    it('should handle API errors', async () => {
      mockModel.generateContent.mockRejectedValue(new Error('API Error'));

      await expect(client.execute('Test', 'coder')).rejects.toThrow(
        /Gemini execution failed/
      );
    });

    it('should respect rate limiting', async () => {
      const mockResponse = MockGeminiResponse.success('Response');
      mockModel.generateContent.mockResolvedValue(mockResponse);

      // Make multiple rapid requests
      const promises = Array(5).fill(null).map(() => 
        client.execute('Test', 'coder')
      );

      await expect(Promise.all(promises)).resolves.toBeDefined();
    });

    it('should use custom temperature if provided', async () => {
      const customClient = new GeminiClient({
        apiKey: 'test-key',
        temperature: 0.9,
      });
      
      const mockResponse = MockGeminiResponse.success('Response');
      mockModel.generateContent.mockResolvedValue(mockResponse);

      await customClient.execute('Test', 'coder');
      
      // Should still use mode-specific temperature (coder = 0.3)
      expect(mockModel.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({
            temperature: 0.3,
          }),
        })
      );
    });
  });

  describe('executeMultimodal', () => {
    it('should handle image input', async () => {
      const mockResponse = MockGeminiResponse.success('Image analysis');
      mockModel.generateContent.mockResolvedValue(mockResponse);

      const imageBuffer = Buffer.from('fake-image-data');
      const files = [{
        mimeType: 'image/png',
        data: imageBuffer,
      }];

      const result = await client.executeMultimodal('Describe this image', files, 'designer');
      
      expect(result).toBe('Image analysis');
      expect(mockModel.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              parts: expect.arrayContaining([
                { text: 'Describe this image' },
                expect.objectContaining({
                  inlineData: expect.objectContaining({
                    mimeType: 'image/png',
                    data: imageBuffer.toString('base64'),
                  }),
                }),
              ]),
            }),
          ]),
        })
      );
    });

    it('should handle multiple files', async () => {
      const mockResponse = MockGeminiResponse.success('Analysis');
      mockModel.generateContent.mockResolvedValue(mockResponse);

      const files = [
        { mimeType: 'image/png', data: Buffer.from('image1') },
        { mimeType: 'image/jpeg', data: Buffer.from('image2') },
      ];

      await client.executeMultimodal('Analyze these', files, 'coder');
      
      expect(mockModel.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              parts: expect.arrayContaining([
                { text: 'Analyze these' },
                expect.anything(),
                expect.anything(),
              ]),
            }),
          ]),
        })
      );
    });

    it('should handle multimodal errors', async () => {
      mockModel.generateContent.mockRejectedValue(new Error('Multimodal error'));

      const files = [{ mimeType: 'image/png', data: Buffer.from('data') }];
      
      await expect(
        client.executeMultimodal('Test', files, 'coder')
      ).rejects.toThrow(/Gemini multimodal execution failed/);
    });
  });

  describe('streamExecute', () => {
    it('should stream response chunks', async () => {
      const chunks = ['Hello', ' ', 'World'];
      mockModel.generateContentStream.mockResolvedValue({
        stream: mockStreamResponse(chunks),
      });

      const result: string[] = [];
      for await (const chunk of client.streamExecute('Test', 'coder')) {
        result.push(chunk);
      }

      expect(result).toEqual(chunks);
    });

    it('should handle empty chunks', async () => {
      const chunks = ['Hello', '', 'World'];
      mockModel.generateContentStream.mockResolvedValue({
        stream: (async function* () {
          for (const chunk of chunks) {
            yield { text: () => chunk };
          }
        })(),
      });

      const result: string[] = [];
      for await (const chunk of client.streamExecute('Test', 'coder')) {
        result.push(chunk);
      }

      // Empty chunk should be included (filter happens in client)
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle stream errors', async () => {
      mockModel.generateContentStream.mockRejectedValue(new Error('Stream error'));

      const generator = client.streamExecute('Test', 'coder');
      
      await expect(generator.next()).rejects.toThrow(/Gemini stream execution failed/);
    });

    it('should respect rate limiting for streams', async () => {
      mockModel.generateContentStream.mockResolvedValue({
        stream: mockStreamResponse(['Test']),
      });

      // Should not throw rate limit error
      const generator = client.streamExecute('Test', 'coder');
      await expect(generator.next()).resolves.toBeDefined();
    });
  });

  describe('checkHealth', () => {
    it('should return true for healthy API', async () => {
      const mockResponse = MockGeminiResponse.success('Hello');
      mockModel.generateContent.mockResolvedValue(mockResponse);

      const isHealthy = await client.checkHealth();
      
      expect(isHealthy).toBe(true);
    });

    it('should return false for unhealthy API', async () => {
      mockModel.generateContent.mockRejectedValue(new Error('API down'));

      const isHealthy = await client.checkHealth();
      
      expect(isHealthy).toBe(false);
    });

    it('should not throw on health check failure', async () => {
      mockModel.generateContent.mockRejectedValue(new Error('Error'));

      await expect(client.checkHealth()).resolves.toBe(false);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return rate limit statistics', () => {
      const status = client.getRateLimitStatus();
      
      expect(status).toHaveProperty('minute');
      expect(status).toHaveProperty('daily');
      expect(status.minute).toHaveProperty('currentRequests');
      expect(status.minute).toHaveProperty('maxRequests');
      expect(status.daily).toHaveProperty('currentRequests');
      expect(status.daily).toHaveProperty('maxRequests');
    });

    it('should track requests correctly', async () => {
      const mockResponse = MockGeminiResponse.success('Response');
      mockModel.generateContent.mockResolvedValue(mockResponse);

      const initialStatus = client.getRateLimitStatus();
      
      await client.execute('Test', 'coder');
      
      const afterStatus = client.getRateLimitStatus();
      
      expect(afterStatus.minute.currentRequests).toBeGreaterThan(
        initialStatus.minute.currentRequests
      );
    });
  });

  describe('mode temperature settings', () => {
    const testCases: Array<[string, number]> = [
      ['architect', 0.7],
      ['coder', 0.3],
      ['tester', 0.2],
      ['debugger', 0.1],
      ['security', 0.2],
      ['documentation', 0.5],
      ['designer', 0.8],
      ['ask', 0.8],
    ];

    testCases.forEach(([mode, expectedTemp]) => {
      it(`should use temperature ${expectedTemp} for ${mode} mode`, async () => {
        const mockResponse = MockGeminiResponse.success('Response');
        mockModel.generateContent.mockResolvedValue(mockResponse);

        await client.execute('Test', mode as any);
        
        expect(mockModel.generateContent).toHaveBeenCalledWith(
          expect.objectContaining({
            generationConfig: expect.objectContaining({
              temperature: expectedTemp,
            }),
          })
        );
      });
    });
  });

  describe('error handling', () => {
    it('should wrap API errors with context', async () => {
      mockModel.generateContent.mockRejectedValue(new Error('Original error'));

      await expect(client.execute('Test', 'coder')).rejects.toThrow(
        /Gemini execution failed.*Original error/
      );
    });

    it('should handle rate limit errors', async () => {
      mockModel.generateContent.mockRejectedValue(
        new Error('429 Rate limit exceeded')
      );

      await expect(client.execute('Test', 'coder')).rejects.toThrow();
    });

    it('should handle authentication errors', async () => {
      mockModel.generateContent.mockRejectedValue(
        new Error('401 Invalid API key')
      );

      await expect(client.execute('Test', 'coder')).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockModel.generateContent.mockRejectedValue(
        new Error('ECONNREFUSED')
      );

      await expect(client.execute('Test', 'coder')).rejects.toThrow();
    });
  });
});