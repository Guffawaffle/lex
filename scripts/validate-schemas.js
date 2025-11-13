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
  for (const file of schemaFiles) {
    const schemaPath = path.join(schemasDir, file);
    const schema = JSON.parse(await fs.readFile(schemaPath, 'utf-8'));
    
    try {
      ajv.compile(schema);
      console.log(`✓ ${file} is valid`);
    } catch (err) {
      console.error(`✗ ${file}: ${err.message}`);
      errors++;
    }
  }
  
  if (errors > 0) {
    console.error(`\n${errors} schema(s) failed validation`);
    process.exit(1);
  }
  
  console.log(`\n✓ All ${schemaFiles.length} schemas valid`);
}

validateSchemas().catch(console.error);
