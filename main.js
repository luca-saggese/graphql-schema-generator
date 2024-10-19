const fs = require('fs');
const path = require('path');
const { parse, print, visit } = require('graphql');
const babelParser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

// Command line arguments
const args = process.argv.slice(2);
const inputFileArgIndex = args.findIndex(arg => arg === '-i');
const outputFileArgIndex = args.findIndex(arg => arg === '-o');

// Check if input file is provided
if (inputFileArgIndex === -1 || !args[inputFileArgIndex + 1]) {
    console.error('Error: Please provide an input file using -i flag.');
    process.exit(1);
}

const inputFilePath = path.resolve(args[inputFileArgIndex + 1]);
const outputFilePath = outputFileArgIndex !== -1 && args[outputFileArgIndex + 1] ? path.resolve(args[outputFileArgIndex + 1]) : null;

const mutationArgs = {};

// Read the input TypeScript file
fs.readFile(inputFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading file:', err);
        return;
    }

    try {
        // Parse the TypeScript file into an AST using Babel
        const ast = babelParser.parse(data, {
            sourceType: 'module',
            plugins: ['typescript', 'jsx'],
        });

        let typeDefs = '';

        // Traverse the AST to find GraphQL type definitions and TypeScript types
        traverse(ast, {
            // Extract tagged template expressions like gql or graphql
            TaggedTemplateExpression(path) {
                if (
                    path.node.tag.name === 'gql' ||
                    (path.node.tag.type === 'Identifier' && path.node.tag.name === 'graphql')
                ) {
                    typeDefs += path.node.quasi.quasis.map((quasi) => quasi.value.cooked).join('') + '\n';
                }
            },
            // Extract TypeScript type alias declarations
            TSTypeAliasDeclaration(path) {

                const { id, typeAnnotation } = path.node;
                // Check if the type alias is a Mutation argument type
                if (id.name.startsWith('Mutation') && id.name.endsWith('Args')) {
                    mutationArgs[id.name] = generateArgumentsDefinition(typeAnnotation);
                }
                // Handle Scalars definition
                if (id.name === 'Scalars') {
                    typeDefs += generateScalarsDefinition(typeAnnotation);
                } else if (id && typeAnnotation) {
                    // Generate TypeScript type definition
                    const typeDefinition = generateTypeScriptDefinition(typeAnnotation);
                    if (typeDefinition) {
                        typeDefs += `type ${id.name} ${typeDefinition}\n`;
                    }
                }
            },

            // Extract TypeScript enum declarations
            TSEnumDeclaration(path) {
                const { id, members } = path.node;
                if (id && members) {
                    typeDefs += `enum ${id.name} {\n${members.map(member => member.id.name.toUpperCase()).join(', ')}\n}\n`;
                }
            },
        });

        if (!typeDefs) {
            throw new Error('No GraphQL type definitions found in the file.');
        }

        // Parse the GraphQL SDL into an AST
        const parsedAST = parse(typeDefs);

        // Reorganize AST so that type Query is the last definition
        const definitions = [...parsedAST.definitions];
        const queryIndex = definitions.findIndex(def => def.kind === 'ObjectTypeDefinition' && def.name.value === 'Query');
        if (queryIndex > -1) {
            const [queryDef] = definitions.splice(queryIndex, 1);
            definitions.push(queryDef);
        }

        // Rebuild Query parameters and change type to input
        let query = definitions.find(def => def.kind === 'ObjectTypeDefinition' && (def.name.value === 'Query' ))//|| def.name.value === 'Mutation')
        if (query) {
            query.fields.forEach(field => {
                const queryArgs = definitions.find(def => def.kind === 'ObjectTypeDefinition' && ( def.name.value.toLowerCase() === `Query${field.name.value}Args`.toLowerCase()));
                if (queryArgs) {
                    field.arguments = queryArgs.fields;
                    // Change argument type to input

                    queryArgs.fields.forEach(arg => {
                        const t = definitions.find(def => def.kind === 'ObjectTypeDefinition' && arg.type.type && arg.type.type.name && def.name.value === arg.type.type.name.value);
                        if (t) {
                            t.kind = 'InputObjectTypeDefinition';
                        }
                    });
                }
            });
        }

        // Rebuild Mutation parameters and change type to input
        query = definitions.find(def => def.kind === 'ObjectTypeDefinition' && (def.name.value === 'Mutation' ))//|| def.name.value === 'Mutation')
        if (query) {
            query.fields.forEach(field => {
                const queryArgs = definitions.find(def => def.kind === 'ObjectTypeDefinition' && ( def.name.value.toLowerCase() === `Mutation${field.name.value}Args`.toLowerCase()));
                if (queryArgs) {
                    field.arguments = queryArgs.fields;
                    // Change argument type to input

                    queryArgs.fields.forEach(arg => {
                        const t = definitions.find(def => def.kind === 'ObjectTypeDefinition' && arg.type.type && arg.type.type.name && def.name.value === arg.type.type.name.value);
                        if (t) {
                            t.kind = 'InputObjectTypeDefinition';
                        }
                    });
                }
            });
        }



        const updatedAST = {
            ...parsedAST,
            // remove unecessary Args types
            definitions: definitions.filter(def => !def.name.value.match(/Mutation.*Args/) && !def.name.value.match(/Query.*Args/)),
        };



        // Generate the updated GraphQL schema string from the AST
        const schemaString = print(updatedAST);

        if (outputFilePath) {
            // Write the regenerated schema to an output file
            fs.writeFile(outputFilePath, schemaString, 'utf8', (writeErr) => {
                if (writeErr) {
                    console.error('Error writing file:', writeErr);
                } else {
                    console.log('GraphQL schema successfully regenerated at:', outputFilePath);
                }
            });
        } else {
            // Write the schema to console
            console.log(schemaString);
        }
    } catch (parseError) {
        console.error('Error parsing or extracting GraphQL types:', parseError);
    }
});

// Generate scalar type definitions
function generateScalarsDefinition(typeAnnotation) {
    switch (typeAnnotation.type) {
        case 'TSTypeLiteral':
            if (typeAnnotation.members.length > 0) {
                return `scalar ${typeAnnotation.members.map(member => member.key.name).join('\n scalar ')}\n`;
            }
            return ''; // Return empty if there are no members
        default:
            return '';
    }
}

// Generate arguments definition for mutations and queries
function generateArgumentsDefinition(typeAnnotation) {
    switch (typeAnnotation.type) {
        case 'TSTypeLiteral':
            if (typeAnnotation.members.length > 0) {
                return `(${typeAnnotation.members.map(member => generateMember(member)).join(', ')})`;
            }
            return ''; // Return empty if there are no members
        case 'TSIntersectionType':
            const ann = typeAnnotation.types.find(t => t.type === 'TSTypeLiteral');
            if (ann && ann.members.length > 0) {
                return `(n${ann.members.map(member => generateMember(member)).join(', ')})`;
            }
        default:
            return '';
    }
}

// Generate TypeScript type definition
function generateTypeScriptDefinition(typeAnnotation) {
    switch (typeAnnotation.type) {
        case 'TSTypeLiteral':
            if (typeAnnotation.members.length > 0) {
                return `{
${typeAnnotation.members.map(member => generateMember(member)).join('\n')}
}`;
            }
            return ''; // Return empty if there are no members
        case 'TSIntersectionType':
            const ann = typeAnnotation.types.find(t => t.type === 'TSTypeLiteral');
            if (ann && ann.members.length > 0) {
                return `{
${ann.members.map(member => generateMember(member)).join('\n')}
}`;
            }
        default:
            return '';
    }
}

// Generate individual member of a type
function generateMember(member) {
    if (member.type === 'TSPropertySignature' && member.key && member.typeAnnotation) {
        const key = member.key.name;
        const type = generateType(member.typeAnnotation.typeAnnotation);
        const optional = member.optional ? '' : '!'; // In GraphQL, non-null fields are indicated with !
        return `  ${key}: ${type}${optional}`;
    }
    return '';
}

// Generate the GraphQL type based on TypeScript type annotation
function generateType(typeAnnotation) {
    switch (typeAnnotation.type) {
        case 'TSStringKeyword':
        case 'TSTypeLiteral':
            return 'String';
        case 'TSNumberKeyword':
            return 'Int';
        case 'TSBooleanKeyword':
            return 'Boolean';
        case 'TSTypeReference':
            if (typeAnnotation.typeName.name === 'Scalars') {
                // Handle Scalars['SomeType']
                if (typeAnnotation.typeParameters && typeAnnotation.typeParameters.params.length > 0) {
                    const scalarType = typeAnnotation.typeParameters.params[0];
                    if (scalarType.type === 'TSLiteralType' && scalarType.literal.type === 'StringLiteral') {
                        return scalarType.literal.value;
                    }
                }
                return 'Unknown';
            } else {
                if (typeAnnotation.typeName.name === 'Maybe') {
                    if (typeAnnotation.typeParameters.params.length === 0) {
                        return 'Unknown';
                    }
                    return generateType(typeAnnotation.typeParameters.params[0]);
                } else if (typeAnnotation.typeName.name === 'Array') {
                    if (typeAnnotation.typeParameters.params.length === 0) {
                        return 'Unknown';
                    }
                    return '[' + generateType(typeAnnotation.typeParameters.params[0]) + ']';
                }
                return typeAnnotation.typeName.name;
            }
        case 'TSIndexedAccessType':
            if (typeAnnotation.objectType.typeName.name === 'Scalars') {
                // Handle Scalars['SomeType']
                if (typeAnnotation.indexType.type === 'TSLiteralType' && typeAnnotation.indexType.literal.type === 'StringLiteral') {
                    return typeAnnotation.indexType.literal.value;
                }
                return 'Unknown';
            } else {
                return typeAnnotation.objectType.typeName;
            }
        case 'TSAnyKeyword':
            return 'String';
        default:
            return 'Unknown';
    }
}
