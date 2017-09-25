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
let debug = require('debug')('ibm-openapi-support:index')
let utils = require('./utils')
let swaggerParser = require('swagger-parser')
let builderUtils = require('swaggerize-routes/lib/utils')

function ensureValidAsync (loadedSwagger) {
  debug('in ensureValidAsync')
  return swaggerParser.validate(loadedSwagger)
    .catch(function (err) {
      debug(err)
      throw new Error('does not conform to swagger specification')
    })
}

function parseSwagger (api, formatters) {
  debug('in parseSwagger')
  // walk the api, extract the schemas from the definitions, the parameters and the responses.
  let resources = {}
  let refs = []
  let basePath = api.basePath || undefined

  formatters = formatters === undefined ? {} : formatters

  let pathFormatter = formatters['pathFormatter'] || function (path) { return path }
  let resourceFormatter = formatters['resourceFormatter'] || function (route) { return route }

  Object.keys(api.paths).forEach(function (path) {
    let resource = resourceFormatter(path)

    debug('path:', path, 'becomes resource: "' + resource + '" with route: "' + pathFormatter(path) + '"')
    // for each path, walk the method verbs
    builderUtils.verbs.forEach(function (verb) {
      if (api.paths[path][verb]) {
        if (!resources[resource]) {
          resources[resource] = []
        }

        debug('parsing verb:', verb)
        // save the method and the path in the resources list.
        resources[resource].push({method: verb, route: pathFormatter(path)})
        // process the parameters
        if (api.paths[path][verb].parameters) {
          let parameters = api.paths[path][verb].parameters

          parameters.forEach(function (parameter) {
            if (parameter.schema) {
              if (parameter.schema.$ref) {
                // handle the schema ref
                let ref = utils.getRefName(parameter.schema.$ref)
                refs[ref] = api.definitions[ref]
              } else if (parameter.schema.items) {
                // handle array of schema items
                if (parameter.schema.items.$ref) {
                  let ref = utils.getRefName(parameter.schema.items.$ref)
                  // handle the schema ref
                  refs[ref] = api.definitions[ref]
                }
              }
            }
          })
        }

        // process the responses. 200 and default are probably the only ones that make any sense.
        ['200', 'default'].forEach(function (responseType) {
          if (api.paths[path][verb].responses && api.paths[path][verb].responses[responseType]) {
            let responses = api.paths[path][verb].responses
            if (responses[responseType] && responses[responseType].schema) {
              let ref
              if (responses[responseType].schema.$ref) {
                // handle the schema ref
                ref = utils.getRefName(responses[responseType].schema.$ref)
                refs[ref] = api.definitions[ref]
              } else if (responses[responseType].schema.type && responses[responseType].schema.type === 'array') {
                if (responses[responseType].schema.items && responses[responseType].schema.items.$ref) {
                  ref = utils.getRefName(responses[responseType].schema.items.$ref)
                  refs[ref] = api.definitions[ref]
                  if (responses[responseType].schema.items) {
                    // handle array of schema items
                    if (responses[responseType].schema.items.$ref) {
                      // handle the schema ref
                      ref = utils.getRefName(responses[responseType].schema.items.$ref)
                      refs[ref] = api.definitions[ref]
                    }
                  }
                }
              }
            }
          }
        })
      }
    })
  })

  let foundNewRef
  do {
    foundNewRef = false
    // now parse the schemas for child references.
    Object.keys(refs).forEach(function (schema) {
      if (refs[schema] && refs[schema].properties) {
        let properties = refs[schema].properties
        Object.keys(properties).forEach(function (property) {
          let name
          if (properties[property].$ref) {
            // this property contains a definition reference.
            name = utils.getRefName(properties[property].$ref)
            if (!refs[name]) {
              refs[name] = api.definitions[name]
              foundNewRef = true
            }
          } else if (properties[property].items && properties[property].items.$ref) {
            // this property contains a definition reference.
            name = utils.getRefName(properties[property].items.$ref)
            if (!refs[name]) {
              refs[name] = api.definitions[name]
              foundNewRef = true
            }
          }
        })
      }
    })
  } while (foundNewRef)

  let parsed = {basepath: basePath, resources: resources, refs: refs}
  return parsed
}

exports.parse = function (swaggerStr, formatters) {
  debug('in parse')
  let loaded = JSON.parse(swaggerStr)
  return ensureValidAsync(loaded)
    .then(function () {
      debug('successfully validated against schema')
      // restore the original swagger as the call to ensureValidAsync modifies the original loaded object.
      loaded = JSON.parse(swaggerStr)
      return { loaded: loaded, parsed: parseSwagger(loaded, formatters) }
    })
}
