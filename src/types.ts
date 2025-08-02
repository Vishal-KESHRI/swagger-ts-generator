export interface SwaggerConfig {
  title: string;
  version: string;
  description?: string;
  baseUrl?: string;
  outputPath: string;
  scanPaths: string[];
  openApiVersion?: '2.0' | '3.0.0' | '3.0.1' | '3.0.2' | '3.0.3' | '3.1.0';
}

export interface RouteInfo {
  method: string;
  path: string;
  handler: string;
  validation?: ValidationSchema;
  headers?: Record<string, any>;
  responses?: Record<string, any>;
}

export interface ValidationSchema {
  type: 'zod' | 'joi' | 'class-validator';
  body?: any;
  query?: any;
  params?: any;
  headers?: any;
  responses?: Record<string, any>;
}

export interface SwaggerPath {
  [method: string]: {
    summary?: string;
    description?: string;
    parameters?: any[];
    requestBody?: any;
    responses: Record<string, any>;
    tags?: string[];
  };
}

export interface SwaggerSpec {
  openapi?: string;
  swagger?: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string }>;
  host?: string;
  basePath?: string;
  schemes?: string[];
  consumes?: string[];
  produces?: string[];
  paths: Record<string, SwaggerPath>;
  components?: {
    schemas: Record<string, any>;
  };
  definitions?: Record<string, any>;
}