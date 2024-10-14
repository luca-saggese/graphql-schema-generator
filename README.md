# GraphQL Schema Generator

This project contains a script to generate a GraphQL schema from a TypeScript file containing type definitions. The generated schema is saved as a `.graphql` file, with the types `Query` and `Mutation` reorganized to appear at the end of the file.

## How to Use

1. **Install Dependencies**
   
   Make sure you have Node.js installed. Install the necessary dependencies by running:
   
   ```bash
   npm install
   ```

2. **Input and Output Paths**

   The script reads the TypeScript file containing GraphQL type definitions and generates a GraphQL schema file. You can specify the input and output paths using the following parameters:
   
   - **Input File**: Use `-i` or `--input` to specify the input file, e.g., `-i graphqlTypes.generated.tsx`.
   - **Output File**: Use `-o` or `--output` to specify the output file, e.g., `-o graphqlSchema.generated.graphql`.

3. **Run the Script**

   You can run the script using the command:
   
   ```bash
   node main.js -i graphqlTypes.generated.tsx -o graphqlSchema.generated.graphql
   ```

   The script will read the TypeScript definitions, extract the GraphQL type definitions, and generate the `.graphql` schema file.

4. **Generated Output**

   The output file (`graphqlSchema.generated.graphql`) will contain the GraphQL schema. The types `Query` and `Mutation` are moved to the end of the file for consistency.

## Script Explanation

- **Parsing TypeScript**: The script uses Babel to parse the TypeScript file into an Abstract Syntax Tree (AST).
- **AST Traversal**: Babel Traverse is used to find and extract GraphQL definitions.
- **GraphQL AST Manipulation**: The GraphQL schema is parsed, and definitions are reorganized so that `type Query` and `type Mutation` are at the end of the file.
- **Output**: The final `.graphql` file is generated and saved.

## Functions in the Script

- **generateScalarsDefinition**: Extracts scalar types from TypeScript definitions.
- **generateTypeScriptDefinition**: Converts TypeScript type literals into GraphQL types.
- **generateMember**: Generates fields for GraphQL types based on TypeScript properties.
- **generateType**: Converts TypeScript types to GraphQL-compatible types.

## Notes

- This script is designed to work with TypeScript files that contain GraphQL-related type definitions.
- The output file structure ensures that `Query` and `Mutation` types are consistently placed at the end of the schema, which can be helpful for readability and organization.

## Example

If the input TypeScript file contains:

```typescript
type Scalars = {
  DateTime: string;
};

type User = {
  id: string;
  name: string;
};

enum Role {
  ADMIN,
  USER
}
```

The output `.graphql` file will look like:

```graphql
scalar DateTime

type User {
  id: String!
  name: String!
}

enum Role {
  ADMIN,
  USER
}

type Query {
  ...
}

type Mutation {
  ...
}
```

## Troubleshooting

- **No GraphQL Type Definitions Found**: Ensure that the TypeScript file contains valid type definitions that can be converted to GraphQL.
- **Path Errors**: Verify that the input and output file paths are correct.

## License

This project is licensed under the MIT License.
