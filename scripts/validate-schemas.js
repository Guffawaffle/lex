import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs/promises';
import path from 'path';

async function validateSchemas() {
  // AJV with draft-07 and draft 2020-12 support
  const ajv = new Ajv({ 
    strict: true, 
    allErrors: true,
    // Allow draft 2020-12 schemas
    strictSchema: false
  });
  addFormats(ajv);
  
  const schemasDir = 'canon/schemas';
  const files = await fs.readdir(schemasDir);
  
  // Filter for JSON files, excluding tsconfig.json and other non-schema files
  const schemaFiles = files.filter(f => 
    f.endsWith('.json') && 
    !f.includes('tsconfig') &&
    !f.includes('.tsbuildinfo')
  );
  
  let errors = 0;
  let warnings = 0;
  
  for (const file of schemaFiles) {
    const schemaPath = path.join(schemasDir, file);
    const schema = JSON.parse(await fs.readFile(schemaPath, 'utf-8'));
    
    // Check for required hardening properties first (independent of compilation)
    const hardeningErrors = [];
    const hardeningWarnings = [];
    
    // Required: $id field (MUST fail CI if missing)
    if (!schema.$id) {
      hardeningErrors.push('missing $id field');
    }
    
    // Required: additionalProperties: false for object types (MUST fail CI if missing)
    if (schema.type === 'object' && schema.additionalProperties !== false) {
      hardeningErrors.push('missing additionalProperties: false');
    }
    
    // Recommended: examples array (warning only)
    if (!schema.examples || !Array.isArray(schema.examples) || schema.examples.length === 0) {
      hardeningWarnings.push('missing examples array');
    }
    
    if (hardeningErrors.length > 0) {
      console.error(`  ✗ ${file}: ${hardeningErrors.join(', ')}`);
      errors++;
      continue; // Skip further validation if hardening requirements not met
    }
    
    if (hardeningWarnings.length > 0) {
      console.warn(`  ⚠ ${file}: ${hardeningWarnings.join(', ')}`);
      warnings++;
    }
    
    // Validate schema itself with AJV and compile it
    let validate;
    try {
      validate = ajv.compile(schema);
      console.log(`✓ ${file} is valid`);
    } catch (err) {
      console.error(`✗ ${file}: ${err.message}`);
      errors++;
      continue; // Skip example validation if schema itself is invalid
    }
    
    // Validate examples against the schema (reuse compiled validator)
    if (schema.examples && Array.isArray(schema.examples)) {
      schema.examples.forEach((example, idx) => {
        const valid = validate(example);
        if (!valid) {
          console.error(`  ✗ ${file}: example[${idx}] is invalid:`, validate.errors);
          errors++;
        }
      });
    }
  }
  
  if (errors > 0) {
    console.error(`\n${errors} schema(s) failed validation`);
    process.exit(1);
  }
  
  if (warnings > 0) {
    console.warn(`\n⚠ ${warnings} schema(s) have hardening warnings`);
  }
  
  console.log(`\n✓ All ${schemaFiles.length} schemas valid`);
}

validateSchemas().catch(console.error);
