
var Installer = require('./installer.js');
var PublishPipeline = require('./publishpipeline.js');

module.exports = {

  cli: function (state, cli, BuildPipeline) {

    var workspace = state.workspace;

    // If the user ran the `install` command, we're going to walk the dependencies
    // in the dappfile and pull them in as git submodules, if the current package is
    // a git repository. Otherwise we'll just clone them.
    if (cli.install) {
      let env = 'morden';

      let packages;
      if (cli['<package>']) {
        if (!cli['<url-or-version>']) {
          // asume dapphub package
          cli['<url-or-version>'] = 'latest';
          // console.error('No version or URL specified for package.');
          // process.exit(1);
        }
        packages = {};
        packages[cli['<package>']] = cli['<url-or-version>'];
      } else {
        packages = workspace.getDependencies();
      }

      let success = Installer.install(state, packages, console);

      if (success && cli['--save'] && cli['<package>']) {
        workspace.addDependency(cli['<package>'], cli['<url-or-version>']);
        workspace.writeDappfile();
      }

    } else if (cli.publish) {
        BuildPipeline({
          modules: state.modules,
          packageRoot: workspace.package_root,
          subpackages: cli['--subpackages'] || cli['-s'],
          state
        })
        .pipe(PublishPipeline({
          dappfile: workspace.dappfile,
          path: workspace.package_root,
          state
        }));
    } else if (cli.add) {
      workspace.addPath(cli['<path>']);
    } else if (cli.ignore) {
      workspace.ignorePath(cli['<path>']);
    }
  }
}
