import express from 'express';
import { z } from 'zod';
import Joi from 'joi';
import { CreateUserDto, UpdateUserDto, CreatePostDto } from './dto';

const app = express();
app.use(express.json());

// Zod validation schemas
const createUserSchema = z.object({
  /** User's full name */
  name: z.string().describe('User full name'),
  email: z.string().email(), // User email address
  age: z.number().min(18) // Must be 18 or older
});

const updateUserSchema = z.object({
  name: z.string().optional().describe('Updated user name'),
  email: z.string().email().optional() // Updated email
});

// Joi validation schemas
const createPostSchema = Joi.object({
  /** Post title */
  title: Joi.string().required().description('Post title'),
  content: Joi.string().required(), // Post content
  tags: Joi.array().items(Joi.string()) // Optional tags
});

// Express routes with validation
app.get('/users', (req, res) => {
  res.json({ users: [] });
});

app.get('/users/:id', (req, res) => {
  const { id } = req.params;
  res.json({ user: { id, name: 'John' } });
});

app.post('/users', createUserSchema, (req, res) => {
  res.json({ user: req.body });
});

app.put('/users/:id', updateUserSchema, (req, res) => {
  res.json({ user: req.body });
});

app.post('/posts', createPostSchema, (req, res) => {
  res.json({ post: req.body });
});

app.delete('/users/:id', (req, res) => {
  res.json({ message: 'User deleted' });
});

// Class-validator routes
app.post('/users/dto', CreateUserDto, (req, res) => {
  res.json({ user: req.body });
});

app.put('/users/dto/:id', UpdateUserDto, (req, res) => {
  res.json({ user: req.body });
});

app.post('/posts/dto', CreatePostDto, (req, res) => {
  res.json({ post: req.body });
});

export default app;