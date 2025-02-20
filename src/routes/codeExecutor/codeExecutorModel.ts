import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const CodeExecutorRequestBodySchema = z.object({
  // Optional filename; if not provided, the code will be interpreted as raw code input
  filename: z.string().optional().describe('Optional filename to execute.'),
  // Code content to be saved/executed
  code: z.string().optional().describe('Code content to execute'),
});

export type CodeExecutorRequestBody = z.infer<typeof CodeExecutorRequestBodySchema>;

export const CodeExecutorResponseSchema = z.object({
  // Message describing the result of the operation
  message: z.string().describe('Execution result message'),
  // Standard output
  stdout: z.string().nullable().optional().describe('Captured standard output'),
  // Standard error
  stderr: z.string().nullable().optional().describe('Captured standard error'),
});

export type CodeExecutorResponse = z.infer<typeof CodeExecutorResponseSchema>;
