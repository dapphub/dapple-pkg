
var Installer = require('./installer.js');

module.exports = {

  cli: function (state, cli, BuildPipeline) {

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
      let env = cli['--environment'] || 'morden';
      let dappfileEnv = workspace.dappfile.environments &&
                      workspace.dappfile.environments[env] ||
                      {};
      let environment = _.merge({}, rc.environment(env), dappfileEnv);
      // TODO - find a nicer way to inherit and normalize environments: dapplerc -> dappfile -> cli settings
      req.pipelines
          .BuildPipeline({
            modules: state.modules,
            packageRoot: Workspace.findPackageRoot(),
            subpackages: cli['--subpackages'] || cli['-s']
          })
          .pipe(req.pipelines.PublishPipeline({
            dappfile: workspace.dappfile,
            ipfs: rc.environment(env).ipfs,
            path: workspace.package_root,
            web3: (rc.environment(env).ethereum || 'internal'),
            environment: environment
          }));
    } else if (cli.add) {
      workspace.addPath(cli['<path>']);
    } else if (cli.ignore) {
      workspace.ignorePath(cli['<path>']);
    }
  }
}
