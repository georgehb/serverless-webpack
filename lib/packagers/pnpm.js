'use strict';
/**
 * PNPM packager.
 */

const _ = require('lodash');
const BbPromise = require('bluebird');
const Utils = require('../utils');
const { join } = require('path');
const fse = require('fs-extra');
const fs = require('fs');

class PNPM {
  // eslint-disable-next-line lodash/prefer-constant
  static get lockfileName() {
    return 'pnpm-lock.yaml';
  }

  // eslint-disable-next-line lodash/prefer-constant
  static get mustCopyModules() {
    return false;
  }

  static copyPackageSectionNames(packagerOptions) {
    const options = packagerOptions || {};
    return options.copyPackageSectionNames || [''];
  }

  static getPackagerVersion(cwd) {
    const command = /^win/.test(process.platform) ? 'pnpm.cmd' : 'pnpm';
    const args = ['-v'];

    return Utils.spawnProcess(command, args, { cwd })
      .catch(err => {
        return BbPromise.resolve({ stdout: err.stdout });
      })
      .then(processOutput => processOutput.stdout);
  }

  static getProdDependencies(cwd, depth, packagerOptions) {
    // Get first level dependency graph
    const command = /^win/.test(process.platform) ? 'pnpm.cmd' : 'pnpm';
    const args = [
      'ls',
      '--prod', // Only prod dependencies
      '--json',
      `--depth=${depth || 1}`
    ];

    const ignoredPnpmErrors = [];

    return Utils.spawnProcess(command, args, {
      cwd: cwd
    })
      .catch(err => {
        if (err instanceof Utils.SpawnError) {
          // Only exit with an error if we have critical npm errors for 2nd level inside
          // ignoring any extra output from npm >= 7
          const lines = _.split(err.stderr, '\n');
          const errors = _.takeWhile(lines, line => line !== '{');
          const failed = _.reduce(
            errors,
            (failed, error) => {
              if (failed) {
                return true;
              }
              return (
                !_.isEmpty(error) &&
                !_.some(ignoredPnpmErrors, ignoredError => _.startsWith(error, `npm ERR! ${ignoredError.npmError}`))
              );
            },
            false
          );

          if (!failed && !_.isEmpty(err.stdout)) {
            return BbPromise.resolve({ stdout: err.stdout });
          }
          if (process.env.SLS_DEBUG) {
            console.error(`DEBUG: ${err.stdout}\nSTDERR: ${err.stderr}`);
          }
        }

        return BbPromise.reject(err);
      })
      .then(processOutput => processOutput.stdout)
      .then(depJson => BbPromise.try(() => JSON.parse(depJson)[0]));
  }

  static rebaseLockfile(pathToPackageRoot, lockfile) {
    return lockfile;
  }

  static install(cwd, packagerOptions) {
    if (packagerOptions.noInstall) {
      return BbPromise.resolve();
    }

    fse.ensureFileSync(join(cwd, 'pnpm-workspace.yaml'))

    const command = /^win/.test(process.platform) ? 'pnpm.cmd' : 'pnpm';
    const args = ['install', '--no-frozen-lockfile', '--force'];

    if (packagerOptions.ignoreScripts) {
      args.push('--ignore-scripts');
    }

    return Utils.spawnProcess(command, args, { cwd }).return();
  }

  static prune(cwd, packagerOptions, version) {
    const npmrcPath = join(cwd, '.npmrc')
    fse.writeFileSync(npmrcPath, "node-linker=hoisted\n")
    return PNPM.install(cwd, packagerOptions, version)
      .tap(() => {
        const command = /^win/.test(process.platform) ? 'pnpm.cmd' : 'pnpm';
        const args = ['rebuild'];

        return Utils.spawnProcess(command, args, { cwd }).return();
      })
  }

  static runScripts(cwd, scriptNames) {
    const command = /^win/.test(process.platform) ? 'pnpm.cmd' : 'pnpm';
    return BbPromise.mapSeries(scriptNames, scriptName => {
      const args = ['run', scriptName];

      return Utils.spawnProcess(command, args, { cwd });
    }).return();
  }
}

module.exports = PNPM;
