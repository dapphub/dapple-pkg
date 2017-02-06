var Ipfs = require('./ipfs.js');
var ipfs = new Ipfs({ipfs: {host: 'localhost', port: '5001', procotol: 'http'}});
var path = require('path')
var fs = require("fs")

const Dep = (hash, dir) => {
  let lock = JSON.parse(ipfs.catSync(hash));
  let pkgPath = path.join(dir, lock.package_name);
  ipfs.checkoutFilesSync(pkgPath, lock.sources)
  fs.writeFileSync(
    path.join(pkgPath, "Dappfile"),
`name: ${lock.package_name}
version: ${lock.version}
layout:
  build_dir: ./build
  packages_directory: ./lib
  sol_sources: ./
`)
  Object
  .keys(lock.build_dependencies || {})
  .forEach(name => {
    let hash_ = lock.build_dependencies[name];
    Dep(
      hash_,
      path.join(
        pkgPath,
        "lib"
      ))
  })
  return lock;
}

module.exports = Dep;
