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
