'use strict';

var through = require('through2');
var _ = require('lodash');
var Ipfs = require('./ipfs.js');
// var schemas = require('../schemas.js');
var Dapphub = require('dapphub');
// var Dapphubdb = require('../dapphub_registry.js');
var Web3Factory = require('dapple-core/web3Factory.js');
var Web3 = require("web3")
var deasync = require('deasync');
var https = require('https');
var Contract = require('dapple-core/contract.js');
var ipfsd = require('ipfsd-ctl');
var EthPM = require("ethpm");
var tv4 = require('tv4');
var lockSpec = require('ethpm-spec/spec/release-lockfile.spec.json');
var ethpmabi = require('../spec/ethpm-registry-abi.json');
var semver = require("semver")
// var manifestSpec = require('ethpm-spec/spec/package-manifest.schema.json');

// Will add complexity once there are live dapphub.io websites
var options = {
  hostname: '4zgkma87x3.execute-api.us-east-1.amazonaws.com',
  // port: 443,
  method: 'POST'
};

// var createPackageHeader = function (contracts, dappfile, schema, files) {
//   // TODO - validate dappfile
//
//   var environments = _.pickBy(dappfile.environments, (value, name) => value.type === "MORDEN" || value.type === "ETH" || value.type === "ETC");
//
//   // TODO - include solc version
//   var header = {
//     schema: schema,
//     name: dappfile.name,
//     summary: dappfile.summary || '',
//     version: dappfile.version,
//     solc: {
//       version: '--',
//       flags: '--'
//     },
//     tags: dappfile.tags || [],
//     files,
//     //root: rootHash, removing rootHash for now as we aren't using ipfs the same way
//     contracts: contracts,
//     TODO - dependencies must point to ipfs lock files
//     dependencies: dappfile.dependencies || {},
//     dependencies: {},
//     environments: environments || {}
//   };
//   // var valid = schemas.package.validate(header);
//   // if (!valid) throw Error('header is not valid');
//   return header;
// };

module.exports = function (opts, cb) {

  var ipfs_server;
  var host;
  var registry;
  var config;
  var afterInit;

  var chaintype = opts.state.state.pointers[opts.state.state.head].type || {};

  var env = opts.state.state.pointers[opts.state.state.head].env || {};

  // ipfsd.disposableApi(function (err, ipfs) {
  //   ipfs_server = ipfs;
  //
  //   host = new EthPM.hosts.IPFS({
  //     host: ipfs_server.apiHost,
  //     port: ipfs_server.apiPort
  //   });
  //
  //   registry = new DumbRegistry();
  //
  //   config = EthPM.configure(opts.path, host, registry);
  //   cb();
  // })


  var ipfs = new Ipfs({ipfs: {host: 'localhost', port: '5001', procotol: 'http'}});
  var processClasses = function (_classes) {
    var classes = {};
    _.each(JSON.parse(_classes), (obj, key) => {
      var Class = {
        bytecode: obj.bytecode,
        interface: JSON.parse(obj.interface),
        solidity_interface: obj.solidity_interface
      };
      try {
        var link = ipfs.addJsonSync(Class);
      } catch (e) {
        console.log(e);
        // console.log(`ERROR: Could not connect to ipfs: is the daemon running on "${opts.ipfs.host}:${opts.ipfs.port}"?`);
        process.exit();
      }
      classes[key] = link;
    });
    return classes;
  };

  return through.obj(function (file, enc, cb) {
    if (file.path === 'classes.json') {
      // Build Package Header
      // var contracts = processClasses(String(file.contents));
      var files = ipfs.addDirSync(opts.state.workspace.getSourcePath());
      var data = {};
      files.filter(f => /\.sol$/.test(f.path)).forEach(f => {
        data["."+f.path.slice(f.path.indexOf("/"))] = "ipfs://"+f.hash
      });

      var _contracts = JSON.parse(String(file.contents))

      var contract_types = {};
      const learnContractType = (name => {
        let c = _contracts[name];
        contract_types[name] = {
          contract_name: name,
          bytecode: c.bytecode,
          // runtime_bytecode: c.runtimeBytecode,
          abi: JSON.parse(c.interface),
          compiler: {
            type: "solidity",
            version: "0.4.5", // tmp hardcoded
            settings: {}
          }
        }
      });

      var deployments = {};

      const linkFrom = function (type) {
        let chain_id = type.genesis.slice(2);
        let block_hash = (type.block2m && type.block2m.slice(2)) || chain_id;
        return `blockchain://${chain_id}/block/${block_hash}`
      }

      Object
      .keys(opts.dappfile.environments)
      .forEach(envname => {
        let environment = opts.dappfile.environments[envname];
        let env = environment.objects;
        let type = environment.type;
        let chaintype = opts.state._global_state.chaintypes[type];
        if(!chaintype) {
          console.log(`WARN: cant find chaintype ${envname}:${type}, considder adding it to ~/.dapple/config`);
          return null;
        }
        Object
        .keys(env)
        .forEach(objectname => {
          let obj = env[objectname];
          let link = linkFrom(chaintype);
          if(!(link in deployments)) deployments[link] = {};
          learnContractType(obj.type.split("[")[0]);
          deployments[link][objectname] = {
            contract_type: obj.type.split("[")[0],
            address: obj.value
          }
        })
      })
      let version = opts.dappfile.version;
      if(typeof version === "number" || version.indexOf(".") === -1) {
        version = "0.1.0"-version
      }

      var lock = {
        package_name: opts.dappfile.name,
        sources: data,
        lockfile_version: lockSpec.version,
        version: opts.dappfile.version.toString(),
        contract_types,
        deployments, // TODO
        meta: {
          authors: opts.dappfile.authors || [],
          license: opts.dappfile.license || 'Apache-2.0',
          description: opts.dappfile.description || '',
          keywords: opts.dappfile.keywords || []
        },
        // TODO - dependencies link to ipfs hashes, not
        //        version numbers
        build_dependencies: opts.dappfile.dependencies
        // build_dependencies: {}
      };

      console.log(JSON.stringify(lock, false, 2))

      var result = tv4.validateResult(lock, lockSpec);

      if(!result.valid) {
        // console.log(result);
        console.log(JSON.stringify(lock, false, 2));
        console.log("\n-------\n");
        console.log("ERROR", result.error.message);
        console.log("in", result.error.dataPath);
        console.log("in", result.error.schemaPath);
      }

      var lockHash = ipfs.addJsonSync(lock);


      // GODO - trigger aws learn

      cb();

      var req = https.request(_.extend(options, {
        path: '/dev/learn',
        headers: {
          "content-type": "application/json"
        }
      }), function(res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
          console.log(chunk);
        });
        res.on('end', function () {
          console.log("Package published to Dapphub.io")
        });
      });

      req.on('error', function(e) {
        console.log('problem with request: ' + e);
      });

      req.write(JSON.stringify({"hash": lockHash}));
      req.end();

      let environment = opts.state.state.pointers[opts.state.state.head];
      if(opts.onRegistry) {
        if(environment.type.toLowerCase() !== "ropsten") {
          console.log("WARN: can only publish to ethpm from ropsten environment. Consider checking out a ROPSTEN chain and publish again.")
        } else {
          var web3 = new Web3(new Web3.providers.HttpProvider(`http://${environment.network.host}:${environment.network.port}`))
          web3.defaultAccount = environment.defaultAccount;
          let EthPm = web3.eth.contract(ethpmabi)
          let ethpm = EthPm.at("0x8011df4830b4f696cd81393997e5371b93338878".toUpperCase())
          let name = lock.package_name;
          let major = semver.major(version)
          let minor = semver.minor(version)
          let patch = semver.patch(version)
          let prerelease = semver.prerelease(version)
          ethpm.release(name, major, minor, patch, prerelease, "", "ipfs://" + lockHash, {
            from: environment.defaultAccount
          },(e,r) => {
            console.log("published to ethpm!");
            // console.log(e,r)
          })
        }
      } else {
        console.log(lock);
        console.log("ipfs://"+lockHash)
      }

    } else {
      this.push(file);
      cb();
    }
  });
};
