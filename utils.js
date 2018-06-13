/*
 * Copyright IBM Corporation 2017
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict'

let debug = require('debug')('ibm-openapi-support:utils')
let format = require('util').format
let fs = require('fs')
let path = require('path')
let Promise = require('bluebird')
let request = require('request')
let requestAsync = Promise.promisify(request)
let YAML = require('js-yaml')

exports.baseName = function (thePath) {
  // get the base file name without extension from a full path.
  return path.basename(thePath).split('.')[0]
}

exports.getRefName = function (ref) {
  return ref.split('/').pop()
}

exports.getIdName = function (ref) {
  // get the id name from the end of the path, if it exists.
  let name = ref.split('{').pop()
  if (name.endsWith('}')) {
    name = name.split('}')[0]
  } else {
    name = undefined
  }
  return name
}

exports.arrayContains = function (search, array) {
  // return true/false if search is/not found in array.
  return array.indexOf(search) > -1
}

exports.validateFilePathOrURL = function (thePath) {
  if (!thePath) {
    return 'Path is required'
  }

  // ensure file actually exists if using local file path
  let localMatch = /^\w+|^\/|^\.\.?\//.test(thePath)
  let remoteMatch = /^https?:\/\/\S+/.test(thePath)
  if (localMatch && remoteMatch) {
    return true
  } else if (localMatch && !remoteMatch) {
    return fs.existsSync(thePath) ? true : format('The following path does not exist: %s', thePath)
  }
  return format('The following is not a valid path: %s', thePath)
}

function loadHttpAsync (uri) {
  debug('in loadHttpAsync')

  return requestAsync({ method: 'GET', uri: uri })
    .then(result => {
      if (result.statusCode !== 200) {
        debug('get request returned status:', result.statusCode)
        throw new Error('failed to load swagger from: ' + uri + ' status: ' + result.statusCode)
      }
      return result.body
    })
}

function loadFileAsync (filePath, memfs) {
  debug('in loadFileAsync')

  return Promise.try(() => memfs.read(filePath))
    .then(data => {
      if (data === undefined) {
        // when file exists but cannot read content.
        debug('cannot read file contents', filePath)
        throw new Error('failed to load swagger from: ' + filePath)
      }
      return data
    })
}

exports.loadAsync = function (thePath, memfs) {
  let isHttp = /^https?:\/\/\S+/.test(thePath)
  let isYaml = (thePath.endsWith('.yaml') || thePath.endsWith('.yml'))
  return (isHttp ? loadHttpAsync(thePath) : loadFileAsync(thePath, memfs))
    .then(data => isYaml ? JSON.stringify(YAML.load(data)) : data)
}

function mergeRequired (child, parent) {
  // merge the required array fields from parent and child.
  let result = []
  let reqset = new Set(child)
  parent.forEach(field => {
    reqset.add(field)
  })
  reqset.forEach(field => {
    result.push(field) 
  })
  return result
}

function mergeProperties (child, parent) {
  // merge the properties fields from parent and child.
  let result = {}
  Object.keys(child).forEach(key => {
    result[key] = child[key]
  })
  Object.keys(parent).forEach(key => {
    result[key] = parent[key]
  })
  return result
}

exports.processAllOf = function (models, name, visited) {
  let result = {required: [], properties: {}}
  let model = models[name]

  if (model.allOf) {
    // this has an allOf section, so walk it for each reffed model.
    model.allOf.forEach(elem => {
      let ref = elem['$ref']
      if (ref) {
        // then get the name of a reffed model.
        let refModelName = ref.split('/').pop()

        // check that this ref has not been seen before (not cyclic).
        if (visited.indexOf(refModelName) == -1) {
          // remember its been visited.
          visited.push(refModelName)

          // and process it
          let allOfResult = this.processAllOf(models, refModelName, visited)

          // now combine the result from processAllOf with the required and properties of this model
          result.required = mergeRequired(result.required, allOfResult.required)
          result.properties = mergeProperties(result.properties, allOfResult.properties)
        }
      }
      // combine any allOf required elements.
      if (elem.required) {
        result.required = mergeRequired(result.required, elem.required)
      }
      // combine any allOf properties elements.
      if (elem.properties) {
        result.properties = mergeProperties(result.properties, elem.properties)
      }
    })
  }
  // combine any regular required elements.
  if (model.required) {
    result.required = mergeRequired(result.required, model.required)
  }
  if (model.properties) {
    result.properties = mergeProperties(result.properties, model.properties)
  }
  return result
}
