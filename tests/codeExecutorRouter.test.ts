/// <reference types="jest" />
/* eslint-env jest */
import express from 'express';
import fs from 'fs';
import path from 'path';
import request from 'supertest';

import { codeExecutorRouter } from '../src/routes/codeExecutor/codeExecutorRouter';

// Create an instance of express app and mount the router
const app = express();
app.use(express.json());
app.use('/', codeExecutorRouter);

// Define the code storage directory (same as used in the router)
const codeStorageDir = path.join(process.cwd(), 'code_storage');

// Helper array to track test files for cleanup
const testFiles: string[] = [];

// Cleanup function to remove created test files
afterAll(() => {
  testFiles.forEach((filename) => {
    const filePath = path.join(codeStorageDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
});

describe('CodeExecutor Endpoints', () => {
  test('PUT /:filename should save a file', async () => {
    const filename = 'test.jac';
    testFiles.push(filename);
    const codeContent = 'print("hello world")';

    const response = await request(app).put(`/${filename}`).send({ code: codeContent });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain(`File ${filename} saved successfully`);

    // Verify the file content was written
    const filePath = path.join(codeStorageDir, filename);
    const fileData = fs.readFileSync(filePath, 'utf8');
    expect(fileData).toBe(codeContent);
  });

  test('GET /:filename should retrieve file content', async () => {
    const filename = 'test.jac';
    const codeContent = `
      with entry {
        print("hello world");
      }
    `;

    // Ensure file exists
    fs.writeFileSync(path.join(codeStorageDir, filename), codeContent, 'utf8');
    if (!testFiles.includes(filename)) testFiles.push(filename);

    const response = await request(app).get(`/${filename}`);
    expect(response.status).toBe(200);
    expect(response.body.data.code.trim()).toBe(codeContent.trim());
  });

  test('POST /replace valid request should update file content', async () => {
    const filename = 'hello.jac';
    const initialContent = 'hello world';
    fs.writeFileSync(path.join(codeStorageDir, filename), initialContent, 'utf8');
    if (!testFiles.includes(filename)) testFiles.push(filename);

    const message = 's/hello/hi/g';
    const response = await request(app).post('/replace').send({ filename, message });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain(`File ${filename} updated successfully`);

    // Verify the updated content
    const updatedContent = fs.readFileSync(path.join(codeStorageDir, filename), 'utf8');
    expect(updatedContent).toBe('hi world');
  });

  test('POST /replace with invalid replacement message should return error', async () => {
    const filename = 'invalid.jac';
    const initialContent = 'some content';
    fs.writeFileSync(path.join(codeStorageDir, filename), initialContent, 'utf8');
    if (!testFiles.includes(filename)) testFiles.push(filename);

    const message = 'not a valid format';
    const response = await request(app).post('/replace').send({ filename, message });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Invalid find/replace message format');
  });
});
