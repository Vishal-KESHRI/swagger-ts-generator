import { SwaggerConfig, RouteInfo, SwaggerSpec } from './types';
import { ZodToSwagger, JoiToSwagger, ClassValidatorToSwagger } from './validators';

export class SwaggerGenerator {
  generate(config: SwaggerConfig, routes: RouteInfo[]): SwaggerSpec {
    const openApiVersion = config.openApiVersion || '3.0.0';
    
    const spec: SwaggerSpec = openApiVersion === '2.0' ? {
      swagger: '2.0',
      info: {
        title: config.title,
        version: config.version,
        description: config.description
      },
      host: config.baseUrl ? new URL(config.baseUrl).host : undefined,
      basePath: config.baseUrl ? new URL(config.baseUrl).pathname : undefined,
      schemes: config.baseUrl ? [new URL(config.baseUrl).protocol.slice(0, -1)] : ['http'],
      consumes: ['application/json'],
      produces: ['application/json'],
      paths: {},
      definitions: {}
    } as any : {
      openapi: openApiVersion,
      info: {
        title: config.title,
        version: config.version,
        description: config.description
      },
      servers: config.baseUrl ? [{ url: config.baseUrl }] : undefined,
      paths: {},
      components: {
        schemas: {}
      }
    };

    routes.forEach(route => {
      this.addRouteToSpec(spec, route);
    });

    return spec;
  }

  private addRouteToSpec(spec: SwaggerSpec, route: RouteInfo): void {
    const path = this.normalizePath(route.path);
    const method = route.method.toLowerCase();

    if (!spec.paths[path]) {
      spec.paths[path] = {};
    }

    const operation: any = {
      summary: `${route.method} ${path}`
    };

    // Add response schemas
    if (route.validation?.responses) {
      operation.responses = {};
      Object.keys(route.validation.responses).forEach(statusCode => {
        const responseSchema = this.convertValidationToSchema(route.validation!.responses![statusCode], route.validation!.type);
        const responseDescription = this.extractResponseDescription(route.validation!.responses![statusCode], statusCode, route.validation!.type);
        operation.responses[statusCode] = {
          description: responseDescription,
          content: {
            'application/json': {
              schema: responseSchema
            }
          }
        };
      });
    } else {
      operation.responses = {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: { type: 'object' }
            }
          }
        }
      };
    }

    // Add request body only for POST/PUT/PATCH methods
    if (route.validation?.body && ['POST', 'PUT', 'PATCH'].includes(route.method)) {
      const schema = this.convertValidationToSchema(route.validation.body, route.validation.type);
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema
          }
        }
      };
    }

    // Add parameters for query/path/header params
    if (route.validation?.query || route.validation?.params || route.validation?.headers) {
      operation.parameters = [];
      
      if (route.validation.params) {
        const paramSchema = this.convertValidationToSchema(route.validation.params, route.validation.type);
        if (paramSchema.properties) {
          Object.keys(paramSchema.properties).forEach(paramName => {
            operation.parameters.push({
              name: paramName,
              in: 'path',
              required: true,
              schema: paramSchema.properties[paramName]
            });
          });
        }
      }

      if (route.validation.query) {
        const querySchema = this.convertValidationToSchema(route.validation.query, route.validation.type);
        if (querySchema.properties) {
          Object.keys(querySchema.properties).forEach(queryName => {
            operation.parameters.push({
              name: queryName,
              in: 'query',
              required: querySchema.required?.includes(queryName) || false,
              schema: querySchema.properties[queryName]
            });
          });
        }
      }

      if (route.validation.headers) {
        const headerSchema = this.convertValidationToSchema(route.validation.headers, route.validation.type);
        if (headerSchema.properties) {
          Object.keys(headerSchema.properties).forEach(headerName => {
            operation.parameters.push({
              name: headerName,
              in: 'header',
              required: headerSchema.required?.includes(headerName) || false,
              schema: headerSchema.properties[headerName]
            });
          });
        }
      }
    }

    spec.paths[path][method] = operation;
  }

  private convertValidationToSchema(validation: any, type: 'zod' | 'joi' | 'class-validator'): any {
    if (type === 'zod') {
      return ZodToSwagger.convert(validation);
    } else if (type === 'joi') {
      return JoiToSwagger.convert(validation);
    } else if (type === 'class-validator') {
      return ClassValidatorToSwagger.convert(validation);
    }
    return { type: 'object' };
  }

  private extractResponseDescription(validation: any, statusCode: string, type: 'zod' | 'joi' | 'class-validator'): string {
    // Try to extract description from schema comments or descriptions
    const schemaDescription = this.getSchemaDescription(validation, type);
    if (schemaDescription) {
      return schemaDescription;
    }

    // Default descriptions based on status code
    const statusDescriptions: Record<string, string> = {
      '200': 'Successful response',
      '201': 'Resource created successfully',
      '204': 'No content',
      '400': 'Bad request',
      '401': 'Unauthorized',
      '403': 'Forbidden',
      '404': 'Resource not found',
      '409': 'Conflict',
      '422': 'Validation error',
      '500': 'Internal server error'
    };

    return statusDescriptions[statusCode] || `Response ${statusCode}`;
  }

  private getSchemaDescription(validation: any, type: 'zod' | 'joi' | 'class-validator'): string | null {
    if (typeof validation !== 'string') return null;

    // Extract description from Zod schema - get the last .describe() which is usually the main schema
    if (type === 'zod') {
      const zodDescMatches = validation.match(/\.describe\(['"`]([^'"`]+)['"`]\)/g);
      if (zodDescMatches && zodDescMatches.length > 0) {
        const lastMatch = zodDescMatches[zodDescMatches.length - 1];
        const descMatch = lastMatch.match(/\.describe\(['"`]([^'"`]+)['"`]\)/);
        if (descMatch) return descMatch[1];
      }
    }

    // Extract description from Joi schema - get the last .description()
    if (type === 'joi') {
      const joiDescMatches = validation.match(/\.description\(['"`]([^'"`]+)['"`]\)/g);
      if (joiDescMatches && joiDescMatches.length > 0) {
        const lastMatch = joiDescMatches[joiDescMatches.length - 1];
        const descMatch = lastMatch.match(/\.description\(['"`]([^'"`]+)['"`]\)/);
        if (descMatch) return descMatch[1];
      }
    }

    // Extract from JSDoc comments
    const jsdocMatch = validation.match(/\/\*\*\s*([^*]+?)\s*\*\//); 
    if (jsdocMatch) {
      return jsdocMatch[1].trim();
    }

    // Extract from block comments
    const blockMatch = validation.match(/\/\*\s*([^*]+?)\s*\*\//); 
    if (blockMatch) {
      return blockMatch[1].trim();
    }

    // Extract from inline comments
    const inlineMatch = validation.match(/\/\/\s*(.+)$/);
    if (inlineMatch) {
      return inlineMatch[1].trim();
    }

    return null;
  }

  private normalizePath(path: string): string {
    // Convert Express/Fastify params to OpenAPI format
    return path.replace(/:(\w+)/g, '{$1}');
  }
}