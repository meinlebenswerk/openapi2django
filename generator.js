const SwaggerParser = require("@apidevtools/swagger-parser");
const { match } = require("assert");
const fs = require('fs');
const { type } = require("os");

// Configure this :)
const path = '../new_cellphaser/swagger.yaml'

const disclaimer = ['"""','Do NOT modify this file. It was automatically generated from the Swagger specification.', '"""']

const serializers = [];
const useBodySerializer = false;

// DjangoRest Serializers

const ref2SerializerName = (ref) => {
    const SerializerName = `${ref.split('/').slice(-1)[0]}Serializer`
    return SerializerName;
}

const findSerializer = (schema) => {
    const { $ref, type } = schema;
    if($ref) {
        const refName = $ref.split('/').slice(-1)[0];
        return `${refName}Serializer`
    } else {
        return `???: ${type}`
    }
}

// Parameter extraction

const generateHeaderParamExtractionCode = (param) => {
    const { name } = param;
    return `${name} = request.META.get('${name}')`
}

const generateBodyParamExtractionCode = (param) => {
    const { name, schema } = param;
    const code = [];

    if(useBodySerializer) {
        const serializer = findSerializer(schema);
        code.push(`${name}Serializer = ${serializer}(data=request.data)`)
        code.push(`${name} = None`)
        code.push(`if ${name}Serializer.is_valid():`)
        code.push(`\t${name} = ${name}Serializer.data`)
    }
    
    return code;
}

// Generate Views

const generateViewMethod = (options) => {
    const { method, info: { parameters }, viewName} = options;
    const requiresAuth = !!parameters.find(param => param.in === 'header' && param.name === 'token');

    const pathParameters = parameters.filter(param => param.in === 'path')
    const headerParameters = parameters.filter(param => param.in === 'header')
    const bodyParameters = parameters.filter(param => param.in === 'body')

    const allParams = useBodySerializer? parameters.map(e => e.name) : ['request',...parameters.filter(param => param.in !== 'body').map(e => e.name)]

    const kwargParams = pathParameters.map(e => e.name);
    const methodParams = ['self', 'request', ...kwargParams]

    const methodHeader = `def ${method}(${methodParams.join(', ')}):`
    const headerParamCode = headerParameters.map(generateHeaderParamExtractionCode).flat();
    const bodyParamCode = bodyParameters.map(generateBodyParamExtractionCode).flat();
    const methodCode = [...headerParamCode, ...bodyParamCode]

    // Add early return via auth-check
    if (requiresAuth) {
        methodCode.push('if not verifyToken(request):');
        methodCode.push('\treturn Response(status=401)')
    }

    // find the handler:
    methodCode.push(`handler = findHandler(\'${viewName}_${method}\')`)
    methodCode.push('if handler is not None:')
    methodCode.push(`\treturn handler(${allParams.join(', ')})`)
    methodCode.push('return Response(status=204)')

    
    return [methodHeader, ...(methodCode.map(e => `\t${e}`))]
}

const generateAPIViews = (options) => {
    const {path, info} = options;
    const methods = Object.keys(info);

    const viewName = `api${path.replace(/\//g, '_').replace(/([{}])/g, '')}`;
    const viewHeader = `class ${viewName}View(APIView):`
    const methodCode = methods.map(method => generateViewMethod({ method, info: info[method], viewName})).flat()

    return [viewHeader, ...(methodCode.map(e => `\t${e}`))]
}

const generateViewsPy = (paths) => {
    const header = [...disclaimer]
    header.push('');
    header.push('from rest_framework.views import APIView');
    header.push('from rest_framework.response import Response');
    header.push('from rest_framework.permissions import IsAuthenticated');
    header.push('from rest_framework import mixins, viewsets');
    header.push('');
    header.push('from .serializers import *');
    header.push('from . import api_implementation as implemented_handlers');
    header.push('from .api_implementation import verifyToken)');
    header.push('');
    header.push('');
    header.push('def findHandler(name):');
    header.push('\thandler = getattr(implemented_handlers, name, None)');
    header.push('\tif handler is not None and callable(handler):');
    header.push('\t\treturn handler');
    header.push('\treturn None');
    header.push('');

    const file = [...header]
    const apiViews = Object.keys(paths).map(key => generateAPIViews({path: key, info: paths[key]}))
    apiViews.forEach(view => {
        file.push('')
        file.push(...view);
        file.push('')
    });

    return file.join('\n')
}

// Generate Serializers

const resolveParents = (parent) => {
    let el = parent;
    const names = [el.name];

    while(el.parent) {
        names.push(el.parent.name)
        el = el.parent;
    }

    return names.reverse().join('__')
}

const resolveSerializer = (options) => {
    const { name, definition, parent } = options;
    const { $ref, type } = definition;

    const serializerName = `${resolveParents(options)}Serializer`
    const serializerHeader = `class ${serializerName}(serializers.Serializer):`

    if($ref) {
        return `${name} = ${ref2SerializerName($ref)}`;
    }

    switch(type) {
        case 'object':  
            // TODO -> recursive
            const elements = definition.properties? Object.keys(definition.properties) : [];
            return elements
                .map(e => `${e} = ${resolveSerializer({name: e, definition: definition.properties[e], parent: options})}`)
        case 'string':
            return `serializers.CharField()`
        case 'boolean':
            return `serializers.BooleanField()`
        case 'integer':
            return `serializers.IntegerField()`
        case 'array':
            // TODO -> recursive
            const childSerializer = resolveSerializer({name: `${name}_element`, definition: definition.items, parent: options})
            return `serializers.ListField(child=${childSerializer})`
    }
    return `Unknown: ${name} ${type}`
}

const generateSerializer = (options) => {
    const { name, definition } = options;
    console.log(definition)

    const serializerName = `${name}Serializer`
    const serializerHeader = `class ${serializerName}(serializers.Serializer):`

    const body = resolveSerializer({name, definition})
    console.log(body)

    // console.log(serializerHeader)
}

const generateSerializersPy = (definitions) => {
    console.log(definitions)
    Object.keys(definitions).forEach(key => generateSerializer({name: key, definition: definitions[key]}))
}

// Generate URL Patterns

const generatePath = (options) => {
    const { path, info, basePath } = options;
    const baseURL = basePath.replace('/', '')

    const viewName = `api${path.replace(/\//g, '_').replace(/([{}])/g, '')}View`;
    const parts = [baseURL, ...path.split('/').filter(e => !!e)]

    const reconstructedURL = parts.join('/')
    const pattern = `path('${reconstructedURL.replace('{', '<str:').replace('}', '>')}/', ${viewName}.as_view(), name="${viewName}")`

    // console.log(parts, info)
    return {
        pattern,
        parts
    }
}

const recursiveTreeSort = (tree, parent, depth) => {
    parent = parent || ''
    depth = depth || 0
    const keys = Object.keys(tree);

    const nextKeys = keys.filter(key => typeof tree[key] === 'object');
    const directKeys = keys.filter(key => typeof tree[key] === 'string');

    return [...(nextKeys.map(k => recursiveTreeSort(tree[k], '', depth + 1)).flat()),...(directKeys.map(k => tree[k]))]
}

const generateURLsPy = (paths, basePath) => {
    const patterns = Object.keys(paths).map(key => generatePath({path:key, info: paths[key], basePath}))
    // console.log(patterns)

    // Build the API url-tree
    const tree = patterns.reduce((tree, pattern) => {
        let node = tree;

        // Traverse the tree by path parts:
        const nParts = pattern.parts.length
        for(let i=0; i<nParts; i++){
            const part = pattern.parts[i]
            if(!node[part]) {
                node[part] = {}
            }
            node = node[part]
            if(i === (nParts - 1)) node.pattern = pattern.pattern
        }
        return tree;
    }, {})

    const sortedPaths = recursiveTreeSort(tree)

    const header = [...disclaimer]
    header.push('');
    header.push('from django.contrib import admin');
    header.push('from django.urls import path');
    header.push('from rest_framework import routers');
    header.push('from .views import *');
    header.push('');

    const urlpatterns = ["path('admin/', admin.site.urls)", ...sortedPaths].map(e => `\t${e},`)
    const urlspy = [...header, 'urlpatterns = [', ...urlpatterns, ']']
    return urlspy.join('\n')
}

const main = async () => {
    const api = await SwaggerParser.bundle(path, { dereference: false });

    const { basePath } = api;

    const { paths, definitions } = api;

    const viewsPy = generateViewsPy(paths);
    const urlsPy = generateURLsPy(paths, basePath)
    // const serializersPy = generateSerializersPy(definitions);

    fs.writeFileSync('views.py', viewsPy)
    fs.writeFileSync('urls.py', urlsPy)
}

main()