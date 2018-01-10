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
let genutil = require('./utils')
let swaggerParser = require('swagger-parser')
let builderUtils = require('swaggerize-routes/lib/utils')
let YAML = require('js-yaml')

exports.loadAsync = genutil.loadAsync

function ensureValidAsync (loadedSwagger) {
  debug('in ensureValidAsync')
  return swaggerParser.validate(loadedSwagger)
    .catch(function (err) {
      debug(err)
      throw new Error('does not conform to swagger specification')
    })
}

function getRelatedModels (api) {
  debug('in getRelatedModels')
  let modelRelations = []
  let newModel

  Object.keys(api.definitions).forEach(function (modelName) {
    debug('modelName: ', modelName)
    let properties = api.definitions[modelName].properties
    if (properties) {
      Object.keys(properties).forEach(function (prop) {
        let model = {
          modelName: undefined,
          plural: undefined,
          pluralForm: undefined
        }
        if (properties[prop].$ref) {
          newModel = genutil.getRefName(properties[prop].$ref)
          model.modelName = modelName
          model.plural = false
        } else if (properties[prop].items && properties[prop].items.$ref) {
          newModel = genutil.getRefName(properties[prop].items.$ref)
          model.modelName = modelName
          model.plural = true
          model.pluralForm = prop
        }
        if (model.modelName) {
          if (modelRelations[newModel]) {
            modelRelations[newModel].push(model)
          } else {
            modelRelations[newModel] = [model]
          }
        }
      })
    }
  })
  return modelRelations
}

function extractModelsFromResponses (operation) {
  // build a list of the models from data found in the responses sections of the swagger.
  debug('in extractModelsFromResponses')
  let models = []

  if (operation.responses) {
    Object.keys(operation.responses).forEach(responseCode => {
      debug('response:', responseCode)
      let response = operation.responses[responseCode]
      if (response.schema) {
        if (response.schema.$ref) {
          models.push(genutil.getRefName(response.schema.$ref))
        } else if (response.schema.items && response.schema.items.$ref) {
          models.push(genutil.getRefName(response.schema.items.$ref))
        }
      }
    })
  }
  return models
}

function extractModelsFromParameters (operation) {
  // build a list of the models from data found in the parameters sections of the swagger.
  debug('in extractModelsFromParameters')
  let models = []

  if (operation.parameters) {
    operation.parameters.forEach(param => {
      debug('param:', param)
      if (param.schema) {
        if (param.schema.$ref) {
          models.push(genutil.getRefName(param.schema.$ref))
        } else if (param.schema.items && param.schema.items.$ref) {
          models.push(genutil.getRefName(param.schema.items.$ref))
        }
      }
    })
  }
  return models
}

function getModelsFromPaths (api) {
  // build a list of the models within in the swagger document that we need to construct.
  debug('in getModelsFromPaths')
  let models = []

  Object.keys(api.paths).forEach(function (path) {
    Object.keys(api.paths[path]).forEach(function (verb) {
      if (!genutil.arrayContains(verb, builderUtils.verbs)) {
        return
      }
      debug('verb:', path, verb)
      let operation = api.paths[path][verb]

      if (!operation) {
        return
      }

      let pModels = extractModelsFromParameters(operation)
      let rModels = extractModelsFromResponses(operation)

      // now add the models from the parameters if they are not already in the models list
      pModels.forEach(model => {
        if (!models[model]) {
          models[model] = api.definitions[model]
        }
      })
      // now add the models from the responses if they are not already in the models list
      rModels.forEach(model => {
        if (!models[model]) {
          models[model] = api.definitions[model]
        }
      })
    })
  })
  return models
}

function getModels (api) {
  // build a list of the models within in the swagger document that we need to construct.
  debug('in getModels')

  let models = getModelsFromPaths(api)
  debug('models from paths:', models)

  // add all returned models' children into models list
  let relatedModels = getRelatedModels(api)
  debug('related models:', relatedModels)

  Object.keys(relatedModels).forEach(model => {
    if (!models[model]) {
      models[model] = api.definitions[model]
    }
  })

  Object.keys(models).forEach(model => {
    if (models[model] && models[model].properties) {
      models[model] = api.definitions[model]
    }
  })
  return models
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
                let ref = genutil.getRefName(parameter.schema.$ref)
                refs[ref] = api.definitions[ref]
              } else if (parameter.schema.items) {
                // handle array of schema items
                if (parameter.schema.items.$ref) {
                  let ref = genutil.getRefName(parameter.schema.items.$ref)
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
                ref = genutil.getRefName(responses[responseType].schema.$ref)
                refs[ref] = api.definitions[ref]
              } else if (responses[responseType].schema.type && responses[responseType].schema.type === 'array') {
                if (responses[responseType].schema.items && responses[responseType].schema.items.$ref) {
                  ref = genutil.getRefName(responses[responseType].schema.items.$ref)
                  refs[ref] = api.definitions[ref]
                  if (responses[responseType].schema.items) {
                    // handle array of schema items
                    if (responses[responseType].schema.items.$ref) {
                      // handle the schema ref
                      ref = genutil.getRefName(responses[responseType].schema.items.$ref)
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
            name = genutil.getRefName(properties[property].$ref)
            if (!refs[name]) {
              refs[name] = api.definitions[name]
              foundNewRef = true
            }
          } else if (properties[property].items && properties[property].items.$ref) {
            // this property contains a definition reference.
            name = genutil.getRefName(properties[property].items.$ref)
            if (!refs[name]) {
              refs[name] = api.definitions[name]
              foundNewRef = true
            }
          }
        })
      }
    })
  } while (foundNewRef)

  let models = getModels(api)
  let parsed = {basepath: basePath, resources: resources, refs: refs, models: models}
  return parsed
}

exports.parse = function (swaggerStr, formatters) {
  debug('in parse')
  let swaggerType = undefined
  let loaded = undefined

  try {
    loaded = JSON.parse(swaggerStr)
    swaggerType = 'json'
  } catch(e) {
    try {
      loaded = YAML.safeLoad(swaggerStr)
      swaggerType = 'yaml'
    } catch(e) {
      throw new Error('document not in expected json or yaml format')
    }
  }

  return ensureValidAsync(loaded)
    .then(function () {
      debug('successfully validated against schema')
      // restore the original swagger as the call to ensureValidAsync modifies the original loaded object.
      if ( swaggerType == "json" ) { 
        loaded = JSON.parse(swaggerStr);
      }
      else { 
        loaded = YAML.safeLoad(swaggerStr)
      }     
      return { loaded: loaded, parsed: parseSwagger(loaded, formatters), type: swaggerType }
    })
}
