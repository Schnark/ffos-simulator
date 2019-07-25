This is an experiment to allow running Firefox OS apps in modern browsers. This is done by a ServiceWorker that extracts the files on the fly from the app, which is a ZIP archive, and modifies them when neccessary. Installation is done by caching the ZIP.

The code works as expected (though not thoroughly tested), you can try it on https://schnark.github.io/ffos-simulator/, though the interface still needs much work.

Note that this repository is managed as described in https://xkcd.com/1597/.

