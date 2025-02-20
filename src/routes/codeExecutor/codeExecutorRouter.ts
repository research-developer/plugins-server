// src/routes/codeExecutor/codeExecutorRouter.ts
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { exec } from 'child_process';
import express, { Request, Response, Router } from 'express';
import fs from 'fs';
import { StatusCodes } from 'http-status-codes';
import path from 'path';

import { createApiRequestBody } from '@/api-docs/openAPIRequestBuilders';
import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { handleServiceResponse } from '@/common/utils/httpHandlers';

import { CodeExecutorRequestBodySchema, CodeExecutorResponseSchema } from './codeExecutorModel';

// Define the storage directory for code files
const codeStorageDir = path.join(__dirname, '../../..', 'code_storage');

// Ensure the code_storage directory exists
if (!fs.existsSync(codeStorageDir)) {
  fs.mkdirSync(codeStorageDir, { recursive: true });
}

// Helper to allow only .py and .jac files
function isAllowedFile(filename: string): boolean {
  return filename.endsWith('.py') || filename.endsWith('.jac');
}

const codeExecutorRouter: Router = express.Router();

/**
 * PUT /:filename
 * Endpoint to save or update a code file.
 */
codeExecutorRouter.put('/:filename', async (req: Request, res: Response) => {
  const { filename } = req.params;
  const { code } = req.body;

  if (!isAllowedFile(filename)) {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      'File type not allowed',
      null,
      StatusCodes.BAD_REQUEST
    );
    return handleServiceResponse(serviceResponse, res);
  }

  if (typeof code !== 'string') {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      'Code must be a string',
      null,
      StatusCodes.BAD_REQUEST
    );
    return handleServiceResponse(serviceResponse, res);
  }

  const filePath = path.join(codeStorageDir, filename);
  try {
    fs.writeFileSync(filePath, code, 'utf8');
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Success,
      `File ${filename} saved successfully`,
      null,
      StatusCodes.OK
    );
    return handleServiceResponse(serviceResponse, res);
  } catch (err) {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      `Error saving file: ${(err as Error).message}`,
      null,
      StatusCodes.INTERNAL_SERVER_ERROR
    );
    return handleServiceResponse(serviceResponse, res);
  }
});

/**
 * GET /:filename
 * Endpoint to retrieve the content of a saved file.
 */
codeExecutorRouter.get('/:filename', async (req: Request, res: Response) => {
  const { filename } = req.params;
  if (!isAllowedFile(filename)) {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      'File type not allowed',
      null,
      StatusCodes.BAD_REQUEST
    );
    return handleServiceResponse(serviceResponse, res);
  }

  const filePath = path.join(codeStorageDir, filename);
  if (!fs.existsSync(filePath)) {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      `File ${filename} not found`,
      null,
      StatusCodes.NOT_FOUND
    );
    return handleServiceResponse(serviceResponse, res);
  }
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Success,
      `File ${filename} read successfully`,
      { code },
      StatusCodes.OK
    );
    return handleServiceResponse(serviceResponse, res);
  } catch (err) {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      `Error reading file: ${(err as Error).message}`,
      null,
      StatusCodes.INTERNAL_SERVER_ERROR
    );
    return handleServiceResponse(serviceResponse, res);
  }
});

/**
 * POST /execute
 * Endpoint to execute a code file or directly provided code.
 * If a filename is provided, runs that file. Otherwise, if raw code is provided, creates a temporary file.
 */
codeExecutorRouter.post('/execute', async (req: Request, res: Response) => {
  // eslint-disable-next-line prefer-const
  let { filename, code } = req.body;
  let filePath: string;

  if (filename) {
    if (!isAllowedFile(filename)) {
      const serviceResponse = new ServiceResponse(
        ResponseStatus.Failed,
        'File type not allowed',
        null,
        StatusCodes.BAD_REQUEST
      );
      return handleServiceResponse(serviceResponse, res);
    }
    filePath = path.join(codeStorageDir, filename);
    if (!fs.existsSync(filePath)) {
      const serviceResponse = new ServiceResponse(
        ResponseStatus.Failed,
        `File ${filename} not found`,
        null,
        StatusCodes.NOT_FOUND
      );
      return handleServiceResponse(serviceResponse, res);
    }
  } else if (code) {
    // Default to a temporary .py file if no filename provided
    filename = `temp_${Date.now()}.py`;
    filePath = path.join(codeStorageDir, filename);
    try {
      fs.writeFileSync(filePath, code, 'utf8');
    } catch (err) {
      const serviceResponse = new ServiceResponse(
        ResponseStatus.Failed,
        `Error saving temporary file: ${(err as Error).message}`,
        null,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
      return handleServiceResponse(serviceResponse, res);
    }
  } else {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      'Either filename or code must be provided',
      null,
      StatusCodes.BAD_REQUEST
    );
    return handleServiceResponse(serviceResponse, res);
  }

  // Determine the command to execute
  let command: string;
  if (filename.endsWith('.py')) {
    // Use python command (ensure python is in the host's PATH)
    command = `python ${filePath}`;
  } else if (filename.endsWith('.jac')) {
    // Hypothetical command for .jac files; update if needed
    command = `jac run ${filePath}`;
  } else {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      'Unsupported file extension',
      null,
      StatusCodes.BAD_REQUEST
    );
    return handleServiceResponse(serviceResponse, res);
  }

  // Run the command and capture output
  exec(command, (error, stdout, stderr) => {
    if (error) {
      const serviceResponse = new ServiceResponse(
        ResponseStatus.Failed,
        `Error executing file: ${error.message}`,
        { stdout, stderr },
        StatusCodes.INTERNAL_SERVER_ERROR
      );
      return handleServiceResponse(serviceResponse, res);
    }
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Success,
      `Executed file ${filename} successfully`,
      { stdout, stderr },
      StatusCodes.OK
    );
    return handleServiceResponse(serviceResponse, res);
  });
});

// New endpoint: Git-style find/replace functionality
codeExecutorRouter.post('/replace', async (req: Request, res: Response) => {
  const { filename, message } = req.body;
  if (!filename || typeof filename !== 'string') {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      'Filename must be provided as a string',
      null,
      StatusCodes.BAD_REQUEST
    );
    return handleServiceResponse(serviceResponse, res);
  }
  if (!message || typeof message !== 'string') {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      'Replacement message must be provided as a string',
      null,
      StatusCodes.BAD_REQUEST
    );
    return handleServiceResponse(serviceResponse, res);
  }
  if (!isAllowedFile(filename)) {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      'File type not allowed',
      null,
      StatusCodes.BAD_REQUEST
    );
    return handleServiceResponse(serviceResponse, res);
  }
  const filePath = path.join(codeStorageDir, filename);
  if (!fs.existsSync(filePath)) {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      `File ${filename} not found`,
      null,
      StatusCodes.NOT_FOUND
    );
    return handleServiceResponse(serviceResponse, res);
  }
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    // Parse the find/replace message in the format s<delimiter>find<delimiter>replace<delimiter>flags
    const regexPattern = /^s(.)(.*?)\1(.*?)\1([g]?)$/;
    const match = message.match(regexPattern);
    if (!match) {
      const serviceResponse = new ServiceResponse(
        ResponseStatus.Failed,
        'Invalid find/replace message format. Expected format: s<delimiter>find<delimiter>replace<delimiter>flags',
        null,
        StatusCodes.BAD_REQUEST
      );
      return handleServiceResponse(serviceResponse, res);
    }
    const findPattern = match[2];
    const replaceStr = match[3];
    const flags = match[4] || '';
    let regExp: RegExp;
    try {
      regExp = new RegExp(findPattern, flags);
    } catch (err) {
      const serviceResponse = new ServiceResponse(
        ResponseStatus.Failed,
        `Invalid regular expression: ${(err as Error).message}`,
        null,
        StatusCodes.BAD_REQUEST
      );
      return handleServiceResponse(serviceResponse, res);
    }
    const newContent = fileContent.replace(regExp, replaceStr);
    fs.writeFileSync(filePath, newContent, 'utf8');
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Success,
      `File ${filename} updated successfully`,
      { newContent },
      StatusCodes.OK
    );
    return handleServiceResponse(serviceResponse, res);
  } catch (err) {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      `Error processing file: ${(err as Error).message}`,
      null,
      StatusCodes.INTERNAL_SERVER_ERROR
    );
    return handleServiceResponse(serviceResponse, res);
  }
});

// Initialize OpenAPI registry for the code executor
export const codeExecutorRegistry = new OpenAPIRegistry();

// Register the paths and operations for the code executor
codeExecutorRegistry.registerPath({
  method: 'put',
  path: '/:filename',
  tags: ['Code Executor'],
  request: createApiRequestBody(CodeExecutorRequestBodySchema, 'application/json'),
  responses: createApiResponse(CodeExecutorResponseSchema, 'Success'),
});

export { codeExecutorRouter };
