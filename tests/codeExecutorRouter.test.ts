/// <reference types="jest" />
/* eslint-env jest */
import express from 'express';
import fs from 'fs';
import path from 'path';
import request from 'supertest';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ResponseStatus } from '../src/common/models/serviceResponse';
import { codeExecutorRouter } from '../src/routes/codeExecutor/codeExecutorRouter';

// Create an instance of express app and mount the router
const app = express();
app.use(express.json());
app.use('/', codeExecutorRouter);
const hello_world = 'with entry { print("hello world"); }';

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
    const codeContent = hello_world;

    const response = await request(app).put(`/${filename}`).send({ code: codeContent });

    expect(response.status).toBe(200);
    expect(response.body.success).toBeTruthy();

    // Verify the file content was written
    const filePath = path.join(codeStorageDir, filename);
    const fileData = fs.readFileSync(filePath, 'utf8');
    expect(fileData).toBe(codeContent);
  });

  test('GET /:filename should retrieve file content', async () => {
    const filename = 'test.jac';

    // Ensure file exists
    fs.writeFileSync(path.join(codeStorageDir, filename), hello_world, 'utf8');
    if (!testFiles.includes(filename)) testFiles.push(filename);

    const response = await request(app).get(`/${filename}`);
    expect(response.status).toBe(200);
    expect(response.body.responseObject.code.trim()).toBe(hello_world.trim());
  });

  test('PATCH /:filename valid request should update file content', async () => {
    const filename = 'hello.jac';
    fs.writeFileSync(path.join(codeStorageDir, filename), hello_world, 'utf8');
    if (!testFiles.includes(filename)) testFiles.push(filename);

    const message = 's/hello/hi/g';
    const response = await request(app).patch(`/${filename}`).send({ message });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain(`File ${filename} updated successfully`);

    // Verify the updated content
    const updatedContent = fs.readFileSync(path.join(codeStorageDir, filename), 'utf8');
    expect(updatedContent).toBe(hello_world.replace('hello', 'hi'));
  });

  test('PATCH /:filename with invalid replacement message should return error', async () => {
    const filename = 'invalid.jac';
    fs.writeFileSync(path.join(codeStorageDir, filename), hello_world, 'utf8');
    if (!testFiles.includes(filename)) testFiles.push(filename);

    const message = 'not a valid format';
    const response = await request(app).patch(`/${filename}`).send({ message });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Invalid find/replace message format');
  });

  test('DELETE /:filename should delete a file', async () => {
    const filename = 'test.jac';
    fs.writeFileSync(path.join(codeStorageDir, filename), hello_world, 'utf8');
    if (!testFiles.includes(filename)) testFiles.push(filename);

    const response = await request(app).delete(`/${filename}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBeTruthy();
    expect(response.body.message).toContain(`File ${filename} moved to trash successfully`);
  });

  test('DELETE /:filename should return error if file does not exist', async () => {
    const filename = 'nonexistent.jac';
    const response = await request(app).delete(`/${filename}`);
    expect(response.status).toBe(404);
    expect(response.body.success).toBeFalsy();
    expect(response.body.message).toContain(`File ${filename} not found`);
  });
});
