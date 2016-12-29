'use strict';

var through = require('through2');
var _ = require('lodash');
var Ipfs = require('./ipfs.js');
// var schemas = require('../schemas.js');
var Dapphub = require('dapphub');
// var Dapphubdb = require('../dapphub_registry.js');
var Web3Factory = require('dapple-core/web3Factory.js');
var deasync = require('deasync');
var http = require('http');
var Contract = require('dapple-core/contract.js');
var ipfsd = require('ipfsd-ctl');
var EthPM = require("ethpm");
var DumbRegistry = require("ethpm/lib/registries/dumbregistry");
var tv4 = require('tv4');
var lockSpec = require('ethpm-spec/spec/release-lock-file.schema.json');
var manifestSpec = require('ethpm-spec/spec/package-manifest.schema.json');

// Will add complexity once there are live dapphub.io websites
var options = {
  hostname: 'https://4zgkma87x3.execute-api.us-east-1.amazonaws.com',
  port: 80,
  method: 'POST'
};

var createPackageHeader = function (contracts, dappfile, schema, files) {
  // TODO - validate dappfile

  var environments = _.pickBy(dappfile.environments, (value, name) => value.type === "MORDEN" || value.type === "ETH" || value.type === "ETC");

  // TODO - include solc version
  var header = {
    schema: schema,
    name: dappfile.name,
    summary: dappfile.summary || '',
    version: dappfile.version,
    solc: {
      version: '--',
      flags: '--'
    },
    tags: dappfile.tags || [],
    files,
    //root: rootHash, removing rootHash for now as we aren't using ipfs the same way
    contracts: contracts,
    dependencies: dappfile.dependencies || {},
    environments: environments || {}
  };
  // var valid = schemas.package.validate(header);
  // if (!valid) throw Error('header is not valid');
  return header;
};

module.exports = function (opts, cb) {

  var ipfs_server;
  var host;
  var registry;
  var config;
  var afterInit;

  var chaintype = opts.state.state.pointers[opts.state.state.head].type || {};

  if(chaintype == "internal") {
    console.log(`Cannot publish on ${chaintype} chains!`);
    process.exit();
  }

  var blockchainURI = "blockchain://" + (opts.state._global_state.chaintypes[chaintype].genesis).slice(2);
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
        data["./"+f.path] = "ipfs://"+f.hash
      });


      // console.log(envv);

      var _contracts = JSON.parse(String(file.contents))

      var manifest = {
        manifest_version: manifestSpec.version,
        package_name: opts.dappfile.name,
        authors: opts.dappfile.authors,
        version: opts.dappfile.version,
        license: opts.dappfile.license,
        description: opts.dappfile.description,
        keywords: opts.dappfile.keywords,
        sources: [opts.dappfile.layout.sol_sources] || ["./src"],
        dependencies: opts.dappfile.dependencies
      };

      var manifestHash = ipfs.addJsonSync(manifest);

      var mresult = tv4.validateResult(manifest, manifestSpec);

      var contracts = _.mapValues(env, (val, name) => {
        let c = _contracts[val.type.split("[")[0]];
        return {
          contract_name: name,
          address: val.value,
          bytecode: c.bytecode,
          runtime_bytecode: c.runtimeBytecode,
          abi: JSON.parse(c.interface),
          compiler: {
            type: "solidity",
            version: "0.4.5", // tmp hardcoded
            settings: {}
          }
        }
      });

      var lock = {
        sources: data,
        lock_file_version: lockSpec.version,
        package_manifest: "ipfs://" + manifestHash,
        version: opts.dappfile.version,
        chain: blockchainURI,
        contracts
      };

      var result = tv4.validateResult(lock, lockSpec);

      if(!result.valid) {
        console.log(lock);
        console.log(result);
      }

      var lockHash = ipfs.addJsonSync(lock);


      console.log(lockHash);

      // GODO - trigger aws learn


      // console.log(opts.dappfile);
      // var contracts = _.mapValues(_contracts, c => {
      //   var con = new Contract(c);
      //   return {
      //     interface: con.abi,
      //     bytecode: con.bytecode,
      //     rtcodeId: con.rtcodeId
      //   };
      // });
      // var header = createPackageHeader(contracts, opts.dappfile, files); // shemaHash

      // console.log(header);
      // console.log(header);
      // var web3 = deasync(opts.state.getRemoteWeb3.bind(opts.state))('MORDEN');

      // Add package to dapphubDb
      // var web3 = Web3Factory.JSONRPC(opts);

      // let address = '0xc5ab3dabed7820c6612564f768a0d4f682379e0e';
      // if ('registries' in opts.environment && opts.environment.registries.length > 0) {
      //   address = opts.environment.registries[0];
      // } else {
      //   address = Dapphub.getDappfile().environments.morden.objects.simplecontroller.address;
      // }
      // let registryClass = Dapphub.getClasses().DappHubSimpleController;
      // let dapphub = web3.eth.contract(JSON.parse(registryClass.interface)).at(address);

      // var dapphubdb = new Dapphubdb.Class(web3, 'morden');
      // var dapphub = dapphubdb.objects.dapphubdb;

      // var version = header.version.split('.');
      // let major = version[0];
      // let minor = version[1];
      // let patch = version[2];
      // if (!/^\d+$/.test(major) || !/^\d+$/.test(major) || !/^\d+$/.test(patch)) {
      //   throw new Error(`Problem with your semver version in header: "${header.version}" has to match /\\d+\\.\\d+\\.\\d+/ e.g. (1.5.1)`);
      // }

      // console.log(EthPM);
      cb();

      var req = http.request(_.extend(options, {
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
        console.log('problem with request: ' + e.error);
      });

      req.write(JSON.stringify({"hash": lockHash}));
      req.end();

      // var fromAccount;
      // if (typeof opts === 'object' &&
      //     'web3' in opts &&
      //     'account' in opts.web3) {
      //   fromAccount = opts.web3.account;
      // } else {
      //   fromAccount = web3.eth.coinbase || web3.eth.accounts[0];
      // }

      // PUBLISH the actual package
      // TODO - test if auth is valid and version is bigger then on the db
      // dapphub.setPackage(header.name, major, minor, patch, headerHash, {
      //   from: fromAccount,
      //   gas: 200000
      // }, function (err, res) {
      //   if (err) throw err;
      //   console.log(res);
      //   console.log(`PUBLISH ${header.name}@${major}.${minor}.${patch}: ${headerHash}`);
      //   cb();
      // });
    } else {
      this.push(file);
      cb();
    }
  });
};
