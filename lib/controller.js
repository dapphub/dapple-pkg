var Installer = require('./installer.js');
var PublishPipeline = require('./publishpipeline.js');
var ethpm = require('ethpm');
var fs = require("fs")
var path = require("path")
var Dep = require("./dep.js")

module.exports = {

  cli: function (state, cli, BuildPipeline) {

    var workspace = state.workspace;

    // If the user ran the `install` command, we're going to walk the dependencies
    // in the dappfile and pull them in as git submodules, if the current package is
    // a git repository. Otherwise we'll just clone them.
    if (cli.install) {
      if(!/^ipfs:\/\/.*/.test(cli["<package>"])) {
        console.log("ERROR: installing from registry not supported yet!");
        process.exit();
      }
      let pkgHash = cli["<package>"].slice(7);
      let lock = Dep(pkgHash, path.join(state.workspace.package_root, state.workspace._dappfile.layout.packages_directory))
      // console.log(state);
      if(lock) {
        if(!state.workspace.dappfile.dependencies) {
          state.workspace.dappfile.dependencies = {}
        }
        state.workspace.dappfile.dependencies[lock.package_name] = "ipfs://"+pkgHash;
        state.workspace.writeDappfile();
        console.log(`Package "${lock.package_name}" installed!`);
      }
      // let env = 'morden';

      // let packages;
      // if (cli['<package>']) {
      //   if (!cli['<url-or-version>']) {
      //     // asume dapphub package
      //     cli['<url-or-version>'] = 'latest';
      //     // console.error('No version or URL specified for package.');
      //     // process.exit(1);
      //   }
      //   packages = {};
      //   packages[cli['<package>']] = cli['<url-or-version>'];
      // } else {
      //   packages = workspace.getDependencies();
      // }
      //
      // let success = Installer.install(state, packages, console);
      //
      // if (success && cli['--save'] && cli['<package>']) {
      //   workspace.addDependency(cli['<package>'], cli['<url-or-version>']);
      //   workspace.writeDappfile();
      // }

    } else if (cli.publish) {
      let location = path.join(state.workspace.package_root, ".gitmodules")
      let onRegistry = cli["--registry"]

      fs.access(location, fs.constants.W_OK, (err) => {
        let modules = !err && String(fs.readFileSync(location)) || "";
        if(modules.length > 0) {
          console.log(`ERROR: You have git submodules as dependencies in this project: \n${modules}\n\n
considder removing all dependencies not managed by dapple
you'll have to publish them first and installing them via \`dapple pkg install <name> <version>\``);
        } else {
          BuildPipeline({
            modules: state.modules,
            packageRoot: workspace.package_root,
            optimize: !cli['--no-optimize'],
            subpackages: cli['--subpackages'] || cli['-s'],
            state
          })
          .pipe(PublishPipeline({
            dappfile: workspace.dappfile,
            path: workspace.package_root,
            state,
            onRegistry
          }));
        }
      })
    } else if (cli.add) {
      workspace.addPath(cli['<path>']);
    } else if (cli.ignore) {
      workspace.ignorePath(cli['<path>']);
    }
  }
}
