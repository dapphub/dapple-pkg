var Combine = require('stream-combiner');
var publish = require('./publish.js');

// Takes built contracts and deploys and runs any test
// contracts among them, emitting the results to the CLI
// and passing them downstream as File objects.
// Takes built contracts and runs the deployscript
var PublishPipeline = function (opts, cb) {
  return Combine(
    publish(opts, cb)
  );
};

module.exports = PublishPipeline;
