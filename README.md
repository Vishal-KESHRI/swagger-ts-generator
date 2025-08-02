# Swagger Genius 🚀

**Instantly generate perfect Swagger/OpenAPI 3.0 API contracts from your TypeScript code!**

Zero configuration. Just point it at your code and get production-ready `swagger.json` files in seconds. Works with any validation library and web framework.

## 🎯 What Swagger Genius Does

🔍 **Scans your TypeScript code** - Finds all API routes automatically  
📜 **Extracts validation schemas** - Zod, Joi, Class-Validator support  
🚀 **Generates perfect API contracts** - Complete OpenAPI 3.0 `swagger.json`  
🌐 **Works with any framework** - Express, Fastify, NestJS, @JsonController  
📁 **Cross-file schema resolution** - Imports from separate schema files  
🎯 **TypeScript response detection** - Automatically maps return types  

## Installation

```bash
npm install swagger-genius
```

## ⚡ Quick Start (30 seconds)

**1️⃣ Initialize:**
```bash
npx swagger-scan init
```

**2️⃣ Generate API contract:**
```bash
npx swagger-scan generate
```

**🎉 Done!** Your perfect `swagger.json` API contract is ready to use!

## 💪 Why Choose Swagger Genius?

🚀 **Zero Configuration** - Works out of the box, no setup needed  
⚡ **Lightning Fast** - Generate docs in seconds, not hours  
🔒 **Type Safe** - Leverages TypeScript for accurate API contracts  
🌐 **Framework Agnostic** - Works with Express, Fastify, NestJS, and more  
📁 **Smart Schema Detection** - Finds schemas across multiple files  
🎯 **Production Ready** - Generates OpenAPI 3.0 compliant documentation  

## Configuration

The `swagger-scan.json` file created by `init` command:

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

### Environment Variables (Optional)

```bash
# Change output location
export SWAGGER_OUTPUT_PATH="/custom/path/swagger.json"

# Scan different folders  
export SWAGGER_SCAN_PATHS="src,controllers,routes"

npx swagger-scan generate
```

## Supported Frameworks

### Express
```typescript
app.post('/users', userSchema, (req, res) => {
  res.json({ user: req.body });
});
```

### @JsonController
```typescript
@JsonController('/api')
export class UserController {
  @Post('/users')
  @UseBefore(
    RequestValidatorMiddleware({
      body: CreateUserSchema,
      query: QueryParamsSchema,
      headers: HeadersSchema
    })
  )
  async createUser(): Promise<express.Response<UserResponse>> {
    // Your logic
  }
}
```

### Fastify
```typescript
fastify.post('/users', {
  schema: { body: userSchema }
}, handler);
```

### NestJS
```typescript
@Post('/users')
@Body(CreateUserDto)
async createUser(@Body() body: CreateUserDto) {
  // Handler
}
```

## Schema Examples

### Zod
```typescript
const userSchema = z.object({
  /** User's full name */
  name: z.string().describe('User full name'),
  email: z.string().email(), // User email
  /* Must be 18 or older */
  age: z.number().min(18)
});
```

### Joi  
```typescript
const userSchema = Joi.object({
  /** User's full name */
  name: Joi.string().required().description('User full name'),
  email: Joi.string().email(), // User email
  /* Must be 18 or older */
  age: Joi.number().min(18)
});
```

### Class-Validator
```typescript
export class CreateUserDto {
  /** User's full name */
  @IsString()
  name: string; // Full name

  @IsEmail()
  email: string; // Email address

  /* Must be 18 or older */
  @IsNumber()
  @Min(18) 
  age: number;
}
```

## Description Sources

The library extracts property descriptions from:

- **JSDoc comments:** `/** Description */`
- **Block comments:** `/* Description */`
- **Inline comments:** `// Description`
- **Zod `.describe()`:** `z.string().describe('Description')`
- **Joi `.description()`:** `Joi.string().description('Description')`

## Cross-File Support

**Controller:** `controllers/user.controller.ts`
```typescript
import { CreateUserSchema, UserResponse } from '../schemas/user.schemas';

app.post('/users', CreateUserSchema, (req, res) => {
  res.json({ user: req.body });
});
```

**Schema:** `schemas/user.schemas.ts`
```typescript
export const CreateUserSchema = z.object({
  name: z.string().describe('User name'),
  email: z.string().email()
});

export const UserResponse = z.object({
  id: z.string(),
  name: z.string(), 
  email: z.string()
});
```

## Response Types

Automatically detects response schemas from TypeScript:

```typescript
// Detects TUserResponse type and finds UserResponseSchema
async getUser(): Promise<express.Response<TUserResponse>> {
  return res.json(data);
}
```

## CLI Commands

```bash
# Create config file
swagger-scan init

# Generate swagger.json
swagger-scan generate

# Custom options
swagger-scan generate -c my-config.json
swagger-scan generate -o api.yaml
swagger-scan generate -p "src,controllers"
swagger-scan generate -t "My API" -v "2.0.0"
```

## What Gets Generated

✅ Request body schemas  
✅ Query parameters with validation  
✅ Header parameters  
✅ Path parameters  
✅ Response schemas from TypeScript types  
✅ Nested objects and arrays  
✅ Optional/required fields  
✅ Validation rules (min/max, email, etc.)  
✅ Descriptions from comments  

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

## Example Output

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "My API",
    "version": "1.0.0"
  },
  "paths": {
    "/users": {
      "post": {
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "name": {
                    "type": "string",
                    "description": "User full name"
                  },
                  "email": {
                    "type": "string",
                    "format": "email"
                  }
                },
                "required": ["name", "email"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": {"type": "string"},
                    "name": {"type": "string"}
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SWAGGER_OUTPUT_PATH` | Custom output file path |
| `SWAGGER_SCAN_PATHS` | Folders to scan (comma-separated) |

## License

MIT