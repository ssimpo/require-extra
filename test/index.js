/* jshint node: true, mocha: true */
/* global chai */


'use strict';

var packageInfo = require('../package.json');
var jsDoc = require('./index.json');
var requireX = require('../index.js');
var expect = require('chai').expect;
var path = require('path');


/**
 * Generate a description for a describe clause using the info in an object.
 *
 * @private
 * @param {Object} items        The object to get a description from.
 * @param {string} [itemName]   If supplied the property of items to get from.
 * @returns {string}
 */
function describeItem(items, itemName) {
  if(itemName){
    return items[itemName].name + '(): ' + items[itemName].description;
  }

  return items.name + ': ' + items.description;
}


describe(describeItem(packageInfo), function() {
  it('Should export a function with 3 method: resolve, getModule and getResolver', function() {
    expect(requireX).to.be.a('function');
    ['resolve', 'getModule', 'getResolver'].forEach(function(method) {
      expect(requireX[method]).to.be.a('function');
    });
  });

  describe(describeItem(jsDoc, 'requireAsync'), function() {
    describe('Should load module asynchronously', function() {
      it('Should return the module in node-style callback', function(done) {
        requireX('../forTests/testModule1.js', function(error, testModule1) {
          expect(testModule1.testParam).to.equal(1);
          expect(error).to.equal(null);
          done();
        });
      });

      it('Should resolve the module to returned promise', function(done) {
        requireX('../forTests/testModule1.js').then(function(testModule1) {
          expect(testModule1.testParam).to.equal(1);
          done();
        });
      });

      it('Should load dependant modules', function(done) {
        requireX('../forTests/testModule1-2.js').then(function(testModule1) {
          expect(testModule1.testParam.testParam).to.equal(2);
          done();
        });
      });

      it('Should return an error to node-style callback when module not found', function(done) {
        requireX('../forTests/testModule-1.js', function(error, testModule1) {
          expect(error).to.not.equal(null);
          expect(testModule1).to.equal(undefined);
          done();
        });
      });

      it('Should reject the returned promise when module not found', function(done) {
        requireX('../forTests/testModule-1.js').then(null, function(error) {
          expect(error).to.not.equal(null);
          done();
        });
      });
    });

    it('Should reject the promise with error when error occurs in module', function(done) {
      requireX('../forTests/testModuleWithError.js').then(null, function(error) {
        expect(error).to.not.equal(null);
        done();
      });
    });

    describe('Should load an array of modules asynchronously', function() {
      it('Should resolve the modules to returned promise', function(done) {
        requireX([
          '../forTests/testModule1.js',
          '../forTests/testModule2.js'
        ]).spread(function(testModule1, testModule2) {
          expect(testModule1.testParam).to.equal(1);
          expect(testModule2.testParam).to.equal(2);
          done();
        });
      });

      it('Should return modules in callback', function(done) {
        requireX([
          '../forTests/testModule1.js',
          '../forTests/testModule2.js'
        ], function(error, testModule1, testModule2) {
          expect(error).to.equal(null);
          expect(testModule1.testParam).to.equal(1);
          expect(testModule2.testParam).to.equal(2);
          done();
        });
      });
    });

    describe('Should be able to set the base directory manually', function() {
      it('Should be able to set directory to relative path', function(done) {
        requireX({
          dir: '../forTests'
        }, './testModule1.js').then(function(testModule1) {
          expect(testModule1.testParam).to.equal(1);
          done();
        });
      });

      it('Should be able to set directory to absolute path', function(done) {
        requireX({
          dir: path.resolve(__dirname + '/../')
        }, './forTests/testModule1.js').then(function(testModule1) {
          expect(testModule1.testParam).to.equal(1);
          done();
        });
      });
    });


  });

  describe(describeItem(jsDoc, 'resolveModulePath'), function() {
    it('', function() {
      // STUB
    });
  });

  describe(describeItem(jsDoc, 'getModule'), function() {
    it('', function() {
      // STUB
    });
  });

  describe(describeItem(jsDoc, 'getResolver'), function() {
    it('', function() {
      // STUB
    });
  });
});


