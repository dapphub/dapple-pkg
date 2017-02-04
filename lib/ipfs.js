'use strict';

var Ipfs = require('ipfs')
var ipfsAPI = require('ipfs-api')
// or connect with multiaddr
// TODO - deprecate
var deasync = require('deasync');
var async = require('async');
var _ = require('lodash');
var path = require('path');
var vinyl = require('vinyl-fs');
var through = require('through2');
var bl = require('bl');
const glob = require('glob')
const mapLimit = require('map-limit')
const fs = require('dapple-core/file.js')

module.exports = class IPFS {

  constructor (opts) {
    this.node = ipfsAPI('ipfs.infura.io', '5001', {protocol: 'https'});
  }

  getSync (hash, destination_path, recursive) {
    if (recursive !== undefined) {
    }
  }

  // addSync (hash, source_path, recursive) {}
  addJsonSync (json) {
    var buffer = new Buffer(JSON.stringify(json));
    return deasync(this.node.files.add.bind(this.node.files))(buffer)[0].path;
  }
  lsSync (hash) {
    var ls = (hash, cb) => {
      this.node.object.get(hash, {enc: 'base58'}, (err, node) => {
        cb(err, node.toJSON());
      });
    }
    return deasync(ls).apply(this, arguments);
  }
  catSync (hash) {
    var f = (cb) => {
      if(/ipfs:\/\//.test(hash)) hash = hash.slice(7)
      this.node.cat(hash, (err, stream) => {
        stream.pipe(bl((err, res) => {
          // TODO - maybe leave as a buffer
          cb(null, res.toString('utf8'));
        }))
      });
    }
    return deasync(f)();
  }
  isDir (hash) {
    var f = (cb) => {
      this.node.object.get(hash, {enc: 'base58'}, (err, node) => {
        cb(err, node.data[0] === 8 && node.data[1] === 1);
      });
    }
    return deasync(f)();
  }


  // IPFS-Hash -> [PATH]
  mapAddressToFileSync () {
    var self = this;
    var mapAddressToFile = function (addr, absPath, cb) {
      var node = self.lsSync(addr);
      var dirs = node.Links
      .filter(n => n.Name !== '' && self.isDir(n.Hash))
      .map(n => {
        return (cb) => {
          mapAddressToFile(n.Hash, absPath + n.Name + '/', cb);
        };
      });
      var files_ = node.Links
      .filter(n => !self.isDir(n.Hash))
      .map(n => { return {[absPath + n.Name]: n.Hash}; });
      async.parallel(dirs, (err, files) => {
        let objArr = _.flatten(files.concat(files_));
        let obj = objArr.reduce((e, o) => _.extend(o, e), {});
        cb(err, obj);
      });
    };
    // var ret = {};
    // var rootO = this.catJsonSync(rootHash);
    // console.log(JSON.stringify(rootO, false, 2));
    // rootO.reduce((o, f) => { o[] },{});
    return deasync(
      (addr, cb) => mapAddressToFile(addr, '', cb)).apply(this, arguments);
  }

  // PATH x [(PATH x IPFS-Hash)] -> Bool
  // Ckecks out all files to first directory
  checkoutFilesSync (target, fileMap) {
    var self = this;
    var checkoutFiles = function (working_dir, files, cb) {
      _.each(files, (hash, path) => {
        var data = self.catSync(hash);
        // Don't overwrite existing files
        if (fs.existsSync(path)) {
          // console.log(`File ${path} already exists.`.red);
        }
        fs.outputFileSync(working_dir + '/' + path, data);
      });
      cb();
    };
    return deasync(checkoutFiles).apply(this, arguments);
  }

  addDir(relPath, callback) {
    var absPath = path.resolve(relPath);
    var splitPath = absPath.split(path.sep);
    var dirname = splitPath[splitPath.length - 1];
    var self = this;
     glob(path.join(absPath, '/**/*'), { ignore: ['**/node_modules/**'] }, (err, res) => {
        if (err) {
          throw err
        }

        this.node.files.createAddStream((err, i) => {
          if (err) {
            throw err
          }
          const added = []

          i.on('data', (file) => {
            added.push({
              hash: file.hash,
              path: file.path
            })
          })

          i.on('end', (a,b) => {
            // var root = added.find(file => file.path === dirname).hash;
            callback(null, added);
          })

          if (res.length === 0) {
            res = [absPath]
          }

          const writeToStream = (stream, element) => {
            const index = absPath.lastIndexOf('/') + 1
            i.write({
              path: element.substring(index, element.length),
              content: fs.createReadStream(element)
            })
          }

          mapLimit(res, 50, (file, cb) => {
            fs.stat(file, (err, stat) => {
              if (err) {
                return cb(err)
              }
              return cb(null, {
                path: file,
                isDirectory: stat.isDirectory()
              })
            })
          }, (err, res) => {
            if (err) {
              throw err
            }

            res
              .filter((elem) => !elem.isDirectory)
              .map((elem) => elem.path)
              .forEach((elem) => writeToStream(i, elem))

            i.end()
          })
        })
      })
  }
  addDirSync(relPath) {
    return deasync(this.addDir.bind(this))(relPath);
  }

};
