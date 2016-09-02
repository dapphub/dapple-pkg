'use strict';

var _ = require('lodash');
var Dependency = require('./dependency.js');

module.exports = class Installer {
  static install (state, dependencies, logger) {
    let success = true;
    let opts = {};
    _.each(dependencies, (uri, name) => {
      try {
        logger.log('Retrieving ' + name);
        let dependency = Dependency.fromDependencyString(state, uri, name);
        success = dependency.install(opts) && success;
        logger.log('Installed ' + dependency.getName() + ' at ' +
                   dependency.installedAt);
      } catch (e) {
        success = false;
        throw e;
        logger.error(String(e));
      }
    });
    return success;
  }
};
