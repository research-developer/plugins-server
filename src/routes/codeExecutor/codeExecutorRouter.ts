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

import {
  CodeExecutionResponseSchema,
  CodeFilePatchRequestSchema,
  CodeFileReadResponseSchema,
  CodeFileSaveRequestSchema,
  CodeReplaceResponseSchema,
} from './codeExecutorModel';

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

// GET: Return source code
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

// POST: Execute file and return result
codeExecutorRouter.post('/:filename', async (req: Request, res: Response) => {
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
  let command: string;
  if (filename.endsWith('.py')) {
    command = `python ${filePath}`;
  } else if (filename.endsWith('.jac')) {
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

// PUT: Create new file
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
  if (fs.existsSync(filePath)) {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      `File ${filename} already exists`,
      null,
      StatusCodes.CONFLICT
    );
    return handleServiceResponse(serviceResponse, res);
  }
  try {
    fs.writeFileSync(filePath, code, 'utf8');
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Success,
      `File ${filename} created successfully`,
      null,
      StatusCodes.OK
    );
    return handleServiceResponse(serviceResponse, res);
  } catch (err) {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      `Error creating file: ${(err as Error).message}`,
      null,
      StatusCodes.INTERNAL_SERVER_ERROR
    );
    return handleServiceResponse(serviceResponse, res);
  }
});

// PATCH: Update existing file using find/replace logic
codeExecutorRouter.patch('/:filename', async (req: Request, res: Response) => {
  const { filename } = req.params;
  const { message } = req.body;
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
    if (newContent === fileContent) {
      const serviceResponse = new ServiceResponse(
        ResponseStatus.Failed,
        `No matching text found in file ${filename} or replacement did not change the content`,
        { newContent },
        StatusCodes.BAD_REQUEST
      );
      return handleServiceResponse(serviceResponse, res);
    }
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
      `Error updating file: ${(err as Error).message}`,
      null,
      StatusCodes.INTERNAL_SERVER_ERROR
    );
    return handleServiceResponse(serviceResponse, res);
  }
});

// DELETE: Move file to .trash folder
codeExecutorRouter.delete('/:filename', async (req: Request, res: Response) => {
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
  // Define trash folder path
  const trashDir = path.join(codeStorageDir, '.trash');
  if (!fs.existsSync(trashDir)) {
    fs.mkdirSync(trashDir, { recursive: true });
  }
  const trashPath = path.join(trashDir, filename);
  try {
    fs.renameSync(filePath, trashPath);
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Success,
      `File ${filename} moved to trash successfully`,
      null,
      StatusCodes.OK
    );
    return handleServiceResponse(serviceResponse, res);
  } catch (err) {
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Failed,
      `Error moving file to trash: ${(err as Error).message}`,
      null,
      StatusCodes.INTERNAL_SERVER_ERROR
    );
    return handleServiceResponse(serviceResponse, res);
  }
});

// Initialize OpenAPI registry for the code executor
export const codeExecutorRegistry = new OpenAPIRegistry();

// Register the endpoints with updated schemas
codeExecutorRegistry.registerPath({
  method: 'get',
  path: '/code/:filename',
  tags: ['Code Executor'],
  responses: createApiResponse(CodeFileReadResponseSchema, 'Success'),
});

codeExecutorRegistry.registerPath({
  method: 'post',
  path: '/code/:filename',
  tags: ['Code Executor'],
  responses: createApiResponse(CodeExecutionResponseSchema, 'Success'),
});

codeExecutorRegistry.registerPath({
  method: 'put',
  path: '/code/:filename',
  tags: ['Code Executor'],
  request: { body: createApiRequestBody(CodeFileSaveRequestSchema, 'application/json') },
  responses: createApiResponse(CodeExecutionResponseSchema, 'Success'),
});

codeExecutorRegistry.registerPath({
  method: 'patch',
  path: '/code/:filename',
  tags: ['Code Executor'],
  request: { body: createApiRequestBody(CodeFilePatchRequestSchema, 'application/json') },
  responses: createApiResponse(CodeReplaceResponseSchema, 'Success'),
});

codeExecutorRegistry.registerPath({
  method: 'delete',
  path: '/code/:filename',
  tags: ['Code Executor'],
  responses: createApiResponse(CodeExecutionResponseSchema, 'Success'),
});

export { codeExecutorRouter };
