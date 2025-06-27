/**
 * Path security utilities for Gemini Code Flow
 */

import path from 'path';
import fs from 'fs-extra';

export class PathSecurityError extends Error {
  constructor(message: string, attemptedPath?: string) {
    super(message);
    this.name = 'PathSecurityError';
    if (attemptedPath) {
      (this as Error & { attemptedPath?: string }).attemptedPath = attemptedPath;
    }
  }
}

export class PathSecurity {
  /**
   * Safely resolve and validate a file path
   */
  static async resolveSafePath(
    inputPath: string,
    baseDir: string = process.cwd(),
    options: {
      mustExist?: boolean;
      maxSize?: number;
      allowedExtensions?: string[];
      requireReadable?: boolean;
      requireWritable?: boolean;
    } = {}
  ): Promise<string> {
    const {
      mustExist = true,
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedExtensions,
      requireReadable = true,
      requireWritable = false
    } = options;

    if (!inputPath || typeof inputPath !== 'string') {
      throw new PathSecurityError('Path must be a non-empty string');
    }

    // Normalize and resolve the path
    const normalizedPath = path.normalize(inputPath);
    const resolvedPath = path.resolve(baseDir, normalizedPath);
    
    // Get real paths to handle symlinks
    let realPath: string;
    let realBaseDir: string;
    
    try {
      realBaseDir = await fs.realpath(baseDir);
      realPath = mustExist ? await fs.realpath(resolvedPath) : resolvedPath;
    } catch (error) {
      if (mustExist) {
        throw new PathSecurityError(`Path does not exist: ${inputPath}`, inputPath);
      }
      realPath = resolvedPath;
      realBaseDir = await fs.realpath(baseDir);
    }

    // Security check: ensure path is within base directory
    if (!realPath.startsWith(realBaseDir + path.sep) && realPath !== realBaseDir) {
      throw new PathSecurityError(
        `Path traversal attempt detected: ${inputPath}`,
        inputPath
      );
    }

    // Additional security checks for existing files
    if (mustExist) {
      try {
        const stats = await fs.stat(realPath);

        // Check if it's a file (not directory, socket, etc.)
        if (!stats.isFile()) {
          throw new PathSecurityError(`Path is not a regular file: ${inputPath}`, inputPath);
        }

        // Check file size
        if (maxSize && stats.size > maxSize) {
          throw new PathSecurityError(
            `File too large: ${stats.size} bytes (max: ${maxSize})`,
            inputPath
          );
        }

        // Check file extension if specified
        if (allowedExtensions && allowedExtensions.length > 0) {
          const ext = path.extname(realPath).toLowerCase();
          const normalizedExtensions = allowedExtensions.map(e => 
            e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`
          );
          
          if (!normalizedExtensions.includes(ext)) {
            throw new PathSecurityError(
              `File extension not allowed: ${ext}. Allowed: ${normalizedExtensions.join(', ')}`,
              inputPath
            );
          }
        }

        // Check file permissions
        if (requireReadable) {
          try {
            await fs.access(realPath, fs.constants.R_OK);
          } catch (error) {
            throw new PathSecurityError(`File not readable: ${inputPath}`, inputPath);
          }
        }

        if (requireWritable) {
          try {
            await fs.access(realPath, fs.constants.W_OK);
          } catch (error) {
            throw new PathSecurityError(`File not writable: ${inputPath}`, inputPath);
          }
        }

      } catch (error) {
        if (error instanceof PathSecurityError) {
          throw error;
        }
        throw new PathSecurityError(
          `Cannot access file: ${error instanceof Error ? error.message : 'Unknown error'}`,
          inputPath
        );
      }
    }

    return realPath;
  }

  /**
   * Create a safe output path for generated files
   */
  static createSafeOutputPath(
    baseDir: string,
    filename: string,
    extension: string = '.txt'
  ): string {
    if (!filename || typeof filename !== 'string') {
      throw new PathSecurityError('Filename must be a non-empty string');
    }

    // Sanitize filename - remove path separators and dangerous characters
    const sanitized = filename
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Replace dangerous chars
      .replace(/\.\./g, '_') // Replace .. 
      .replace(/^\.+/, '_') // Replace leading dots
      .trim();

    if (!sanitized) {
      throw new PathSecurityError('Filename cannot be sanitized to a valid name');
    }

    // Ensure extension is safe
    const safeExtension = extension.startsWith('.') ? extension : `.${extension}`;
    const finalFilename = sanitized + safeExtension;

    // Create full path
    const outputPath = path.join(baseDir, finalFilename);
    
    // Ensure it's still within base directory after joining
    const resolvedOutput = path.resolve(outputPath);
    const resolvedBase = path.resolve(baseDir);
    
    if (!resolvedOutput.startsWith(resolvedBase + path.sep) && resolvedOutput !== resolvedBase) {
      throw new PathSecurityError('Generated path would escape base directory');
    }

    return outputPath;
  }

  /**
   * Ensure a directory exists and is safe to use
   */
  static async ensureSafeDirectory(dirPath: string, baseDir?: string): Promise<string> {
    if (!dirPath || typeof dirPath !== 'string') {
      throw new PathSecurityError('Directory path must be a non-empty string');
    }

    const resolvedPath = path.resolve(baseDir || process.cwd(), dirPath);
    
    if (baseDir) {
      const resolvedBase = path.resolve(baseDir);
      if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
        throw new PathSecurityError('Directory path would escape base directory');
      }
    }

    try {
      await fs.ensureDir(resolvedPath);
      
      // Verify we can write to it
      await fs.access(resolvedPath, fs.constants.W_OK);
      
      return resolvedPath;
    } catch (error) {
      throw new PathSecurityError(
        `Cannot create or access directory: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get safe MIME type for file
   */
  static getSafeMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    const safeMimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.html': 'text/html',
      '.xml': 'application/xml'
    };

    return safeMimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Check if file type is allowed for processing
   */
  static isAllowedFileType(filePath: string, allowedTypes: string[] = []): boolean {
    const ext = path.extname(filePath).toLowerCase();
    
    const defaultAllowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt', '.md'];
    const allowed = allowedTypes.length > 0 ? allowedTypes : defaultAllowed;
    
    return allowed.some(type => 
      type.startsWith('.') ? type === ext : `.${type}` === ext
    );
  }
}

export default PathSecurity;