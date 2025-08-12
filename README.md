# Swagger Genius

**Automatically generate comprehensive OpenAPI 3.0 specifications from TypeScript code with zero configuration.**

Swagger Genius analyzes your TypeScript codebase to extract API routes, validation schemas, and type definitions, generating production-ready `swagger.json` files with complete documentation including descriptions, validation rules, and response schemas.

## Features

- **Zero Configuration**: Works out of the box with sensible defaults
- **Framework Agnostic**: Supports Express, Fastify, NestJS, and routing-controllers
- **Multiple Validation Libraries**: Zod, Joi, and class-validator support
- **TypeScript Integration**: Extracts types, interfaces, and JSDoc comments
- **Cross-File Resolution**: Automatically resolves imported schemas and types
- **Complete OpenAPI 3.0**: Generates fully compliant specifications
- **Production Ready**: Handles complex validation rules and nested schemas

## Installation

```bash
# Install as development dependency (recommended)
npm install --save-dev swagger-genius

# Or install globally
npm install -g swagger-genius
```

## Quick Start

**Initialize configuration:**
```bash
npx swagger-scan init
```

**Generate API documentation:**
```bash
npx swagger-scan generate
```

Your `swagger.json` file will be generated with complete API documentation.

## Configuration

The `swagger-scan.json` configuration file:

```json
{
  "title": "My API",
  "version": "1.0.0",
  "description": "API documentation",
  "baseUrl": "http://localhost:3000",
  "outputPath": "swagger.json",
  "scanPaths": ["src"],
  "openApiVersion": "3.0.0"
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SWAGGER_OUTPUT_PATH` | Override output file path |
| `SWAGGER_SCAN_PATHS` | Comma-separated list of directories to scan |

## Supported Frameworks

### Express

```typescript
import { CreateUserSchema } from './schemas/user';

app.post('/users', validateBody(CreateUserSchema), (req, res) => {
  res.json({ user: req.body });
});
```

### Fastify

```typescript
import { CreateUserSchema } from './schemas/user';

fastify.post('/users', {
  schema: { body: CreateUserSchema }
}, handler);
```

### NestJS with routing-controllers

```typescript
import { CreateUserDto } from './dto/user.dto';
import { UserResponse } from './types/user.types';

@JsonController('/api/users')
export class UserController {
  @Post('/')
  @UseBefore(RequestValidatorMiddleware.validate(CreateUserSchema))
  async createUser(@Body() userData: CreateUserDto): Promise<UserResponse> {
    return this.userService.create(userData);
  }
}
```

## Schema Support

### Zod Schemas

```typescript
import { z } from 'zod';

export const CreateUserSchema = z.object({
  /** User's full name */
  name: z.string().min(1).describe('User full name'),
  /** User email address */
  email: z.string().email().describe('User email address'),
  /** User age - must be 18 or older */
  age: z.number().min(18).describe('User age (minimum 18)'),
  /** User phone number */
  phone: z.string().optional().describe('User phone number')
});
```

### Joi Schemas

```typescript
import Joi from 'joi';

export const CreateUserSchema = Joi.object({
  /** User's full name */
  name: Joi.string().required().description('User full name'),
  /** User email address */
  email: Joi.string().email().description('User email address'),
  /** User age - must be 18 or older */
  age: Joi.number().min(18).description('User age (minimum 18)'),
  /** User phone number */
  phone: Joi.string().description('User phone number')
});
```

### Class-Validator DTOs

```typescript
import { IsString, IsEmail, IsNumber, Min, IsOptional } from 'class-validator';

export class CreateUserDto {
  /** User's full name */
  @IsString()
  name: string;

  /** User email address */
  @IsEmail()
  email: string;

  /** User age - must be 18 or older */
  @IsNumber()
  @Min(18)
  age: number;

  /** User phone number */
  @IsOptional()
  @IsString()
  phone?: string;
}
```

## TypeScript Type Support

### Interfaces

```typescript
export interface UserResponse {
  /** Unique user identifier */
  id: string;
  /** User's full name */
  name: string;
  /** User email address */
  email: string;
  /** User age */
  age: number;
  /** User phone number */
  phone?: string;
  /** Account creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}
```

### Type Aliases

```typescript
export type CreateUserRequest = {
  /** User's full name */
  name: string;
  /** User email address */
  email: string;
  /** User age - must be 18 or older */
  age: number;
  /** User phone number */
  phone?: string;
};

export type UserStatus = 'active' | 'inactive' | 'pending';
```

### Generic Types

```typescript
export type ApiResponse<T> = {
  /** Response data */
  data: T;
  /** Success indicator */
  success: boolean;
  /** Response message */
  message?: string;
};
```

## Comment Types and Description Sources

Swagger Genius extracts property descriptions from multiple comment formats to generate comprehensive API documentation.

### Supported Comment Types

#### JSDoc Comments (Recommended)

```typescript
export const CreateUserSchema = z.object({
  /** User's full name */
  name: z.string().min(1),
  /** User email address */
  email: z.string().email(),
  /** User age - must be 18 or older */
  age: z.number().min(18)
});
```

#### Schema Method Descriptions

**Zod .describe() Method:**
```typescript
export const CreateUserSchema = z.object({
  name: z.string().min(1).describe('User full name'),
  email: z.string().email().describe('User email address'),
  age: z.number().min(18).describe('User age (minimum 18)')
});
```

**Joi .description() Method:**
```typescript
export const CreateUserSchema = Joi.object({
  name: Joi.string().required().description('User full name'),
  email: Joi.string().email().description('User email address'),
  age: Joi.number().min(18).description('User age (minimum 18)')
});
```

#### Combined Approach (Best Practice)

```typescript
export const CreateUserSchema = z.object({
  /** User's full name */
  name: z.string().min(1).describe('User full name'),
  /** User email address */
  email: z.string().email().describe('User email address')
});
```



## Code Quality and Linting

### ESLint Configuration

Install and configure JSDoc linting for consistent documentation:

```bash
npm install --save-dev eslint-plugin-jsdoc
```

**.eslintrc.json:**
```json
{
  "extends": ["plugin:jsdoc/recommended"],
  "rules": {
    "jsdoc/require-description": "error",
    "jsdoc/require-param-description": "error",
    "jsdoc/require-returns-description": "error",
    "jsdoc/check-descriptions": "error",
    "jsdoc/require-jsdoc": [
      "error",
      {
        "require": {
          "FunctionDeclaration": false,
          "MethodDefinition": false,
          "ClassDeclaration": false,
          "ArrowFunctionExpression": false,
          "FunctionExpression": false
        }
      }
    ]
  }
}
```

### Prettier Configuration

**.prettierrc:**
```json
{
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "quoteProps": "as-needed",
  "trailingComma": "es5"
}
```

### Pre-commit Hooks

**package.json:**
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,js}": [
      "eslint --fix",
      "prettier --write",
      "git add"
    ]
  }
}
```

## CLI Commands

```bash
# Initialize configuration file
swagger-scan init

# Generate swagger.json
swagger-scan generate

# Custom configuration file
swagger-scan generate -c custom-config.json

# Custom output path
swagger-scan generate -o api-docs.json

# Custom scan paths
swagger-scan generate -p "src,controllers"

# Custom title and version
swagger-scan generate -t "My API" -v "2.0.0"
```

## Generated Output

### Request Schema Example

```json
{
  "CreateUserRequest": {
    "type": "object",
    "required": ["name", "email", "age"],
    "properties": {
      "name": {
        "type": "string",
        "minLength": 1,
        "description": "User's full name"
      },
      "email": {
        "type": "string",
        "format": "email",
        "description": "User email address"
      },
      "age": {
        "type": "number",
        "minimum": 18,
        "description": "User age (minimum 18)"
      },
      "phone": {
        "type": "string",
        "description": "User phone number"
      }
    }
  }
}
```

### Complete API Endpoint

```json
{
  "/api/users": {
    "post": {
      "summary": "Create user",
      "description": "Create a new user with the provided information",
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/CreateUserRequest"
            }
          }
        }
      },
      "responses": {
        "201": {
          "description": "User created successfully",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/UserResponse"
              }
            }
          }
        },
        "400": {
          "description": "Validation error",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/ErrorResponse"
              }
            }
          }
        }
      }
    }
  }
}
```

## Cross-File Schema Resolution

Swagger Genius automatically resolves schemas and types across multiple files:

**controllers/user.controller.ts:**
```typescript
import { CreateUserSchema, UserResponse } from '../schemas/user.schemas';
import { RequestValidatorMiddleware } from '../middleware/validation';

@JsonController('/api/users')
export class UserController {
  @Post('/')
  @UseBefore(RequestValidatorMiddleware.validate(CreateUserSchema))
  async createUser(@Body() userData: CreateUserDto): Promise<UserResponse> {
    return this.userService.create(userData);
  }
}
```

**schemas/user.schemas.ts:**
```typescript
export const CreateUserSchema = z.object({
  /** User's full name */
  name: z.string().describe('User name'),
  /** User email address */
  email: z.string().email().describe('User email')
});

export interface UserResponse {
  /** Unique user identifier */
  id: string;
  /** User's full name */
  name: string;
  /** User email address */
  email: string;
}
```

## Programmatic Usage

```typescript
import { SwaggerScanner } from 'swagger-genius';

const scanner = new SwaggerScanner();

await scanner.generateSwagger({
  title: 'My API',
  version: '1.0.0',
  outputPath: 'swagger.json',
  scanPaths: ['src']
});
```

## Troubleshooting

### Descriptions Not Appearing

**Check Comment Format:**
```typescript
// Incorrect - single asterisk
/* User name */
name: z.string()

// Correct - double asterisk JSDoc
/** User name */
name: z.string()
```

**Verify Schema Export:**
```typescript
// Incorrect - not exported
const CreateUserSchema = z.object({...});

// Correct - exported
export const CreateUserSchema = z.object({...});
```

**Check Scan Paths:**
```json
{
  "scanPaths": [
    "src/schemas",
    "src/controllers",
    "src/types"
  ]
}
```

### Validation Not Detected

**Verify Middleware Pattern:**
```typescript
// Correct pattern
@Post('/')
@UseBefore(RequestValidatorMiddleware.validate(CreateUserSchema))
async createUser(@Body() userData: CreateUserDto) {}
```

**Check Import Statements:**
```typescript
// Ensure proper imports
import { CreateUserSchema } from '@/lib/validations';
import { RequestValidatorMiddleware } from '@/middleware/validation';
```

### Debug Mode

```bash
# Enable debug logging
DEBUG=swagger-scan npx swagger-scan generate

# Verbose output
npx swagger-scan generate --verbose
```

## What Gets Generated

- Request body schemas with validation rules
- Query parameters with type information
- Path parameters with descriptions
- Header parameters and validation
- Response schemas from TypeScript return types
- Nested objects and array definitions
- Optional and required field specifications
- Format validation (email, date, etc.)
- Comprehensive error responses

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our GitHub repository.

## Support

For issues, feature requests, or questions, please visit our GitHub repository or contact our support team.