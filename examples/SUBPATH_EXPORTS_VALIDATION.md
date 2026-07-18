# Subpath Exports Validation

The canonical public path inventory is [Public Package API](../docs/PUBLIC_API.md). It is checked
against `package.json`, build output, and representative runtime symbols with:

```bash
npm run build
npm run check:public-api
```

The release-grade check installs the generated tarball into a temporary consumer, imports all
declared runtime and JSON Schema paths, compiles all declaration paths, rejects an undeclared
internal import, and runs the JavaScript consumer example:

```bash
npm run test:smoke
```

This file intentionally contains no second hand-maintained export list.
