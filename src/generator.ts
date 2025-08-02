import { SwaggerConfig, RouteInfo, SwaggerSpec } from './types';
import { ZodToSwagger, JoiToSwagger, ClassValidatorToSwagger } from './validators';

export class SwaggerGenerator {
  generate(config: SwaggerConfig, routes: RouteInfo[]): SwaggerSpec {
    const spec: SwaggerSpec = {
      openapi: '3.0.0',
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
        operation.responses[statusCode] = {
          description: statusCode === '200' ? 'Success' : `Response ${statusCode}`,
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
          description: 'Success',
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

  private normalizePath(path: string): string {
    // Convert Express/Fastify params to OpenAPI format
    return path.replace(/:(\w+)/g, '{$1}');
  }
}