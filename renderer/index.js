require('./patches/console')
require('./patches/debug')
require('./keyboard/bindings')

const electron = require('electron')
const Cucumber = require('cucumber')

const Options = require('../cli/options')
const Output = require('./output')

const output = new Output()
const options = new Options(electron.remote.process.argv)

const { ipcRenderer: ipc } = require('electron')

process.on('unhandledRejection', function (reason) {
  output.write(reason.message + '\\n' + reason.stack)
  exitWithCode(3)
})

function exitWithCode(code) {
  if (!options.electronDebug) electron.remote.process.exit(code)
}

ipc.on('run-cucumber', () => {
  try {
    const argv = options.cucumberArgv
    const cwd = process.cwd()
    const stdout = new Output()
    new Cucumber.Cli({ argv, cwd, stdout }).run()
      .then(pass => exitWithCode(pass ? 0 : 1))
  } catch (err) {
    output.write(err.stack + '\\n')
    exitWithCode(2)
  }
})

ipc.send('ready-to-run-cucumber')
