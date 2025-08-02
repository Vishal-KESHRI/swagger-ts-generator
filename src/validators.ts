export class ZodToSwagger {
  static convert(zodSchema: string): any {
    if (zodSchema.includes('z.object(')) {
      return this.parseZodObject(zodSchema);
    }
    return { type: 'object' };
  }

  private static parseZodObject(zodSchema: string): any {
    const properties: any = {};
    const required: string[] = [];

    // Extract the content between the braces
    const braceMatch = zodSchema.match(/\{([\s\S]*?)\}/);
    if (!braceMatch) return { type: 'object', properties: {} };
    
    const propsString = braceMatch[1];
    
    // Split by lines and parse each property with descriptions
    const allLines = propsString.split('\n');
    
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim();
      if (!line || line.startsWith('//')) continue;
      
      const propMatch = line.match(/(\w+):\s*z\.(\w+)\(\)(.*)/);
      if (propMatch) {
        const [, name, baseType, modifiers] = propMatch;
        const isOptional = modifiers.includes('.optional()');
        const hasMin = modifiers.match(/\.min\((\d+)\)/);
        const hasEmail = modifiers.includes('.email()');
        const hasDescription = modifiers.match(/\.describe\(['"`]([^'"`]+)['"`]\)/);
        
        const property: any = { type: this.mapZodType(baseType) };
        
        if (hasEmail) {
          property.format = 'email';
        }
        if (hasMin) {
          property.minimum = parseInt(hasMin[1]);
        }
        if (hasDescription) {
          property.description = hasDescription[1];
        }
        
        // Check for inline comment description
        const inlineComment = line.match(/\/\/\s*(.+)$/);
        if (inlineComment && !property.description) {
          property.description = inlineComment[1].trim();
        }
        
        // Check previous line for JSDoc or block comment
        if (i > 0 && !property.description) {
          const prevLine = allLines[i - 1].trim();
          const jsdocMatch = prevLine.match(/\/\*\*\s*(.+?)\s*\*\*?\//); 
          const blockMatch = prevLine.match(/\/\*\s*(.+?)\s*\*\//); 
          if (jsdocMatch) {
            property.description = jsdocMatch[1];
          } else if (blockMatch) {
            property.description = blockMatch[1];
          }
        }
        
        properties[name] = property;
        
        if (!isOptional) {
          required.push(name);
        }
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined
    };
  }

  private static mapZodType(zodType: string): string {
    const typeMap: Record<string, string> = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      date: 'string'
    };
    return typeMap[zodType] || 'string';
  }
}

export class JoiToSwagger {
  static convert(joiSchema: string): any {
    if (joiSchema.includes('Joi.object(')) {
      return this.parseJoiObject(joiSchema);
    }
    return { type: 'object' };
  }

  private static parseJoiObject(joiSchema: string): any {
    const properties: any = {};
    const required: string[] = [];

    // Extract the content between the braces
    const braceMatch = joiSchema.match(/\{([\s\S]*?)\}/);
    if (!braceMatch) return { type: 'object', properties: {} };
    
    const propsString = braceMatch[1];
    
    // Split by lines and parse each property with descriptions
    const allLines = propsString.split('\n');
    
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim();
      if (!line || line.startsWith('//')) continue;
      
      const propMatch = line.match(/(\w+):\s*Joi\.(\w+)\(\)(.*)/);
      if (propMatch) {
        const [, name, baseType, modifiers] = propMatch;
        const isRequired = modifiers.includes('.required()');
        const isArray = baseType === 'array' && modifiers.includes('.items(');
        const hasDescription = modifiers.match(/\.description\(['"`]([^'"`]+)['"`]\)/);
        
        let property: any = { type: this.mapJoiType(baseType) };
        
        if (isArray) {
          const itemsMatch = modifiers.match(/\.items\(Joi\.(\w+)\(\)\)/);
          if (itemsMatch) {
            property.items = { type: this.mapJoiType(itemsMatch[1]) };
          }
        }
        
        if (hasDescription) {
          property.description = hasDescription[1];
        }
        
        // Check for inline comment description
        const inlineComment = line.match(/\/\/\s*(.+)$/);
        if (inlineComment && !property.description) {
          property.description = inlineComment[1].trim();
        }
        
        // Check previous line for JSDoc comment
        if (i > 0 && !property.description) {
          const prevLine = allLines[i - 1].trim();
          const jsdocMatch = prevLine.match(/\/\*\*\s*(.+?)\s*\*\*?\//); 
          if (jsdocMatch) {
            property.description = jsdocMatch[1];
          }
        }
        
        properties[name] = property;
        
        if (isRequired) {
          required.push(name);
        }
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined
    };
  }

  private static mapJoiType(joiType: string): string {
    const typeMap: Record<string, string> = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      date: 'string'
    };
    return typeMap[joiType] || 'string';
  }
}

export class ClassValidatorToSwagger {
  static convert(classSchema: string): any {
    return this.parseClassValidator(classSchema);
  }

  private static parseClassValidator(classSchema: string): any {
    const properties: any = {};
    const required: string[] = [];

    const lines = classSchema.split('\n').map(line => line.trim()).filter(line => line);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for property declarations with decorators
      if (line.includes('@') && i + 1 < lines.length) {
        const decoratorLine = line;
        const propertyLine = lines[i + 1];
        
        const propMatch = propertyLine.match(/(\w+)\s*[?:]\s*(\w+)/);
        if (propMatch) {
          const [, name, type] = propMatch;
          const isOptional = propertyLine.includes('?');
          
          const property: any = { type: this.mapClassValidatorType(type) };
          
          // Parse decorators for validation rules and descriptions
          if (decoratorLine.includes('@IsEmail')) {
            property.format = 'email';
          }
          if (decoratorLine.includes('@Min(')) {
            const minMatch = decoratorLine.match(/@Min\((\d+)\)/);
            if (minMatch) property.minimum = parseInt(minMatch[1]);
          }
          if (decoratorLine.includes('@IsArray')) {
            property.type = 'array';
            property.items = { type: 'string' };
          }
          
          // Extract description from @ApiProperty decorator
          const apiPropertyMatch = decoratorLine.match(/@ApiProperty\(\{[^}]*description:\s*['"`]([^'"`]+)['"`]/);
          if (apiPropertyMatch) {
            property.description = apiPropertyMatch[1];
          }
          
          // Check for inline comment description
          const inlineComment = propertyLine.match(/\/\/\s*(.+)$/);
          if (inlineComment && !property.description) {
            property.description = inlineComment[1].trim();
          }
          
          // Check for JSDoc comment above decorators
          if (i > 1 && !property.description) {
            const jsdocLine = lines[i - 1];
            const jsdocMatch = jsdocLine.match(/\/\*\*\s*(.+?)\s*\*\*?\//); 
            if (jsdocMatch) {
              property.description = jsdocMatch[1];
            }
          }
          
          properties[name] = property;
          
          if (!isOptional && !decoratorLine.includes('@IsOptional')) {
            required.push(name);
          }
        }
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined
    };
  }

  private static mapClassValidatorType(cvType: string): string {
    const typeMap: Record<string, string> = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      Date: 'string'
    };
    return typeMap[cvType] || 'string';
  }
}