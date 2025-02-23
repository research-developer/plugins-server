import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

/**
 * Schema for saving a code file (PUT /:filename).
 */
export const CodeFileSaveRequestSchema = z
  .object({
    code: z.string().nonempty({ message: 'Code must be a string and cannot be empty' }),
  })
  .describe('Request body for saving or updating a code file.');

/**
 * Schema for executing code (POST /execute).
 * Either 'filename' or 'code' must be provided.
 */
export const CodeExecutionRequestSchema = z
  .object({
    filename: z.string().optional().describe('Optional filename to execute. If provided, the file must exist.'),
    code: z.string().optional().describe('Optional raw code to execute if a filename is not provided.'),
  })
  .refine((data) => data.filename || data.code, {
    message: "Either 'filename' or 'code' must be provided",
  });

/**
 * Schema for the response from code execution (POST /execute).
 * It returns captured stdout and stderr along with a message and a success flag.
 */
export const CodeExecutionResponseSchema = z
  .object({
    success: z.boolean().describe('Indicates if the operation was successful'),
    message: z.string().describe('Execution result message.'),
    stdout: z.string().nullable().optional().describe('Captured standard output.'),
    stderr: z.string().nullable().optional().describe('Captured standard error.'),
  })
  .describe('Response body for executing code.');

/**
 * Schema for reading a code file (GET /:filename).
 */
export const CodeFileReadResponseSchema = z
  .object({
    success: z.boolean().describe('Indicates if the operation was successful'),
    message: z.string().describe('Message indicating the result of file read operation.'),
    data: z
      .object({
        code: z.string().describe('Content of the code file.'),
      })
      .describe('Data object containing the file content.'),
  })
  .describe('Response body for reading a code file.');

/**
 * Schema for updating a code file using find/replace via PATCH (/:[filename]).
 * The request body now only contains the find/replace message as the filename comes from the URL.
 */
export const CodeFilePatchRequestSchema = z
  .object({
    message: z
      .string()
      .describe('Find/replace command in the format: s<delimiter>find<delimiter>replace<delimiter>flags'),
  })
  .describe('Request body for updating a code file using find/replace.');

/**
 * Schema for the response from replace operation (used for PATCH /:filename).
 * It includes updated file content along with a success flag.
 */
export const CodeReplaceResponseSchema = z
  .object({
    success: z.boolean().describe('Indicates if the operation was successful'),
    message: z.string().describe('Result message for replace operation.'),
    data: z
      .object({
        newContent: z.string().describe('Updated file content after performing replace operation.'),
      })
      .describe('Data object containing the updated file content.'),
  })
  .describe('Response body for replacing code in a file.');

// Maintain backward compatibility for code executor endpoints using original names
export const CodeExecutorRequestBodySchema = CodeExecutionRequestSchema;
export type CodeExecutorRequestBody = z.infer<typeof CodeExecutorRequestBodySchema>;

export const CodeExecutorResponseSchema = CodeExecutionResponseSchema;
export type CodeExecutorResponse = z.infer<typeof CodeExecutorResponseSchema>;
