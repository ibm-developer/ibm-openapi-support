# ibm-openapi-support

This module is a utility to make the process of loading and parsing documents in the OpenAPI (swagger) format a simple task. The primary use case for this is code generation where a swagger document is loaded, parsed and then relavent data structures for building api endpoints are made available.

## Quick start

Swaggerize contains two modules, index.js and utils.js. They are described below: 

* __utils.loadAsync__: This utility method is used for loading a swagger document from a file path or url. The method takes two arguments and returns a dictionary with two keys, _**loaded**_ and _**parsed**_. The _**loaded**_ key contains a javascript object containing the original document. The _**parsed**_ key contains the a dictionary with parsed swagger elements. The arguments to __loadAsync__:
	- path or url to the openApi document.
	- in-memory filesystem object; only required if loading from a file path.

```javascript
var swaggerize = require('ibm-openapi-support')
var loadedApi
var parsedSwagger

var memFs = require('mem-fs')
var editor = require('mem-fs-editor')
var store = memFs.create()
var fs = editor.create(store)

return utils.loadAsync('../resources/person_dino.json', fs)
  .then(loaded => swaggerize.parse(loaded, formatters))
  .then(response => {
    loadedApi = response.loaded
    parsedSwagger = response.parsed
  })
```

* __index.parse__: This method is used to parse the swagger conument and build a dictionary of structures that contain the routes, resources and basepath required for generating API code. The parse method will use the supplied formatters to modify the path and the resource. This method takes two parameters:
	- stringified OpenApi (swagger) document.
	- formatters dictionary: This contains formatters for the path _**pathFormatter**_ and for the resource _**resourceFormatter**_ The formatters take a path parameter and return a string.

```javascript
var swaggerize = require('ibm-openapi-support')
var swaggerizeUtils = require('ibm-openapi-support/utils')

var swaggerDocument = 'your OpenApi (swagger) document goes here' 

function reformatPathToNodeExpress (thepath) {
  // take a swagger path and convert the parameters to express format.
  // i.e. convert "/path/to/{param1}/{param2}" to "/path/to/:param1/:param2"
  var newPath = thepath.replace(/{/g, ':')
  return newPath.replace(/}/g, '')
}

function resourceNameFromPath (thePath) {
  // grab the first valid element of a path (or partial path) and return it.
  return thePath.match(/^\/*([^/]+)/)[1]
}

this.parsedSwagger = undefined;
var formatters = {
  'pathFormatter': helpers.reformatPathToNodeExpress,
  'resourceFormatter': helpers.resourceNameFromPath
}

if (swaggerDocument !== undefined) {
  return swaggerize.parse(swaggerDocument, formatters)
  .then(response => {
    this.loadedApi = response.loaded
    this.parsedSwagger = response.parsed
  })
  .catch(err => {
    err.message = 'failed to parse document ' + err.message
    throw err
  })
}

if (this.parsedSwagger) {
  Object.keys(this.parsedSwagger.resources).forEach(function(resource) {
    var context = {
      'resource': resource,
      'routes': this.parsedSwagger.resources[resource],
      'basepath': this.parsedSwagger.basepath
    }
    this.fs.copyTpl(this.templatePath('fromswagger/routers/router.js'), this.destinationPath(`server/routers/${resource}.js`), context)
    this.fs.copyTpl(this.templatePath('test/resource.js'), this.destinationPath(`test/${resource}.js`), context)
  }.bind(this))
}
```
