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

let path = require('path')
let assert = require('assert')
let memFs = require('mem-fs')
let editor = require('mem-fs-editor')
let store = memFs.create()
let fs = editor.create(store)
let utils = require(path.join(__dirname, '../../utils'))
let swaggerize = require(path.join(__dirname, '../../index'))
let nock = require('nock')

describe('swagger generator', function () {
  describe('generator utils', function () {
    it('extracts basename', function () {
      assert(utils.baseName('/hh/ff/test.txt') === 'test')
    })

    it('can get a reference name from a swagger $reg value', function () {
      assert(utils.getRefName('/helper/ff/test') === 'test')
    })

    it('can detect an undefined path', function () {
      assert(utils.validateFilePathOrURL() === 'Path is required')
    })

    it('can detect an invalid file path', function () {
      assert(utils.validateFilePathOrURL(path.join(__dirname, '../resources/.unknown')))
    })

    it('can detect an valid file path', function () {
      assert(utils.validateFilePathOrURL(path.join(__dirname, '../resources/person_dino.json')))
    })
  })

  describe('fail to load a Swagger document over http', function () {
    let error

    before(function () {
      // Mock the options, set up an output folder and run the generator
      nock('http://nothing')
        .get('/here')
        .reply(404)

      return utils.loadAsync('http://nothing/here')
        .catch(function (err) {
          error = err.message
        })
    })

    it('returned parsed swagger dict and loadedApi document', function () {
      assert.equal(error, 'failed to load swagger from: http://nothing/here status: 404')
    })
  })

  describe('fail to load a Swagger document from a file', function () {
    let error

    before(function () {
      // Mock the options, set up an output folder and run the generator
      return utils.loadAsync(path.join(__dirname, '../resources/.unknown'), fs)
        .catch(function (err) {
          error = err.message
        })
    })

    it('raised an error when no file was found', function () { 
      let compare= path.join(__dirname, '../resources/.unknown') + ' doesn\'t exist'
      assert.equal(error,  compare)
    })
  })

  describe('parse a Swagger document, empty formatters dict', function () {
    let formatters = {}
    let loadedApi
    let parsedSwagger

    before(function () {
      // Mock the options, set up an output folder and run the generator
      return utils.loadAsync(path.join(__dirname, '../resources/person_dino.json'), fs)
        .then(loaded => swaggerize.parse(loaded, formatters))
        .then(response => {
          loadedApi = response.loaded
          parsedSwagger = response.parsed
        })
    })

    it('returned parsed swagger dict and loadedApi document', function () {
      assert(loadedApi !== undefined)
      assert(parsedSwagger !== undefined)
    })
  })

  describe('parse a Swagger document (yaml), empty formatters dict', function () {
    let formatters = {}
    let loadedApi
    let parsedSwagger

    before(function () {
      // Mock the options, set up an output folder and run the generator
      return utils.loadAsync(path.join(__dirname, '../resources/petstore.yaml'), fs)
        .then(loaded => swaggerize.parse(loaded, formatters))
        .then(response => {
          loadedApi = response.loaded
          parsedSwagger = response.parsed
        })
    })

    it('returned parsed swagger dict and loadedApi document', function () {
      assert(loadedApi !== undefined)
      assert(parsedSwagger !== undefined)
    })
  })

  describe('parse an invalid Swagger document', function () {
    let formatters = {}
    let error = null

    before(function () {
      // Mock the options, set up an output folder and run the generator
      return utils.loadAsync(path.join(__dirname, '../resources/invalid_swagger.txt'), fs)
        .then(loaded => swaggerize.parse(loaded, formatters))
        .catch(function (err) {
          error = err
        })
    })

    it('aborted the parser with an error', function () {
      assert(error, 'Should throw an error')
      assert(error.message.match('document not in expected json or yaml format'), 'Thrown error should be about invalid document format, it was: ' + error)
    })
  })

  describe('parse a Swagger document, undefined formatters dict', function () {
    let formatters
    let loadedApi
    let parsedSwagger

    before(function () {
      // Mock the options, set up an output folder and run the generator
      return utils.loadAsync(path.join(__dirname, '../resources/person_dino.json'), fs)
        .then(loaded => swaggerize.parse(loaded, formatters))
        .then(response => {
          loadedApi = response.loaded
          parsedSwagger = response.parsed
        })
    })

    it('returned parsed swagger dict and loadedApi document', function () {
      assert(loadedApi !== undefined && typeof loadedApi === 'object')
      assert(parsedSwagger !== undefined && typeof parsedSwagger === 'object')
    })

    it('returned parsed swagger dict contains expected values', function () {
      assert(parsedSwagger.basepath === '/basepath')
      assert(Object.keys(parsedSwagger.resources).length === 2)
      assert(parsedSwagger.resources['/persons'])
      assert(parsedSwagger.resources['/dinosaurs'])
      assert(Object.keys(parsedSwagger.refs).length === 3)
      assert(parsedSwagger.refs['age'])
      assert(parsedSwagger.refs['dino'])
      assert(parsedSwagger.refs['newage'])
    })
  })

  describe('parse a Swagger document, with custom formatters', function () {
    let reformatPathToNodeExpress = function (thepath) {
      // take a swagger path and convert the parameters to express format.
      // i.e. convert "/path/to/{param1}/{param2}" to "/path/to/:param1/:param2"
      let newPath = thepath.replace(/{/g, ':')
      return newPath.replace(/}/g, '') + '-route'
    }

    let resourceNameFromPath = function (thePath) {
      // grab the first valid element of a path (or partial path) and return it.
      return thePath.match(/^\/*([^/]+)/)[1] + '-resource'
    }

    let formatters = {
      'pathFormatter': reformatPathToNodeExpress,
      'resourceFormatter': resourceNameFromPath
    }

    let loadedApi
    let parsedSwagger

    before(function () {
      // Mock the options, set up an output folder and run the generator
      return utils.loadAsync(path.join(__dirname, '../resources/person_dino.json'), fs)
        .then(loaded => swaggerize.parse(loaded, formatters))
        .then(response => {
          loadedApi = response.loaded
          parsedSwagger = response.parsed
        })
    })

    it('returned parsed swagger dict and loadedApi document', function () {
      assert(loadedApi !== undefined)
      assert(parsedSwagger !== undefined)
    })

    it('converted the resource names successfully', function () {
      assert(parsedSwagger.resources['persons-resource'])
      assert(parsedSwagger.resources['dinosaurs-resource'])
    })

    it('converted the routes successfully', function () {
      assert(parsedSwagger.resources['persons-resource'][0].method === 'get')
      assert(parsedSwagger.resources['persons-resource'][0].route === '/persons-route')
      assert(parsedSwagger.resources['dinosaurs-resource'][0].method === 'get')
      assert(parsedSwagger.resources['dinosaurs-resource'][0].route === '/dinosaurs-route')
    })
  })

  describe('parse a json Swagger document loaded from URL, empty formatters dict', function () {
    let formatters = {}
    let loadedApi
    let parsedSwagger
    let swaggerScope

    before(function () {
      swaggerScope = nock('http://dino.io')
        .get('/stuff')
        .replyWithFile(200, path.join(__dirname, '../resources/person_dino.json'))

      // Mock the options, set up an output folder and run the generator
      return utils.loadAsync('http://dino.io/stuff')
        .then(loaded => swaggerize.parse(loaded, formatters))
        .then(response => {
          loadedApi = response.loaded
          parsedSwagger = response.parsed
        })
    })

    after(function () {
      nock.cleanAll()
    })

    it('requested swagger document http', function () {
      assert(swaggerScope.isDone())
    })

    it('returned parsed swagger dict and loadedApi document', function () {
      assert(loadedApi !== undefined)
      assert(parsedSwagger !== undefined)
    })
  })

  describe('parse a yaml Swagger document loaded from URL, empty formatters dict', function () {
    let formatters = {}
    let loadedApi
    let parsedSwagger
    let swaggerScope

    before(function () {
      swaggerScope = nock('http://dino.io')
        .get('/petstore.yaml')
        .replyWithFile(200, path.join(__dirname, '../resources/petstore.yaml'))

      // Mock the options, set up an output folder and run the generator
      return utils.loadAsync('http://dino.io/petstore.yaml')
        .then(loaded => swaggerize.parse(loaded, formatters))
        .then(response => {
          loadedApi = response.loaded
          parsedSwagger = response.parsed
        })
    })

    after(function () {
      nock.cleanAll()
    })

    it('requested swagger document http', function () {
      assert(swaggerScope.isDone())
    })

    it('returned parsed swagger dict and loadedApi document', function () {
      assert(loadedApi !== undefined)
      assert(parsedSwagger !== undefined)
    })
  })

  describe('parse a yml Swagger document loaded from URL, empty formatters dict', function () {
    let formatters = {}
    let loadedApi
    let parsedSwagger
    let swaggerScope

    before(function () {
      swaggerScope = nock('http://dino.io')
        .get('/petstore2.yml')
        .replyWithFile(200, path.join(__dirname, '../resources/petstore.yaml'))

      // Mock the options, set up an output folder and run the generator
      return utils.loadAsync('http://dino.io/petstore2.yml')
        .then(loaded => swaggerize.parse(loaded, formatters))
        .then(response => {
          loadedApi = response.loaded
          parsedSwagger = response.parsed
        })
    })

    after(function () {
      nock.cleanAll()
    })

    it('requested swagger document http', function () {
      assert(swaggerScope.isDone())
    })

    it('returned parsed swagger dict and loadedApi document', function () {
      assert(loadedApi !== undefined)
      assert(parsedSwagger !== undefined)
    })
  })
})
